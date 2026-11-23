import { useCallback, useEffect, useState } from "react";
import type { ZCodeAgentSessionTarget } from "@zcode/client/agent";
import type { ModelSelection } from "@zcode/shared/model-selection";
import { createUuid } from "@zcode/shared/uuid";
import {
  COMMAND_QUERY_UNAVAILABLE_REASON,
  PROTOCOL_V4_LIMITS,
  webCommandAckSchema,
  webCommandsQueryResultSchema,
  type CommandAck,
  type CommandKey,
  type CommandPayloadMap,
  type CommandEnvelope,
} from "@zcode/shared/zcode-protocol-v4";
import type { AgentConnection } from "./useAgentConnection.js";

type StreamingBehavior = NonNullable<CommandPayloadMap["sendText"]["streamingBehavior"]>;

export interface ChatDraft {
  text: string;
  version: number;
  receipt?: "sending" | "checking" | "unknown";
  error?: string;
  localResult?: { name: string; output: string };
}

const emptyDraft: ChatDraft = { text: "", version: 0 };
const draftKeyOf = (target: ZCodeAgentSessionTarget | null) =>
  target
    ? JSON.stringify([target.workspaceIdentity ?? target.workspacePath, target.sessionId])
    : "";

interface InputState {
  target: ZCodeAgentSessionTarget | null;
  viewVersion: number;
  drafts: Record<string, ChatDraft>;
  directory: string;
  draftModel: ModelSelection | null;
}

type WorkspaceTarget = Pick<ZCodeAgentSessionTarget, "workspacePath" | "workspaceIdentity">;

export function conversationCommand(
  connection: AgentConnection,
  workspace: WorkspaceTarget,
  sessionId: string | null,
  type: CommandEnvelope["type"],
  payload: unknown,
  baseRevision?: number,
) {
  const envelope: Omit<CommandEnvelope, "workspace"> = {
    commandId: createUuid(),
    clientId: connection.clientId,
    issuedAt: Date.now(),
    sessionId,
    type,
    payload,
    ...(baseRevision === undefined ? {} : { baseRevision }),
  };
  return { ...workspace, envelope };
}

type CommandRequest = ReturnType<typeof conversationCommand>;
interface PendingSend {
  command: CommandKey;
  workspace: WorkspaceTarget;
  sentOn: AgentConnection;
  checkingOn?: AgentConnection;
  key: string;
  draftVersion: number;
  viewVersion: number;
}

async function withReceiptDeadline<T>(request: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Command receipt timed out")),
          PROTOCOL_V4_LIMITS.conversationQueryTimeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitConversationCommand(
  connection: AgentConnection,
  request: CommandRequest,
) {
  const ack = webCommandAckSchema.parse(
    await withReceiptDeadline(connection.agent.sendConversationCommandV4(request)),
  );
  if (ack.commandId !== request.envelope.commandId) throw new Error("Command receipt mismatch");
  return ack;
}

function updateDraft(current: InputState, key: string, update: (draft: ChatDraft) => ChatDraft) {
  const previous = current.drafts[key] ?? emptyDraft;
  const next = update(previous);
  return next === previous ? current : { ...current, drafts: { ...current.drafts, [key]: next } };
}

export function useChatInput(connection: AgentConnection | null, onActivity: () => void) {
  const [state, setState] = useState<InputState>({
    target: null,
    viewVersion: 0,
    drafts: {},
    directory: ".",
    draftModel: null,
  });
  // This map owns the original RPC identity and prevents a second dispatch before React renders.
  const [pending] = useState(() => new Map<string, PendingSend>());
  const key = draftKeyOf(state.target);
  const draft = state.drafts[key] ?? emptyDraft;

  const updateReceipt = useCallback(
    (send: PendingSend, receipt: ChatDraft["receipt"]) => {
      if (pending.get(send.key) !== send) return;
      setState((current) => updateDraft(current, send.key, (draft) => ({ ...draft, receipt })));
    },
    [pending],
  );

  const finish = useCallback(
    (send: PendingSend, ack: CommandAck | undefined, error?: string) => {
      if (pending.get(send.key) !== send) return;
      if (
        ack &&
        (ack.commandId !== send.command.commandId ||
          ack.reasonCode === COMMAND_QUERY_UNAVAILABLE_REASON)
      ) {
        updateReceipt(send, "unknown");
        return;
      }
      const accepted = ack?.status === "accepted" || ack?.status === "duplicate";
      const created =
        accepted && ack.result?.type === "createSession" && ack.result.workspace
          ? { ...ack.result.workspace, sessionId: ack.result.sessionId }
          : undefined;
      if (accepted && send.command.sessionId === null && !created) {
        updateReceipt(send, "unknown");
        return;
      }
      const localResult = accepted && ack.result?.type === "localCommand" ? ack.result : undefined;
      pending.delete(send.key);
      setState((current) => {
        const previous = current.drafts[send.key] ?? emptyDraft;
        const matchesDraft = previous.version === send.draftVersion;
        const openCreated = created && matchesDraft && current.viewVersion === send.viewVersion;
        const next = updateDraft(current, send.key, (draft) => ({
          ...draft,
          text: accepted && matchesDraft ? "" : draft.text,
          receipt: undefined,
          error: accepted ? undefined : (error ?? ack?.message ?? "消息未发送，请重试。"),
          localResult: localResult ?? draft.localResult,
        }));
        return openCreated
          ? { ...next, target: created, viewVersion: current.viewVersion + 1, draftModel: null }
          : next;
      });
      if (accepted) onActivity();
    },
    [onActivity, pending, updateReceipt],
  );

  const checkReceipt = useCallback(
    async (candidate: AgentConnection, send: PendingSend) => {
      if (
        candidate.clientId !== send.sentOn.clientId ||
        send.checkingOn === candidate ||
        pending.get(send.key) !== send
      )
        return;
      send.checkingOn = candidate;
      updateReceipt(send, "checking");
      try {
        const { results } = webCommandsQueryResultSchema.parse(
          await withReceiptDeadline(
            candidate.agent.queryConversationCommandsV4({
              ...send.workspace,
              commands: [send.command],
            }),
          ),
        );
        if (send.checkingOn !== candidate) return;
        const result = results.find(
          ({ key }) =>
            key.commandId === send.command.commandId && key.sessionId === send.command.sessionId,
        )?.result;
        if (result && result !== "unknown") finish(send, result);
        else updateReceipt(send, "unknown");
      } catch {
        if (send.checkingOn === candidate) updateReceipt(send, "unknown");
      } finally {
        if (send.checkingOn === candidate) send.checkingOn = undefined;
      }
    },
    [finish, pending, updateReceipt],
  );

  // On a new connection query each outstanding command with its original scope, never re-send it.
  useEffect(() => {
    if (!connection) return;
    for (const send of pending.values()) {
      if (send.sentOn !== connection) void checkReceipt(connection, send);
    }
  }, [checkReceipt, connection, pending]);

  async function send(
    text: string,
    model: ModelSelection | null,
    streamingBehavior?: StreamingBehavior,
  ) {
    if (!connection || pending.has(key) || !text.trim()) return;
    const target = state.target;
    const workspace = target
      ? { workspacePath: target.workspacePath, workspaceIdentity: target.workspaceIdentity }
      : { workspacePath: state.directory.trim() };
    if (!workspace.workspacePath || (!target && !model)) return;
    const request = target
      ? conversationCommand(connection, workspace, target.sessionId, "sendText", {
          text,
          ...(streamingBehavior && { streamingBehavior }),
        })
      : conversationCommand(connection, workspace, null, "createSession", {
          config: { modelSelection: model },
          firstInput: { text },
        });
    const draftVersion = draft.version + 1;
    const attempt: PendingSend = {
      command: { commandId: request.envelope.commandId, sessionId: request.envelope.sessionId },
      workspace,
      sentOn: connection,
      key,
      draftVersion,
      viewVersion: state.viewVersion,
    };
    pending.set(key, attempt);
    setState((current) =>
      updateDraft(current, key, (previous) => ({
        ...previous,
        text,
        version: draftVersion,
        receipt: "sending",
        error: undefined,
      })),
    );
    try {
      finish(attempt, await submitConversationCommand(connection, request));
    } catch (cause) {
      if (
        cause instanceof Error &&
        "code" in cause &&
        cause.code === "fault.chat.invalidDirectory"
      ) {
        finish(attempt, undefined, cause.message);
      } else if (!attempt.checkingOn) {
        updateReceipt(attempt, "unknown");
      }
    }
  }

  return {
    target: state.target,
    draftKey: key,
    draft,
    directory: state.directory,
    draftModel: state.draftModel,
    select: (target: ZCodeAgentSessionTarget | null) =>
      setState((current) => {
        if (draftKeyOf(current.target) === draftKeyOf(target)) return current;
        const firstDraft = current.drafts[""];
        const directory =
          !target && current.target && !firstDraft?.text && !firstDraft?.receipt
            ? current.target.workspacePath
            : current.directory;
        return { ...current, target, directory, viewVersion: current.viewVersion + 1 };
      }),
    setDirectory: (directory: string) =>
      setState((current) => {
        const next = { ...current, directory };
        return directory.trim() === current.directory.trim()
          ? next
          : updateDraft(next, "", (draft) => ({ ...draft, version: draft.version + 1 }));
      }),
    setDraftModel: (draftModel: ModelSelection) =>
      setState((current) => ({ ...current, draftModel })),
    setText: (text: string) =>
      setState((current) =>
        updateDraft(current, key, (draft) =>
          draft.text === text ? draft : { ...draft, text, version: draft.version + 1 },
        ),
      ),
    send,
    checkReceipt: () => {
      const attempt = pending.get(key);
      if (connection && attempt) void checkReceipt(connection, attempt);
    },
  };
}
