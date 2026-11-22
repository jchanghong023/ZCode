import {
  COMMANDS_REQUIRING_BASE_REVISION,
  TopicWireFrameAssembler,
  V4_WIRE_PROTOCOL_VERSION,
  commandAckSchema,
  conversationCommandCatalogEntrySchema,
  conversationTopicFrameSchema,
  webConversationResyncResultSchema,
  webConversationSubscribeResultSchema,
  webHelloMessageSchema,
  type CommandAck,
  type CommandEnvelope,
  type ConversationCommandCatalogEntry,
  type CommandType,
  type ConversationSnapshot,
  type ConversationTopicFrame,
} from "@zcode/shared/zcode-protocol-v4";
import { expect } from "vitest";
import type { AIReqRemoteWorkflow } from "@zcode/services/aireq";
import type { IZCodeAgentService } from "@zcode/services";
import type { WebAIReqAgent } from "@zcode/services/zcode-agent";
import { unique, waitUntil, type STClient } from "./client.js";

export interface NativeSendOptions {
  commandId?: string;
  baseRevision?: number;
  sessionId?: string;
  omitPreconditions?: boolean;
}
export interface NativeSession {
  sessionId: string;
  subscriptionId: string;
  workspace: { workspacePath: string; workspaceIdentity?: string };
  frames: ConversationTopicFrame[];
  send(type: CommandType, payload: unknown, options?: NativeSendOptions): Promise<CommandAck>;
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
  return openNativeSession(
    c.services.zcodeAgentService,
    c.identity.clientId,
    remote.session.sessionId,
    {
      workspacePath: remote.workspace.path,
      workspaceIdentity: remote.workspace.identity,
    },
  );
}

type NativeHandshake = Pick<WebAIReqAgent, "helloConversationV4" | "initializeConversationV4">;
type NativeConversationService = NativeHandshake &
  Pick<WebAIReqAgent, "resyncConversationV4" | "subscribeConversationV4"> &
  Pick<
    IZCodeAgentService,
    | "onDynamicConversationFrame"
    | "unsubscribeConversationV4"
    | "sendConversationCommandV4"
  >;

export async function initializeNative(service: NativeHandshake, clientId: string) {
  const hello = webHelloMessageSchema.parse(await service.helloConversationV4());
  if (hello.protocolVersion !== V4_WIRE_PROTOCOL_VERSION)
    throw new Error("ST native protocol mismatch");
  await service.initializeConversationV4({
    kind: "clientHello",
    protocolVersion: V4_WIRE_PROTOCOL_VERSION,
    clientId,
  });
}

export async function openNativeSession(
  service: NativeConversationService,
  clientId: string,
  sessionId: string,
  { workspacePath, workspaceIdentity }: NativeSession["workspace"],
): Promise<NativeSession> {
  await initializeNative(service, clientId);
  const workspace = { workspacePath, workspaceIdentity };
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
    });
    subscriptionId = subscribed.ack.subscriptionId;
    webConversationSubscribeResultSchema.parse(subscribed);
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
    const response = webConversationResyncResultSchema.parse(
      await service.resyncConversationV4({
        ...workspace,
        subscriptionId,
        base: null,
        forceSnapshot: true,
      }),
    );
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
      // 普通发送不要求 CAS；无条件 resync 会在测试辅助中耗尽真实的运行/排队窗口。
      // 只补协议要求且调用方未显式提供的 revision，保留故意传入的 0。
      const needsRevision =
        !options.omitPreconditions && COMMANDS_REQUIRING_BASE_REVISION.has(type);
      const current =
        needsRevision && options.baseRevision === undefined ? await snapshot() : undefined;
      const commandId = options.commandId ?? unique("native-command");
      const issuedAt = issuedAtByCommand.get(commandId) ?? Date.now();
      issuedAtByCommand.set(commandId, issuedAt);
      const envelope: Omit<CommandEnvelope, "workspace"> = {
        commandId,
        clientId,
        sessionId: options.sessionId ?? sessionId,
        type,
        issuedAt,
        payload,
        ...(options.baseRevision !== undefined || needsRevision
          ? { baseRevision: options.baseRevision ?? current!.revision }
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

export function expectNativeTurnWork(
  native: NativeSession,
  snapshot: ConversationSnapshot,
  commandId: string,
) {
  const turn = snapshot.rows.window.find(
    (row) => row.kind === "turnHeader" && row.sourceCommandId === commandId,
  );
  expect(turn).toMatchObject({ state: "completedSuccess" });
  const rows = snapshot.rows.window.filter((row) => row.turnId === turn?.turnId);
  const input = rows.find((row) => row.kind === "userInput" && row.sourceCommandId === commandId);
  const reply = rows.find((row) => row.kind === "assistantText" && row.state === "complete");
  expect(input).toBeDefined();
  expect(input).not.toHaveProperty("inputOrigin");
  expect(reply).toMatchObject({ text: expect.stringMatching(/\S/) });
  expect(input!.rowId).toBeLessThan(reply!.rowId);
  const live = native.frames.flatMap((frame) =>
    frame.payload.kind === "deltas" ? frame.payload.deltas : [],
  );
  expect(live).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: "row.appended",
        row: expect.objectContaining({ rowId: input!.rowId }),
      }),
      expect.objectContaining({
        op: "row.appended",
        row: expect.objectContaining({ rowId: reply!.rowId }),
      }),
    ]),
  );
}

export async function readNativeCommandCatalog(
  service: Required<Pick<IZCodeAgentService, "getConversationCommandCatalog">>,
  target: NativeSession["workspace"] & { sessionId?: string },
) {
  const catalog = await service.getConversationCommandCatalog(target);
  return conversationCommandCatalogEntrySchema.array().parse(catalog.commands);
}

export async function expectNativeLocalCommands(
  native: NativeSession,
  commands: ConversationCommandCatalogEntry[],
) {
  const session = commands.find(({ name, source }) => name === "session" && source === "builtin");
  const rename = commands.find(({ name, source }) => name === "rename" && source === "builtin");
  expect(session).toBeDefined();
  expect(rename).toBeDefined();
  const before = await native.snapshot();
  const info = await native.send("sendText", { text: `/${session!.name} info` });
  requireAccepted(info);
  expect(info.result).toMatchObject({
    type: "localCommand",
    name: session!.name,
    output: expect.stringContaining(native.sessionId),
  });
  const shortInfo = await native.send("sendText", { text: `/${session!.name}` });
  requireAccepted(shortInfo);
  expect(shortInfo.result).toEqual(info.result);

  const title = `新会话标题 ${unique("native-rename")}`;
  const renamed = await native.send("sendText", { text: `/${rename!.name} ${title}` });
  requireAccepted(renamed);
  expect(renamed.result).toMatchObject({
    type: "localCommand",
    name: rename!.name,
    output: expect.stringContaining(title),
  });
  requireRejected(await native.send("sendText", { text: `/${rename!.name}` }));
  requireRejected(await native.send("sendText", { text: "/quit" }));
  const after = await native.snapshot();
  expect(after.meta).toEqual({ title, titleSource: "custom" });
  expect(after.rows).toEqual(before.rows);
  expect(after.control).toEqual(before.control);
  return title;
}

export async function expectNativeSkillInput(
  native: NativeSession,
  clientId: string,
  commands: ConversationCommandCatalogEntry[],
) {
  const skill = commands.find(({ source }) => source === "skill");
  expect(skill?.name).toMatch(/^skill:/);
  const text = `/${skill!.name} 请核对验收范围`;
  const before = await native.snapshot();
  const unknown = await native.send("sendText", { text: `/skill:${unique("unknown")}` });
  requireRejected(unknown);
  expect((await native.snapshot()).rows).toEqual(before.rows);

  const commandId = unique("native-skill");
  const ack = await native.send("sendText", { text }, { commandId });
  requireAccepted(ack);
  expect(ack.result).toMatchObject({ type: "inputAccepted", delivery: "startNow" });
  const completed = await native.waitIdle();
  expectNativeTurnWork(native, completed, commandId);
  expect(
    completed.rows.window.filter(
      (row) => row.kind === "userInput" && row.sourceCommandId === commandId,
    ),
  ).toEqual([expect.objectContaining({ text, clientId })]);
}

export function requireRejected(ack: CommandAck): void {
  if (!["rejected", "stale", "failed"].includes(ack.status) || !ack.reasonCode) {
    throw new Error(`ST expected explicit rejection, received ${ack.status}`);
  }
}

export function expectCapabilityRejected(ack: CommandAck) {
  expect(ack).toMatchObject({
    status: "rejected",
    reasonCode: "fault.command.capabilityUnsupported",
  });
}

export async function expectRetiredConversationCommands(
  native: NativeSession,
  before: ConversationSnapshot,
) {
  const assistant = before.rows.window.findLast(
    (row) => row.kind === "assistantText" && row.state === "complete",
  );
  const input = before.rows.window.findLast((row) => row.kind === "userInput");
  if (!assistant?.entityId || !input?.entityId)
    throw new Error("ST needs completed history with input and assistant row identities");
  const target = { rowId: assistant.rowId, entityId: assistant.entityId };
  const inputTarget = { rowId: input.rowId, entityId: input.entityId };
  const options = { baseRevision: before.revision };
  const queueItemId = unique("retired-queue-item");
  const retired = [
    ["deleteSession", {}],
    ["setAssistantFeedback", { target, feedback: "like" }],
    ["resolveInteraction", { interactionId: unique("interaction"), answer: { action: "accept" } }],
    ["switchCollaborationMode", { mode: "plan" }],
    ["sendQueuedNow", { queueItemId }],
    ["setAutoDrain", { autoDrain: false }],
    ["setFollowupMode", { mode: "guide" }],
    ["forkAssistant", { target }],
    ["editUserQuery", { target: inputTarget, newText: "不应改写历史" }],
    ["applyFileRewind", { target: inputTarget }],
    ["stopSubagent", { taskId: unique("child-task"), executionId: unique("child-execution") }],
    ["resumeWorkflowRun", { workId: unique("background-work") }],
  ] as const satisfies readonly (readonly [CommandType, unknown])[];
  await Promise.all(
    retired.map(async ([type, payload]) =>
      expectCapabilityRejected(await native.send(type, payload, options)),
    ),
  );

  // No row, CAS stamps or resident session: retirement must precede all three lookups.
  expectCapabilityRejected(
    await native.send(
      "forkAssistant",
      {},
      { sessionId: unique("unknown-session"), omitPreconditions: true },
    ),
  );
  const after = await native.snapshot();
  expect(after.revision).toBe(before.revision);
  expect(after.logEpoch).toBe(before.logEpoch);
  expect(after.rows).toEqual(before.rows);
  expect(after.control).toEqual(before.control);
  expect(after.queue).toEqual(before.queue);
  expect(after.config).toEqual(before.config);
}
