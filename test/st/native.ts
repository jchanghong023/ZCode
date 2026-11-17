import {
  COMMANDS_REQUIRING_BASE_REVISION,
  ROW_TARGETING_COMMANDS,
  TopicWireFrameAssembler,
  V4_WIRE_PROTOCOL_VERSION,
  commandAckSchema,
  conversationTopicFrameSchema,
  helloMessageSchema,
  type CommandAck,
  type CommandEnvelope,
  type CommandType,
  type ConversationRowTarget,
  type ConversationSnapshot,
  type ConversationTopicFrame,
} from "@zcode/shared/zcode-protocol-v4";
import type { AIReqRemoteWorkflow } from "@zcode/services/aireq";
import { unique, waitUntil, type STClient } from "./client.js";

export interface NativeSendOptions {
  commandId?: string;
  baseRevision?: number;
  baseLogEpoch?: string;
  target?: ConversationRowTarget;
}
export interface NativeSession {
  sessionId: string;
  subscriptionId: string;
  workspace: { workspacePath: string; workspaceIdentity?: string };
  frames: ConversationTopicFrame[];
  send(type: string, payload: unknown, options?: NativeSendOptions): Promise<CommandAck>;
  snapshot(): Promise<ConversationSnapshot>;
  waitIdle(): Promise<ConversationSnapshot>;
  close(): Promise<void>;
}

/** Only public RPC and protocol codec are used; no server owner or UI controller. */
export async function openNative(c: STClient, remote: AIReqRemoteWorkflow): Promise<NativeSession> {
  if (!remote.session || !remote.workspace.path || remote.workspace.kind === "unavailable") {
    throw new Error(
      "ST prerequisite blocked: public proposal has no usable native session/workspace",
    );
  }
  const service = c.services.zcodeAgentService;
  const hello = helloMessageSchema.parse(await service.helloConversationV4());
  if (hello.protocolVersion !== V4_WIRE_PROTOCOL_VERSION)
    throw new Error("ST native protocol mismatch");
  await service.initializeConversationV4({
    kind: "clientHello",
    protocolVersion: V4_WIRE_PROTOCOL_VERSION,
    clientId: c.identity.clientId,
    clientKind: "web",
    appVersion: "st-contract",
  });
  const sessionId = remote.session.sessionId;
  const workspace = {
    workspacePath: remote.workspace.path,
    workspaceIdentity: remote.workspace.identity,
  };
  const frames: ConversationTopicFrame[] = [];
  const assembler = new TopicWireFrameAssembler(conversationTopicFrameSchema);
  let fault: Error | undefined;
  let subscriptionId = "";
  let closed = false;
  const listener = service.onDynamicConversationFrame(workspace)((candidate) => {
    if (closed || candidate.topic !== `conversation/${sessionId}`) return;
    for (const event of assembler.accept(candidate)) {
      if (event.kind === "fault") {
        fault = new Error(`ST conversation frame assembly failed: ${event.fault.reasonCode}`);
      } else {
        frames.push(event.frame);
      }
    }
  });
  try {
    const subscribed = await service.subscribeConversationV4({
      ...workspace,
      sessionId,
      visibility: "foreground",
    });
    subscriptionId = subscribed.ack.subscriptionId;
    await waitUntil(
      "initial native snapshot",
      async () => {
        if (fault) throw fault;
        return frames.find(
          (frame) => frame.subscriptionId === subscriptionId && frame.payload.kind === "snapshot",
        );
      },
      Boolean,
    );
  } catch (error) {
    listener.dispose();
    assembler.clear();
    if (subscriptionId) await service.unsubscribeConversationV4({ ...workspace, subscriptionId });
    throw error;
  }
  const issuedAtByCommand = new Map<string, number>();
  const snapshot = async (): Promise<ConversationSnapshot> => {
    if (closed) throw new Error("ST native session is closed");
    const from = frames.length;
    const response = await service.resyncConversationV4({
      ...workspace,
      subscriptionId,
      base: null,
      forceSnapshot: true,
    });
    if (response.ack.subscriptionId !== subscriptionId)
      throw new Error("ST resync changed owned subscription");
    const frame = await waitUntil(
      "native forceSnapshot delivery",
      async () => {
        if (fault) throw fault;
        return frames
          .slice(from)
          .findLast(
            (item) => item.subscriptionId === subscriptionId && item.payload.kind === "snapshot",
          );
      },
      Boolean,
    );
    if (!frame || frame.payload.kind !== "snapshot") throw new Error("ST snapshot missing");
    return frame.payload.snapshot;
  };
  return {
    sessionId,
    workspace,
    subscriptionId,
    frames,
    snapshot,
    async send(type, payload, options = {}) {
      if (closed) throw new Error("ST native session is closed");
      if (fault) throw fault;
      const commandType = type as CommandType;
      // 普通发送不要求 CAS；无条件 resync 会在测试辅助中耗尽真实的运行/排队窗口。
      // 只补协议要求且调用方未显式提供的水位，保留故意传入的 0 或旧 epoch。
      const needsRevision = COMMANDS_REQUIRING_BASE_REVISION.has(commandType);
      const needsEpoch = ROW_TARGETING_COMMANDS.has(commandType);
      const current =
        (needsRevision && options.baseRevision === undefined) ||
        (needsEpoch && options.baseLogEpoch === undefined)
          ? await snapshot()
          : undefined;
      const commandId = options.commandId ?? unique("native-command");
      const issuedAt = issuedAtByCommand.get(commandId) ?? Date.now();
      issuedAtByCommand.set(commandId, issuedAt);
      const envelope: CommandEnvelope = {
        workspace: {
          ...workspace,
          workspaceKey: workspace.workspaceIdentity ?? workspace.workspacePath,
        },
        commandId,
        clientId: c.identity.clientId,
        sessionId,
        type: commandType,
        issuedAt,
        payload: options.target ? { ...(payload as object), target: options.target } : payload,
        ...(options.baseRevision !== undefined || needsRevision
          ? { baseRevision: options.baseRevision ?? current!.revision }
          : {}),
        ...(options.baseLogEpoch !== undefined || needsEpoch
          ? { baseLogEpoch: options.baseLogEpoch ?? current!.logEpoch }
          : {}),
      };
      return commandAckSchema.parse(
        await service.sendConversationCommandV4({ ...workspace, envelope }),
      );
    },
    async waitIdle() {
      return waitUntil(
        "native turn completion",
        snapshot,
        (value) => !["running", "prewarming"].includes(value.control.phase),
      );
    },
    async close() {
      if (closed) return;
      try {
        await service.unsubscribeConversationV4({ ...workspace, subscriptionId });
      } finally {
        closed = true;
        listener.dispose();
        assembler.clear();
      }
    },
  };
}

export function requireAccepted(ack: CommandAck): void {
  if (!["accepted", "duplicate"].includes(ack.status)) {
    throw new Error(
      `ST command did not succeed: ${ack.status}/${ack.reasonCode ?? "missing-reason"}`,
    );
  }
}

export function requireRejected(ack: CommandAck): void {
  if (!["rejected", "stale", "failed"].includes(ack.status) || !ack.reasonCode) {
    throw new Error(`ST expected explicit rejection, received ${ack.status}`);
  }
}
