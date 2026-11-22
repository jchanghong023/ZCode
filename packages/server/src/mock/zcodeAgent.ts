/* eslint-disable max-lines -- 原生 v4 会话、附件与订阅共享唯一模拟运行时。 */
// 模拟 ZCode Agent 服务：仅保留当前产品与通用控件消费的会话/索引协议。
// 帧先校验再发送，原型工具执行记录、会话行与配置由本模块提交。
// 方法签名统一从 IZCodeAgentService 派生（Parameters/ReturnType），避免与契约漂移。
import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import { Emitter, Event, type IDisposable } from "@zcode/rpc";
import { createUuid, type SessionLifecycleSnapshot } from "@zcode/shared";
import {
  COMMANDS_REQUIRING_BASE_REVISION,
  PROTOCOL_V4_LIMITS,
  ROW_TARGETING_COMMANDS,
  conversationTopicFrameSchema,
  conversationTopicWireFrameSchema,
  encodeTopicWireFrames,
  measureTopicNotificationEnvelopeBytes,
  parseCommandEnvelope,
  queueItemSchema,
  subscribeParamsSchema,
  v4ConversationRowsRangeParamsSchema,
  type ClientHello,
  type CommandAck,
  type CommandEnvelope,
  type CommandPayloadMap,
  type CommandType,
  type CommandsQueryResult,
  type ConversationDelta,
  type ConversationTopicFrame,
  type ConversationTopicWireFrame,
  type HelloMessage,
  type QueueItem,
  type ReasoningRow,
  type StatePatch,
  type SubagentRow,
  type ToolCallRow,
  type WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";
import type { IZCodeAgentService, RecentChatDirectory } from "@zcode/services/zcode-agent";
import { completeMockModelSelection, MOCK_DEFAULT_MODEL_SELECTION } from "./domains/contract.js";
import type { AIReqNativeBridge } from "../aireq/contract.js";
import { businessFailureMessage, businessRule } from "../aireq/errors.js";
import { readPrototypeSkills } from "../aireq/skills.js";
import {
  buildConversationSnapshot,
  workspaceKeyOf,
  workspaceRefOf,
  type MockRuntime,
  type MockSession,
} from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;
type MockSubmission = Pick<QueueItem, "modelSelection" | "mode" | "planEnabled">;
type MockTextSubmission = MockSubmission &
  Pick<CommandPayloadMap["sendText"], "text" | "attachments">;
type MockChatStarter = {
  workspacePath: string;
  title: string;
  prompt: string;
  reply: string;
};
type StandaloneChat = {
  actorKey(): string;
  resolveDirectory(path: string): Promise<string>;
  starterSessions: readonly MockChatStarter[];
};
type MockTurnWork = {
  reasoning?: ReasoningRow;
  todo?: ToolCallRow;
  agent?: { call: ToolCallRow; row: SubagentRow };
};

// 单次请求可超过物理帧上限，但队列全量投影仍须给逻辑帧的其他字段留空间。
const CHAT_COMMAND_MAX_BYTES = PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes / 4;
const CHAT_QUEUE_MAX_BYTES = PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes / 2;

const NATIVE_WRITABLE_COMMANDS: ReadonlySet<CommandType> = new Set([
  "sendText",
  "stop",
  "sendQueuedNow",
  "lockQueueItemEdit",
  "editQueueItem",
  "reorderQueueItem",
  "deleteQueueItem",
  "applyQueueItemsConfig",
  "setAutoDrain",
  "resolveInteraction",
  "renameSession",
  "deleteSession",
  "switchModelConfig",
  "switchCollaborationMode",
  "setFollowupMode",
  "setAssistantFeedback",
]);

// Channel 的扁平工作区目标复用 wire 的实际输入规则；仅保留连接 facade 注入的可信载体。
const workspaceTargetShape = {
  workspacePath: z.string(),
  workspaceIdentity: z.string().optional(),
  remoteSessionId: z.string().optional(),
  __zcodeTrustedV4Connection: z.unknown().optional(),
};
const conversationSubscribeInputSchema = subscribeParamsSchema.omit({ topic: true }).extend({
  ...workspaceTargetShape,
  sessionId: z.string(),
});
const conversationRowsRangeInputSchema = v4ConversationRowsRangeParamsSchema
  .omit({ workspace: true, clientMode: true })
  .extend(workspaceTargetShape);
const strictConversationTopicFrameSchema = conversationTopicFrameSchema.strict();

interface ConversationSubscription {
  sessionId: string;
  ordinal: number;
}

function assertFrame<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

export class MockZCodeAgentService implements IZCodeAgentService {
  private readonly chatHistoryByActor = new Map<string, Promise<void>>();
  private readonly conversationFrameEmitter = new Emitter<ConversationTopicWireFrame>();
  private readonly sessionLifecycleEmitter = new Emitter<SessionLifecycleSnapshot>();
  private readonly runtimeRestartedEmitter = new Emitter<{ workspaceKey: string }>();
  private readonly conversationSubs = new Map<string, ConversationSubscription>();
  private sessionGeneration = 1;

  private readonly boundSessions = new Set<string>();
  private readonly commandResults = new Map<string, { digest: string; ack: CommandAck }>();
  private readonly turnAttachments = new Map<
    string,
    import("@zcode/shared/zcode-protocol-v4").AttachmentRef[]
  >();
  private readonly uploads = new Map<
    string,
    {
      sessionId: string;
      actor: string;
      workspaceKey: string;
      fileName: string;
      mime: string;
      totalBytes: number;
      totalChunks: number;
      checksum: string;
      chunks: Buffer[];
      ref?: string;
    }
  >();
  private readonly attachments = new Map<
    string,
    {
      actor: string;
      sessionId: string;
      bytes: Buffer;
      mime: string;
      fileName: string;
      workspaceKey: string;
    }
  >();
  constructor(
    private readonly runtime: MockRuntime,
    private readonly business?: {
      assertNativeWritable(sessionId: string): void;
      admitNative(sessionId: string, commandId: string, text: string): void;
      beginNative: AIReqNativeBridge["beginNative"];
      completeNative: AIReqNativeBridge["completeNative"];
      discardNative(sessionId: string, commandId: string): void;
      seedNative(sessionId: string): string | undefined;
      getNativeBinding: AIReqNativeBridge["getNativeBinding"];
      isPublishedNativeSession(sessionId: string): boolean;
      actorKey(): string;
      registerNativeDraft(
        sessionId: string,
        workspace: { workspacePath: string; workspaceIdentity?: string },
        original: () => boolean,
        exists: () => boolean,
      ): void;
    },
    private readonly standalone?: StandaloneChat,
  ) {}

  private actorKey(): string | undefined {
    return this.standalone?.actorKey() ?? this.business?.actorKey();
  }

  private sessionUnavailable(): Error {
    return businessRule(
      this.standalone
        ? "会话不存在或当前无法访问。"
        : "会话不存在或当前无法访问，请返回需求重新打开。",
    );
  }

  async listRecentChatSessions(): Promise<RecentChatDirectory[]> {
    if (!this.standalone) throw new Error("当前连接不支持聊天最近列表。");
    const actor = this.standalone.actorKey();
    let history = this.chatHistoryByActor.get(actor);
    if (!history) {
      history = this.seedChatHistory(actor, this.standalone);
      this.chatHistoryByActor.set(actor, history);
    }
    await history;
    const sessions = [...this.runtime.sessions.values()].filter(
      (session) =>
        session.draftCreatorActor === actor && session.rows.some((row) => row.kind === "userInput"),
    );
    sessions.sort(
      (a, b) =>
        b.lastActivityAt - a.lastActivityAt ||
        b.createdAt - a.createdAt ||
        a.sessionId.localeCompare(b.sessionId),
    );
    const directories = new Map<string, RecentChatDirectory>();
    for (const session of sessions) {
      const key = session.chatDirectory!;
      let group = directories.get(key);
      if (!group) {
        if (directories.size === 5) continue;
        group = { workspacePath: session.workspaceRef.workspacePath, sessions: [] };
        directories.set(key, group);
      }
      if (group.sessions.length < 5)
        group.sessions.push({
          ...session.workspaceRef,
          sessionId: session.sessionId,
          title: session.meta.title,
          lastActivityAt: session.lastActivityAt,
        });
    }
    return [...directories.values()];
  }

  private async seedChatHistory(actor: string, standalone: StandaloneChat): Promise<void> {
    const resolvedPaths = new Map<string, Promise<string | null>>();
    for (const [index, starter] of standalone.starterSessions.entries()) {
      let resolution = resolvedPaths.get(starter.workspacePath);
      if (!resolution) {
        resolution = standalone.resolveDirectory(starter.workspacePath).catch(() => null);
        resolvedPaths.set(starter.workspacePath, resolution);
      }
      const directory = await resolution;
      if (directory === null) continue;
      const workspace = workspaceRefOf({ workspacePath: starter.workspacePath });
      const commandId = createUuid();
      const createdAt = this.runtime.startedAt - (index + 1) * 3_600_000;
      const ack = this.createSessionInternal(
        {
          type: "createSession",
          workspace: { ...workspace, workspaceKey: workspaceKeyOf(workspace) },
          sessionId: null,
          clientId: actor,
          commandId,
          issuedAt: createdAt,
          payload: { workspaceId: starter.workspacePath },
        },
        directory,
      );
      if (ack.result?.type !== "createSession") throw new Error("无法创建原型聊天历史。");
      const session = this.runtime.sessions.get(ack.result.sessionId)!;
      const turnId = `turn_${createUuid()}`;
      const endedAt = createdAt + 1_000;
      const row = { turnId, createdAtSeq: 0 };
      session.createdAt = createdAt;
      session.lastActivityAt = endedAt;
      session.phase = "completedSuccess";
      session.meta = { title: starter.title, titleSource: "generated" };
      session.rows = [
        {
          ...row,
          kind: "turnHeader",
          rowId: 0,
          entityId: createUuid(),
          createdAt,
          origin: "userInput",
          executionKind: "agent",
          sourceCommandId: commandId,
          state: "completedSuccess",
          startedAt: createdAt,
          endedAt,
          activeMs: 1_000,
        },
        {
          ...row,
          kind: "userInput",
          rowId: 1,
          entityId: createUuid(),
          createdAt,
          origin: "realUser",
          sourceCommandId: commandId,
          clientId: actor,
          text: starter.prompt,
          modelSelection: session.config.modelSelection,
        },
        {
          ...row,
          kind: "assistantText",
          rowId: 2,
          entityId: createUuid(),
          createdAt: endedAt,
          text: starter.reply,
          state: "complete",
          model: session.config.model,
        },
      ];
    }
  }

  // ── 帧发射 ──

  private emitConversationFrame(
    session: MockSession,
    payload: ConversationTopicFrame["payload"],
    ...delivery: ["online"] | ["initial" | "recovery", subscriptionId: string]
  ): void {
    const topic = `conversation/${session.sessionId}`;
    const isDelta = payload.kind === "deltas";
    const fromSeq = isDelta ? session.seq : 0;
    const toSeq = isDelta ? session.seq + 1 : session.seq;
    const [deliveryKind, targetSubscriptionId] = delivery;
    const wireFrames: ConversationTopicWireFrame[] = [];
    const delivered: ConversationSubscription[] = [];
    const subscriptions =
      targetSubscriptionId === undefined
        ? this.conversationSubs
        : ([[targetSubscriptionId, this.conversationSubs.get(targetSubscriptionId)]] as const);
    for (const [subscriptionId, sub] of subscriptions) {
      if (sub?.sessionId !== session.sessionId) continue;
      const frame: ConversationTopicFrame = {
        topic,
        subscriptionId,
        fromSeq,
        toSeq,
        sentAt: Date.now(),
        payload,
      };
      const logical = strictConversationTopicFrameSchema.parse(fitSnapshotTail(frame));
      for (const wire of encodeTopicWireFrames(logical, {
        deliveryKind,
        logicalFrameId: createUuid(),
        logicalFrameOrdinal: sub.ordinal + 1,
        topic,
        subscriptionId,
        measurePhysicalFrameBytes: (candidate) =>
          measureTopicNotificationEnvelopeBytes(candidate).maxBytes,
      })) {
        wireFrames.push(conversationTopicWireFrameSchema.parse(wire));
      }
      delivered.push(sub);
    }
    // 校验整批之后一起提交水位，分片不产生额外 seq 或订阅 ordinal。
    if (isDelta) session.seq = toSeq;
    for (const sub of delivered) sub.ordinal += 1;
    for (const wire of wireFrames) this.conversationFrameEmitter.fire(wire);
  }

  /** 应用一个 state patch 并以 deltas 帧下发（control/usage/plan 等 A 区键）。 */
  private patchState(
    session: MockSession,
    patch: StatePatch,
    deltas: ConversationDelta[] = [],
  ): void {
    session.revision += 1;
    const fullPatch: StatePatch = { ...patch, revision: session.revision };
    this.emitConversationFrame(
      session,
      { kind: "deltas", deltas: [{ op: "state.updated", patch: fullPatch }, ...deltas] },
      "online",
    );
  }

  private appendRow(session: MockSession, row: WireConversationRow): void {
    session.rows.push(row);
    this.emitConversationFrame(
      session,
      { kind: "deltas", deltas: [{ op: "row.appended", row }] },
      "online",
    );
  }

  private upsertRow(session: MockSession, row: WireConversationRow): void {
    const index = session.rows.findIndex((existing) => existing.rowId === row.rowId);
    if (index >= 0) session.rows[index] = row;
    this.emitConversationFrame(
      session,
      { kind: "deltas", deltas: [{ op: "row.upserted", row }] },
      "online",
    );
  }

  private nextRowId(session: MockSession): number {
    const last = session.rows.at(-1);
    return (last?.rowId ?? -1) + 1;
  }

  // ── AIReq 业务回合：完整回复一次提交，恢复读取同一权威事实 ──

  private newToolRow(
    session: MockSession,
    turnId: string,
    assistantResponseId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): ToolCallRow {
    return {
      kind: "toolCall",
      rowId: this.nextRowId(session),
      turnId,
      assistantResponseId,
      entityId: `entity_${createUuid()}`,
      createdAt: Date.now(),
      createdAtSeq: session.seq,
      toolCallId: `tool_${createUuid()}`,
      toolName,
      status: "running",
      inputText: JSON.stringify(input),
      input,
      startedAt: Date.now(),
    };
  }

  private async simulateTurnWork(
    session: MockSession,
    work: MockTurnWork,
    turnId: string,
    responseId: string,
    text: string,
    signal: AbortSignal,
  ): Promise<void> {
    const startedAt = Date.now();
    work.reasoning = {
      kind: "reasoning",
      rowId: this.nextRowId(session),
      turnId,
      assistantResponseId: responseId,
      entityId: `entity_${createUuid()}`,
      createdAt: startedAt,
      createdAtSeq: session.seq,
      text: "正在解析本轮输入。",
      state: "streaming",
    };
    this.appendRow(session, work.reasoning);
    await wait(160, undefined, { signal });
    const append = "\n\n先整理 Todo，再由子代理复核本轮输入。";
    const index = session.rows.findIndex((row) => row.rowId === work.reasoning!.rowId);
    work.reasoning = { ...work.reasoning, text: work.reasoning.text + append };
    session.rows[index] = work.reasoning;
    this.emitConversationFrame(
      session,
      {
        kind: "deltas",
        deltas: [{ op: "row.delta", rowId: work.reasoning.rowId, path: "text", append }],
      },
      "online",
    );
    await wait(160, undefined, { signal });
    work.reasoning = { ...work.reasoning, state: "complete", durationMs: Date.now() - startedAt };
    this.upsertRow(session, work.reasoning);

    const steps = ["整理本轮待办", "由子代理复核输入", "整理本轮回复"];
    const items = steps.map((content, index) => ({
      id: `${turnId}:${index}`,
      content,
      status: index === 0 ? ("inProgress" as const) : ("pending" as const),
    }));
    session.plan = { items, updatedAt: Date.now() };
    this.patchState(session, { plan: session.plan });
    work.todo = this.newToolRow(session, turnId, responseId, "TodoWrite", this.todoInput(items));
    this.appendRow(session, work.todo);
    await wait(220, undefined, { signal });
    this.publishTodoProgress(session, work, 1);

    const subagentType = "原型复核";
    const call = this.newToolRow(session, turnId, responseId, "Agent", {
      subagent_type: subagentType,
      description: "复核本轮输入",
      prompt: "复核父会话中本轮用户输入，统计非空行并摘要首行。",
    });
    this.appendRow(session, call);
    const row: SubagentRow = {
      kind: "subagent",
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: Date.now(),
      createdAtSeq: session.seq,
      parentToolCallId: call.toolCallId,
      subagentType,
      status: "running",
      summaryText: "正在复核本轮输入。",
      startedAt: call.startedAt,
    };
    this.appendRow(session, row);
    work.agent = { call, row };
    await wait(320, undefined, { signal });
    let lineCount = 0;
    let firstLine = "（无文字）";
    for (const [line] of text.matchAll(/[^\n]+/gu)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (lineCount === 0) firstLine = trimmed.slice(0, 120);
      lineCount += 1;
    }
    this.setSubagentResult(
      session,
      work.agent,
      "success",
      `复核了本轮输入中的 ${lineCount} 行文字。\n\n首行：${firstLine}`,
    );
    this.publishTodoProgress(session, work, 2);
    await wait(160, undefined, { signal });
  }

  private todoInput(items: NonNullable<MockSession["plan"]>["items"]) {
    return {
      todos: items.map((item) => ({
        ...item,
        status: item.status === "inProgress" ? "in_progress" : item.status,
      })),
    };
  }

  private publishTodoProgress(
    session: MockSession,
    work: MockTurnWork,
    completed: number,
    ended = false,
  ): void {
    if (!session.plan || !work.todo) return;
    const items = session.plan.items.map((item, index) => ({
      ...item,
      status:
        index < completed
          ? ("completed" as const)
          : index === completed && !ended
            ? ("inProgress" as const)
            : ("pending" as const),
    }));
    session.plan = { items, updatedAt: Date.now() };
    this.patchState(session, { plan: session.plan });
    const input = this.todoInput(items);
    work.todo = {
      ...work.todo,
      input,
      inputText: JSON.stringify(input),
      status: completed ? "success" : "cancelled",
      endedAt: work.todo.endedAt ?? Date.now(),
    };
    this.upsertRow(session, work.todo);
  }

  private setSubagentResult(
    session: MockSession,
    agent: NonNullable<MockTurnWork["agent"]>,
    status: "success" | "failed" | "cancelled",
    summaryText: string,
  ): void {
    const endedAt = Date.now();
    agent.row = { ...agent.row, status, summaryText, endedAt };
    agent.call = {
      ...agent.call,
      status: status === "failed" ? "error" : status,
      endedAt,
      output: { text: summaryText },
      ...(status === "failed"
        ? { error: { code: "prototype.reviewFailed", message: summaryText } }
        : {}),
    };
    this.upsertRow(session, agent.row);
    this.upsertRow(session, agent.call);
  }

  private finishTurnWork(
    session: MockSession,
    work: MockTurnWork,
    status: "success" | "failed" | "cancelled",
  ): void {
    if (work.reasoning?.state === "streaming") {
      this.upsertRow(session, { ...work.reasoning, state: "interrupted" });
    }
    if (work.agent?.row.status === "running")
      this.setSubagentResult(
        session,
        work.agent,
        status,
        status === "cancelled" ? "复核已中止。" : "复核未完成。",
      );
    if (work.todo && session.plan) {
      const completed =
        status === "success"
          ? session.plan.items.length
          : session.plan.items.filter((item) => item.status === "completed").length;
      this.publishTodoProgress(session, work, completed, true);
    }
  }

  private async runTurn(
    session: MockSession,
    commandId: string,
    clientId: string,
    text: string,
    submission: MockSubmission,
    owner: AbortController,
  ): Promise<void> {
    const modelSelection = submission.modelSelection ?? session.config.modelSelection;
    const model = modelSelection?.modelId ?? session.config.model;
    const startedAt = Date.now();
    const turnId = `turn_${createUuid()}`;
    const responseId = `resp_${createUuid()}`;
    session.lastActivityAt = startedAt;
    session.phase = "running";
    // 独立聊天连接只接纳创建会话和发送，不能在运行态投影出停止动作。
    const canStop = !this.standalone;
    this.patchState(session, {
      control: {
        phase: "running",
        sessionEnded: false,
        canStop,
        stopState: canStop ? "stoppable" : "idle",
        stopTargetKind: canStop ? "assistant" : "unknown",
        activeWorks: [{ kind: "primaryTurn", sourceCommandId: commandId, startedAt }],
        lastError: null,
        apiRetry: null,
      },
    });

    const turnHeader: WireConversationRow = {
      kind: "turnHeader",
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: startedAt,
      createdAtSeq: session.seq,
      origin: "userInput",
      executionKind: "agent",
      sourceCommandId: commandId,
      state: "running",
      startedAt,
    };
    this.appendRow(session, turnHeader);
    const work: MockTurnWork = {};
    // 停止先同步收口本轮；旧 await 恢复时不能把替代轮当作自己的运行句柄。
    owner.signal.onabort = () => {
      this.business?.discardNative(session.sessionId, commandId);
      this.finishTurnWork(session, work, "cancelled");
      this.finalizeInterruptedTurn(session, turnHeader, owner);
    };

    const userInputRow: WireConversationRow = {
      kind: "userInput",
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: Date.now(),
      createdAtSeq: session.seq,
      text,
      origin: "realUser",
      sourceCommandId: commandId,
      clientId,
      inputOrigin: "desktop",
      attachments: this.turnAttachments.get(commandId),
      modelSelection,
      ...(submission.mode !== undefined ? { mode: submission.mode } : {}),
      ...(submission.planEnabled !== undefined ? { planEnabled: submission.planEnabled } : {}),
    };
    this.appendRow(session, userInputRow);

    if (this.business || this.standalone) {
      try {
        this.business?.beginNative(session.sessionId, commandId, text, modelSelection);
        await this.simulateTurnWork(session, work, turnId, responseId, text, owner.signal);
        if (owner.signal.aborted || session.activeTurn !== owner) return;
        const { reply, modelId } = this.business?.completeNative(
          session.sessionId,
          commandId,
          text,
        ) ?? {
          reply: "本轮原型执行已完成。上方的 **Todo** 和子代理工作记录可以展开查看。",
          modelId: undefined,
        };
        this.finishTurnWork(session, work, "success");
        this.appendRow(session, {
          kind: "assistantText",
          rowId: this.nextRowId(session),
          turnId,
          entityId: `entity_${createUuid()}`,
          createdAt: Date.now(),
          createdAtSeq: session.seq,
          assistantResponseId: responseId,
          text: reply,
          state: "complete",
          model: modelId ?? model,
        });
        this.finalizeTurn(session, turnHeader, owner, startedAt, reply);
      } catch (error) {
        // abort 监听已同步提交中止状态；异步等待拒绝后不能再次改写同一轮。
        if (owner.signal.aborted || session.activeTurn !== owner) return;
        this.finishTurnWork(session, work, "failed");
        // 已接纳不等于完成：只透出显式安全业务错误，未知详情由既有服务端诊断记录。
        const message = this.standalone
          ? "Agent 未能完成回复，消息已保留。"
          : `${businessFailureMessage(error, "业务处理失败，请稍后重试。")}\n\n消息已保留，请重新读取当前材料后重试。`;
        this.appendRow(session, {
          kind: "assistantText",
          rowId: this.nextRowId(session),
          turnId,
          entityId: `entity_${createUuid()}`,
          createdAt: Date.now(),
          createdAtSeq: session.seq,
          assistantResponseId: responseId,
          text: message,
          state: "failed",
          model: this.business ? model : undefined,
        });
        this.finalizeInterruptedTurn(session, turnHeader, owner, "failed");
      }
      return;
    }
  }

  private finalizeInterruptedTurn(
    session: MockSession,
    turnHeader: WireConversationRow,
    owner: AbortController,
    state: "completedInterrupted" | "failed" = "completedInterrupted",
  ): void {
    owner.signal.onabort = null;
    if (turnHeader.kind === "turnHeader") {
      this.upsertRow(session, {
        ...turnHeader,
        state,
        endedAt: Date.now(),
        activeMs: Date.now() - turnHeader.startedAt,
      });
    }
    // 迟到中断只更新自己的行；替代轮即使已结束，也不能被旧轮重新收口。
    if (session.activeTurn !== owner) return;
    session.activeTurn = null;
    session.phase = "completedInterrupted";
    session.lastActivityAt = Date.now();
    this.patchState(session, {
      control: {
        phase: "completedInterrupted",
        sessionEnded: true,
        canStop: false,
        stopState: "idle",
        stopTargetKind: "unknown",
        activeWorks: [],
        lastError: null,
        apiRetry: null,
      },
    });
    this.maybeStartNextInput(session);
  }

  private finalizeTurn(
    session: MockSession,
    turnHeader: WireConversationRow,
    owner: AbortController,
    startedAt: number,
    reply: string,
  ): void {
    if (owner.signal.aborted || session.activeTurn !== owner)
      return this.finalizeInterruptedTurn(session, turnHeader, owner);
    owner.signal.onabort = null;
    session.activeTurn = null;
    session.phase = "completedSuccess";
    session.lastActivityAt = Date.now();
    if (turnHeader.kind === "turnHeader") {
      this.upsertRow(session, {
        ...turnHeader,
        state: "completedSuccess",
        endedAt: Date.now(),
        activeMs: Date.now() - startedAt,
        ...(this.business ? { outputTokens: Math.ceil(reply.length / 2) } : {}),
      });
    }
    if (this.business)
      session.usage = {
        contextWindow: {
          usedTokens: 1200 + Math.ceil(reply.length / 2),
          maxTokens: 128000,
          autoCompactThresholdTokens: 100000,
        },
        cumulative: {
          inputTokens: session.usage.cumulative.inputTokens + 800,
          outputTokens: session.usage.cumulative.outputTokens + Math.ceil(reply.length / 2),
          cacheReadTokens: session.usage.cumulative.cacheReadTokens,
          cacheWriteTokens: session.usage.cumulative.cacheWriteTokens + 200,
        },
      };
    if (session.meta.titleSource === "default" && this.business) {
      session.meta = { title: textToTitle(reply), titleSource: "generated" };
    }
    this.patchState(session, {
      control: {
        phase: "completedSuccess",
        sessionEnded: true,
        canStop: false,
        stopState: "idle",
        stopTargetKind: "unknown",
        activeWorks: [],
        lastError: null,
        apiRetry: null,
      },
      usage: session.usage,
      meta: session.meta,
    });
    this.maybeStartNextInput(session);
  }

  // ── 会话与命令 ──

  private ensureSession(params: {
    sessionId: string;
    workspace?: { workspacePath: string; workspaceIdentity?: string };
    allowSeed?: boolean;
  }): MockSession {
    let session = this.runtime.sessions.get(params.sessionId);
    if (
      !session &&
      params.allowSeed !== false &&
      params.workspace &&
      this.business?.getNativeBinding(params.sessionId)
    )
      session = this.ensureOrSeedDraftSession(
        { ...params.workspace, sessionId: params.sessionId },
        workspaceKeyOf(params.workspace),
      );
    if (!session) throw this.sessionUnavailable();
    if (
      params.workspace &&
      (session.workspaceKey !== workspaceKeyOf(params.workspace) ||
        session.workspaceRef.workspacePath !== params.workspace.workspacePath)
    ) {
      // 会话按工作区隔离：不属于调用方工作区的会话对外等价于不存在。
      throw this.sessionUnavailable();
    }
    if (
      session.draftCreatorActor &&
      session.draftCreatorActor !== this.actorKey() &&
      !this.business?.isPublishedNativeSession(session.sessionId)
    )
      throw this.sessionUnavailable();
    return session;
  }

  private ackAccepted(envelope: CommandEnvelope, result?: CommandAck["result"]): CommandAck {
    return {
      commandId: envelope.commandId,
      status: "accepted",
      revisionAtDecision: envelope.sessionId
        ? (this.runtime.sessions.get(envelope.sessionId)?.revision ?? 0)
        : 0,
      ...(result ? { result } : {}),
    };
  }

  private ackNoop(
    envelope: CommandEnvelope,
    session: MockSession,
    reasonCode?: string,
  ): CommandAck {
    return {
      commandId: envelope.commandId,
      status: "noop",
      ...(reasonCode ? { reasonCode } : {}),
      revisionAtDecision: session.revision,
    };
  }

  /** 未实现命令的唯一出口：明确拒绝，绝不返回 accepted 让 UI 以为状态已变。 */
  private rejectUnsupported(envelope: CommandEnvelope, session: MockSession | null): CommandAck {
    return {
      commandId: envelope.commandId,
      status: "rejected",
      reasonCode: "fault.command.capabilityUnsupported",
      message: "当前服务暂不支持此操作。",
      revisionAtDecision: session?.revision ?? 0,
    };
  }

  private createQueueItem(
    session: MockSession,
    envelope: CommandEnvelope,
    submission: MockTextSubmission,
  ): QueueItem {
    const queueItemId = `input_${createUuid()}`;
    return assertFrame(queueItemSchema, {
      inputOrigin: "desktop",
      // 附件归已接纳输入所有，不属于编辑锁，也不能被空数组覆盖。
      attachments: submission.attachments ?? [],
      sourceCommandId: envelope.commandId,
      queueItemId,
      clientId: envelope.clientId,
      kind: "sendText",
      text: submission.text,
      ...(submission.modelSelection ? { modelSelection: submission.modelSelection } : {}),
      ...(submission.mode !== undefined ? { mode: submission.mode } : {}),
      ...(submission.planEnabled !== undefined ? { planEnabled: submission.planEnabled } : {}),
      delivery: { requested: "queue", admitted: "queue" },
      order: {
        admissionSeq: session.nextAdmissionSeq,
        queuePosition: session.queuedInputs.length,
      },
      steer: { state: "notRequested" },
      dispatch: { state: "queued" },
      admittedAt: Date.now(),
    });
  }

  private findQueueItem(session: MockSession, queueItemId: string): QueueItem | undefined {
    return session.queuedInputs.find((item) => item.queueItemId === queueItemId);
  }

  /** queue 投影是唯一出口：items 顺序、位置与自动续跑开关一起下发。 */
  private patchQueue(session: MockSession): void {
    session.queuedInputs.forEach((item, index) => {
      item.order = { ...item.order, queuePosition: index };
    });
    this.patchState(session, {
      queue: {
        items: session.queuedInputs,
        autoDrain: session.autoDrain,
        ...(session.pauseReason ? { pauseReason: session.pauseReason } : {}),
      },
    });
  }

  private startTurn(
    session: MockSession,
    commandId: string,
    clientId: string,
    text: string,
    attachments?: QueueItem["attachments"],
    submission: MockSubmission = {},
  ): void {
    // 接纳来源沿信封／队列项传递，不能被后续提升、恢复或编辑命令的操作者覆盖。
    if (attachments !== undefined) this.turnAttachments.set(commandId, attachments);
    const owner = new AbortController();
    session.activeTurn = owner;
    void this.runTurn(session, commandId, clientId, text, submission, owner);
  }

  /** turn 结束后处理 sendQueuedNow 提升项或 autoDrain 队列；运行中不并发开新 turn。 */
  private maybeStartNextInput(session: MockSession): void {
    // 删除后旧 turn 可能才结束，不能让它复活索引或继续启动排队输入。
    if (!this.runtime.sessions.has(session.sessionId) || session.activeTurn !== null) return;
    if (session.pendingStartInput !== null) {
      const input = session.pendingStartInput;
      session.pendingStartInput = null;
      this.startTurn(
        session,
        input.sourceCommandId,
        input.clientId,
        input.text,
        input.attachments,
        input,
      );
      return;
    }
    if (!session.autoDrain) return;
    const next = session.queuedInputs.shift();
    if (!next) return;
    this.patchQueue(session);
    this.startTurn(session, next.sourceCommandId, next.clientId, next.text, next.attachments, next);
  }

  private createSessionInternal(envelope: CommandEnvelope, directory?: string): CommandAck {
    const payload = envelope.payload as CommandPayloadMap["createSession"];
    // 首发无法执行时必须在创建会话/索引之前拒绝，不能返回“创建并发送”空成功。
    if (payload.firstInput && !this.business && !this.standalone)
      return this.rejectUnsupported(envelope, null);
    const chatConfig = this.standalone
      ? completeMockModelSelection(
          payload.config?.modelSelection ??
            payload.firstInput?.modelSelection ??
            MOCK_DEFAULT_MODEL_SELECTION,
        )
      : null;
    if (
      this.standalone &&
      (!chatConfig ||
        (payload.firstInput?.modelSelection &&
          !completeMockModelSelection(payload.firstInput.modelSelection)))
    )
      return this.rejectUnsupported(envelope, null);
    if (!envelope.workspace) throw new Error("创建会话缺少请求工作区。");
    const sessionRef = workspaceRefOf(envelope.workspace);
    const sessionId = payload.sessionId ?? this.runtime.newSessionId();
    const actor = this.actorKey();
    const existing = this.runtime.sessions.get(sessionId);
    // 刷新/重复准备不能用新 createSession 覆盖已接纳 rows；首发重放由 commandId 收据对账。
    if (existing) {
      if (
        existing.workspaceKey !== workspaceKeyOf(sessionRef) ||
        existing.workspaceRef.workspacePath !== sessionRef.workspacePath ||
        (existing.draftCreatorActor && existing.draftCreatorActor !== actor)
      )
        throw this.sessionUnavailable();
      if (payload.firstInput)
        throw new Error("此会话已存在，请通过原消息编号查询接纳结果或使用 sendText。");
      return this.ackAccepted(envelope, { type: "createSession", sessionId });
    }
    const now = Date.now();
    const session: MockSession = {
      sessionId,
      workspaceKey: workspaceKeyOf(sessionRef),
      workspaceRef: {
        workspacePath: sessionRef.workspacePath,
        ...(sessionRef.workspaceIdentity
          ? { workspaceIdentity: sessionRef.workspaceIdentity }
          : {}),
      },
      ...(actor ? { draftCreatorActor: actor } : {}),
      ...(directory ? { chatDirectory: directory } : {}),
      skillReferenceCatalog: this.standalone
        ? []
        : this.readWorkspaceSkillCatalog(sessionRef.workspacePath),
      logEpoch: this.runtime.newLogEpoch(),
      seq: 0,
      revision: 0,
      phase: payload.firstInput ? "prewarming" : "draft",
      createdAt: now,
      lastActivityAt: now,
      meta: { title: "", titleSource: "default" },
      rows: [],
      usage: {
        contextWindow: null,
        cumulative: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      plan: null,
      pendingInteractions: [],
      queuedInputs: [],
      nextAdmissionSeq: 1,
      autoDrain: true,
      pendingStartInput: null,
      activeTurn: null,
      config: {
        provider: "account:bigmodel-start-plan",
        model: "GLM-5.3-Flash",
        thought: "max",
        thoughtLevels: ["low", "medium", "high", "max"],
        followupMode: "queue",
        mode: "build",
        modelSelection: {
          providerId: "bigmodel",
          modelId: "GLM-5.3-Flash",
          options: { reasoningLevel: "max" },
        },
      },
    };
    if (payload.config) {
      Object.assign(session.config, payload.config);
    }
    if (chatConfig) Object.assign(session.config, chatConfig);
    this.runtime.sessions.set(sessionId, session);
    this.business?.registerNativeDraft(
      sessionId,
      session.workspaceRef,
      () =>
        this.runtime.sessions.get(sessionId) === session &&
        session.phase === "draft" &&
        session.rows.length === 0 &&
        session.queuedInputs.length === 0 &&
        session.activeTurn === null,
      () => this.runtime.sessions.get(sessionId) === session,
    );
    // AIReq 私有预热不进入普通任务产品；显式业务首发负责发布提案。
    if (!this.business && !this.standalone) {
      this.runtime.tasks.set(sessionId, {
        sessionId,
        workspacePath: sessionRef.workspacePath,
        ...(sessionRef.workspaceIdentity
          ? { workspaceIdentity: sessionRef.workspaceIdentity }
          : {}),
        title: "",
        titleSource: "default",
        pinned: false,
        archived: false,
        unread: false,
        createdAt: now,
        lastActivityAt: now,
      });
    }

    if (payload.firstInput) {
      this.sendTextInternal(session, { ...envelope, sessionId, payload: payload.firstInput });
      return this.ackAccepted(envelope, {
        type: "createSession",
        sessionId,
        input: { delivery: "startNow", inputId: `input_${createUuid()}` },
      });
    }
    return this.ackAccepted(envelope, { type: "createSession", sessionId });
  }

  private validateInputAttachments(
    session: MockSession,
    attachments: QueueItem["attachments"],
  ): void {
    const actor = this.business?.actorKey() ?? "mock";
    if (attachments.length > 8) throw new Error("最多接纳八个附件。");
    for (const attachment of attachments) {
      const value = this.attachments.get(attachment.ref);
      if (
        !value ||
        value.actor !== actor ||
        value.sessionId !== session.sessionId ||
        value.workspaceKey !== session.workspaceKey ||
        attachment.bytes !== value.bytes.length ||
        attachment.mime !== value.mime ||
        attachment.fileName !== value.fileName
      )
        throw new Error("附件不属于当前原生输入范围或元数据不符。");
    }
  }

  private sendTextInternal(session: MockSession, envelope: CommandEnvelope): CommandAck {
    // 没有业务执行者就没有可提交的回复事实，不能落入演示执行分支。
    if (!this.business && !this.standalone) return this.rejectUnsupported(envelope, session);
    let payload = envelope.payload as MockTextSubmission;
    if (this.standalone && payload.modelSelection) {
      const config = completeMockModelSelection(payload.modelSelection);
      if (!config) return this.rejectUnsupported(envelope, session);
      payload = { ...payload, modelSelection: config.modelSelection };
    }
    // 先校验真实字节及归属，再执行业务接纳；失败不能留下已采用的输入。
    this.validateInputAttachments(session, payload.attachments ?? []);
    const queuedItem = session.activeTurn
      ? this.createQueueItem(session, envelope, payload)
      : undefined;
    if (
      this.standalone &&
      queuedItem &&
      jsonByteLength(session.queuedInputs) + jsonByteLength(queuedItem) + 1 > CHAT_QUEUE_MAX_BYTES
    )
      return {
        commandId: envelope.commandId,
        status: "rejected",
        reasonCode: "guard.chat.queueFull",
        message: "待发送的消息过多，请等当前回合处理完成。",
        revisionAtDecision: session.revision,
      };
    this.business?.admitNative(session.sessionId, envelope.commandId, payload.text);
    if (this.standalone && session.meta.titleSource === "default") {
      session.meta = { title: textToTitle(payload.text), titleSource: "generated" };
    }
    this.turnAttachments.set(envelope.commandId, payload.attachments ?? []);
    if (session.rows.length === 0) {
      const binding = this.business?.getNativeBinding(session.sessionId);
      if (binding) {
        session.config = {
          ...session.config,
          provider: binding.providerId,
          model: binding.modelId,
          thought: binding.reasoning,
          thoughtLevels: ["default", "low", "medium", "high"],
          modelSelection: {
            providerId: binding.providerId,
            modelId: binding.modelId,
            options: { reasoningLevel: binding.reasoning },
          },
        };
        this.boundSessions.add(session.sessionId);
      }
    }
    if (queuedItem) {
      // 运行中发送真实进入队列：ACK 的 delivery=queue 与 snapshot.queue.items 一致。
      session.nextAdmissionSeq += 1;
      session.queuedInputs.push(queuedItem);
      this.patchQueue(session);
      return this.ackAccepted(envelope, {
        type: "inputAccepted",
        delivery: "queue",
        inputId: queuedItem.queueItemId,
      });
    }
    this.startTurn(
      session,
      envelope.commandId,
      envelope.clientId,
      payload.text,
      undefined,
      payload,
    );
    return this.ackAccepted(envelope, {
      type: "inputAccepted",
      delivery: "startNow",
      inputId: `input_${createUuid()}`,
    });
  }

  private handleEnvelope(envelope: CommandEnvelope, directory?: string): CommandAck {
    if (envelope.type === "createSession") {
      return this.createSessionInternal(envelope, directory);
    }
    if (!envelope.sessionId) {
      // 没有会话归属的命令（如 createSelectionSideSession）一律走未实现分支，不先抛 fault。
      return this.rejectUnsupported(envelope, null);
    }
    const session = this.ensureSession({
      sessionId: envelope.sessionId,
      workspace: envelope.workspace,
      // CAS/行命令不能借归属查询创建新会话事实。
      allowSeed:
        !COMMANDS_REQUIRING_BASE_REVISION.has(envelope.type) &&
        !ROW_TARGETING_COMMANDS.has(envelope.type),
    });
    // 幂等命中在入口先返回；首次裁决必须在任何状态/行/水位写入之前完成。
    let fault: string | undefined;
    if (
      COMMANDS_REQUIRING_BASE_REVISION.has(envelope.type) &&
      envelope.baseRevision !== session.revision
    )
      fault = "proto.staleRevision";
    if (ROW_TARGETING_COMMANDS.has(envelope.type)) {
      const { target } = envelope.payload as { target: { rowId: number; entityId: string } };
      if (envelope.baseLogEpoch !== session.logEpoch) fault = "proto.staleLogEpoch";
      else if (
        !session.rows.some(
          (row) =>
            row.rowId === target.rowId && "entityId" in row && row.entityId === target.entityId,
        )
      )
        fault ??= "proto.staleTarget";
    }
    if (fault)
      return {
        commandId: envelope.commandId,
        status: "rejected",
        reasonCode: fault,
        revisionAtDecision: session.revision,
      };
    // 反馈是历史行标注，解除自己的编辑锁只清理资源；二者不恢复执行写权限。
    if (this.business && NATIVE_WRITABLE_COMMANDS.has(envelope.type))
      this.business.assertNativeWritable(session.sessionId);
    switch (envelope.type) {
      case "sendText":
        return this.sendTextInternal(session, envelope);
      case "stop": {
        if (session.activeTurn !== null) {
          // stop 暂停自动续跑：队列保留，直到 setAutoDrain 恢复。
          session.autoDrain = false;
          session.pauseReason = "stopped";
          session.activeTurn.abort();
          this.patchQueue(session);
          return this.ackAccepted(envelope);
        }
        if (session.autoDrain || session.queuedInputs.length > 0) {
          session.autoDrain = false;
          session.pauseReason = "stopped";
          this.patchQueue(session);
          return this.ackAccepted(envelope);
        }
        return this.ackNoop(envelope, session);
      }
      case "sendQueuedNow": {
        const payload = envelope.payload as { queueItemId: string };
        const index = session.queuedInputs.findIndex(
          (item) => item.queueItemId === payload.queueItemId,
        );
        const item = index >= 0 ? session.queuedInputs[index] : undefined;
        if (!item) return this.ackNoop(envelope, session);
        if (item.editLock) return this.ackNoop(envelope, session, "guard.queueItemEditLocked");
        session.queuedInputs.splice(index, 1);
        if (session.activeTurn !== null) {
          // 立即发送 = 中断当前 turn；队列项在中断收口后开始，不并发写会话状态。
          session.pendingStartInput = item;
          session.activeTurn.abort();
        } else {
          this.startTurn(
            session,
            item.sourceCommandId,
            item.clientId,
            item.text,
            item.attachments,
            item,
          );
        }
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "lockQueueItemEdit": {
        const payload = envelope.payload as { queueItemId: string; editorId: string };
        const item = this.findQueueItem(session, payload.queueItemId);
        if (!item) return this.ackNoop(envelope, session);
        if (item.dispatch.state !== "queued") {
          return this.ackNoop(envelope, session, "guard.queueItemReserved");
        }
        if (item.editLock) return this.ackNoop(envelope, session, "guard.queueItemEditLocked");
        item.editLock = {
          editorId: payload.editorId,
          clientId: envelope.clientId,
          inputOrigin: "desktop",
        };
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "releaseQueueItemEdit": {
        const payload = envelope.payload as { queueItemId: string };
        const item = this.findQueueItem(session, payload.queueItemId);
        if (!item?.editLock) return this.ackNoop(envelope, session);
        // 释放协议不带 editorId，仍须核对可信命令的 clientId，不能让其他客户端取消持有者的冻结。
        if (item.editLock.clientId !== envelope.clientId)
          return this.ackNoop(envelope, session, "guard.queueEditLockLost");
        delete item.editLock;
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "editQueueItem": {
        const payload = envelope.payload as {
          queueItemId: string;
          newText: string;
          editorId?: string;
          attachments?: QueueItem["attachments"];
          conversationQuotes?: QueueItem["conversationQuotes"];
          modelSelection?: QueueItem["modelSelection"];
          mode?: QueueItem["mode"];
          planEnabled?: boolean;
        };
        const item = this.findQueueItem(session, payload.queueItemId);
        if (!item) return this.ackNoop(envelope, session);
        // editorId 可从共享快照读取，不能单独作为持锁凭据；省略它也不能绕过已有冻结。
        const ownsEdit = item.editLock
          ? item.editLock.clientId === envelope.clientId &&
            item.editLock.editorId === payload.editorId
          : payload.editorId === undefined;
        if (!ownsEdit) {
          return this.ackNoop(envelope, session, "guard.queueEditLockLost");
        }
        if (payload.attachments !== undefined)
          this.validateInputAttachments(session, payload.attachments);
        const updated = assertFrame(queueItemSchema, {
          ...item,
          text: payload.newText,
          ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
          ...(payload.conversationQuotes !== undefined
            ? { conversationQuotes: payload.conversationQuotes }
            : {}),
          ...(payload.modelSelection !== undefined
            ? { modelSelection: payload.modelSelection }
            : {}),
          ...(payload.mode !== undefined ? { mode: payload.mode } : {}),
          ...(payload.planEnabled !== undefined ? { planEnabled: payload.planEnabled } : {}),
        });
        // 同一命令释放编辑锁。
        delete updated.editLock;
        Object.assign(item, updated);
        delete item.editLock;
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "reorderQueueItem": {
        const payload = envelope.payload as {
          queueItemId: string;
          beforeQueueItemId: string | null;
        };
        const from = session.queuedInputs.findIndex(
          (item) => item.queueItemId === payload.queueItemId,
        );
        const item = from >= 0 ? session.queuedInputs[from] : undefined;
        if (!item) return this.ackNoop(envelope, session);
        if (item.editLock) return this.ackNoop(envelope, session, "guard.queueItemEditLocked");
        session.queuedInputs.splice(from, 1);
        const before =
          payload.beforeQueueItemId === null
            ? session.queuedInputs.length
            : session.queuedInputs.findIndex(
                (candidate) => candidate.queueItemId === payload.beforeQueueItemId,
              );
        if (before < 0) {
          session.queuedInputs.splice(from, 0, item);
          return this.ackNoop(envelope, session);
        }
        session.queuedInputs.splice(before, 0, item);
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "deleteQueueItem": {
        const payload = envelope.payload as { queueItemId: string };
        const index = session.queuedInputs.findIndex(
          (item) => item.queueItemId === payload.queueItemId,
        );
        const item = index >= 0 ? session.queuedInputs[index] : undefined;
        if (!item) return this.ackNoop(envelope, session);
        if (item.editLock) return this.ackNoop(envelope, session, "guard.queueItemEditLocked");
        session.queuedInputs.splice(index, 1);
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "applyQueueItemsConfig": {
        const payload = envelope.payload as {
          queueItemIds: string[];
          modelSelection?: QueueItem["modelSelection"];
          mode?: QueueItem["mode"];
        };
        let applied = 0;
        for (const item of session.queuedInputs) {
          if (!payload.queueItemIds.includes(item.queueItemId)) continue;
          if (item.dispatch.state !== "queued" || item.editLock || item.kind === "compact") {
            continue;
          }
          if (payload.modelSelection !== undefined) item.modelSelection = payload.modelSelection;
          if (payload.mode !== undefined) item.mode = payload.mode;
          applied += 1;
        }
        if (applied === 0) return this.ackNoop(envelope, session);
        this.patchQueue(session);
        return this.ackAccepted(envelope);
      }
      case "setAutoDrain": {
        const payload = envelope.payload as { autoDrain: boolean };
        session.autoDrain = payload.autoDrain;
        if (payload.autoDrain) delete session.pauseReason;
        else session.pauseReason = "manual";
        this.patchQueue(session);
        if (payload.autoDrain) this.maybeStartNextInput(session);
        return this.ackAccepted(envelope);
      }
      case "resolveInteraction": {
        const payload = envelope.payload as { interactionId: string };
        const interaction = session.pendingInteractions.find(
          (item) => item.interactionId === payload.interactionId,
        );
        if (!interaction) return this.ackNoop(envelope, session, "proto.alreadyResolved");
        session.pendingInteractions = session.pendingInteractions.filter(
          (item) => item.interactionId !== payload.interactionId,
        );
        const permissionToolCallId =
          interaction.payload.kind === "permission"
            ? (interaction.payload as { toolCallId: string }).toolCallId
            : undefined;
        if (permissionToolCallId) {
          const row = session.rows.find(
            (candidate) =>
              candidate.kind === "toolCall" && candidate.toolCallId === permissionToolCallId,
          );
          if (row?.kind === "toolCall") {
            this.upsertRow(session, { ...row, status: "running" });
            const succeeded: WireConversationRow = {
              ...row,
              status: "success",
              endedAt: Date.now(),
            };
            setTimeout(() => this.upsertRow(session, succeeded), 120);
          }
        }
        this.patchState(session, { pendingInteractions: session.pendingInteractions });
        return this.ackAccepted(envelope, {
          type: "resolveInteraction",
          resolvedBy: { clientId: envelope.clientId },
        });
      }
      case "renameSession": {
        const payload = envelope.payload as { title: string };
        session.meta = { title: payload.title, titleSource: "custom" };
        const task = this.runtime.tasks.get(session.sessionId);
        if (task) {
          task.title = payload.title;
          task.titleSource = "custom";
        }
        this.patchState(session, { meta: session.meta });
        return this.ackAccepted(envelope);
      }
      case "deleteSession": {
        this.runtime.sessions.delete(session.sessionId);
        this.runtime.tasks.delete(session.sessionId);
        return this.ackAccepted(envelope);
      }
      case "switchModelConfig": {
        if (this.business?.getNativeBinding(session.sessionId))
          return this.rejectUnsupported(envelope, session);
        const payload = envelope.payload as { provider: string; model: string; thought: string };
        const previous = session.config;
        const chatConfig = this.standalone
          ? completeMockModelSelection({
              providerId: payload.provider,
              modelId: payload.model,
              options: { reasoningLevel: payload.thought },
            })
          : null;
        if (this.standalone && !chatConfig) return this.rejectUnsupported(envelope, session);
        if (this.standalone && session.activeTurn)
          return {
            commandId: envelope.commandId,
            status: "rejected",
            reasonCode: "guard.session.busy",
            message: "当前回合结束后可切换模型。",
            revisionAtDecision: session.revision,
          };
        session.config = chatConfig
          ? { ...session.config, ...chatConfig }
          : {
              ...session.config,
              provider: payload.provider,
              model: payload.model,
              thought: payload.thought,
              modelSelection: {
                providerId: payload.provider,
                modelId: payload.model,
                options: { reasoningLevel: payload.thought },
              },
            };
        // 配置边界行先进入权威集合，实时帧与恢复/分页才能看到相同事实。
        this.patchState(session, { config: { ...session.config } });
        this.appendRow(session, {
          kind: "timelineMarker",
          rowId: this.nextRowId(session),
          turnId: `turn_${createUuid()}`,
          createdAt: Date.now(),
          createdAtSeq: session.seq,
          lane: "lightBoundary",
          marker: {
            type: "modelChange",
            fromProvider: previous.provider,
            fromModel: previous.model,
            toProvider: payload.provider,
            toModel: payload.model,
            toThought: payload.thought,
          },
        });
        return this.ackAccepted(envelope);
      }
      case "switchCollaborationMode": {
        const payload = envelope.payload as { mode: string };
        session.config = { ...session.config, mode: payload.mode };
        this.patchState(session, { config: { ...session.config } });
        return this.ackAccepted(envelope);
      }
      case "setFollowupMode": {
        const payload = envelope.payload as { mode: "queue" | "guide" };
        session.config = { ...session.config, followupMode: payload.mode };
        this.patchState(session, { config: { ...session.config } });
        return this.ackAccepted(envelope);
      }
      case "setAssistantFeedback": {
        const payload = envelope.payload as {
          target: { rowId: number; entityId: string };
          feedback: "like" | "dislike" | null;
        };
        const row = session.rows.find(
          (candidate) =>
            candidate.rowId === payload.target.rowId &&
            "entityId" in candidate &&
            candidate.entityId === payload.target.entityId,
        );
        if (row?.kind !== "assistantText") return this.ackNoop(envelope, session);
        const updated: Record<string, unknown> = { ...row };
        if (payload.feedback) updated["feedback"] = payload.feedback;
        else delete updated["feedback"];
        this.upsertRow(session, updated as unknown as WireConversationRow);
        return this.ackAccepted(envelope);
      }
      default:
        // 未实现命令必须明确拒绝：以前一律 accepted 会让 UI 以为状态已经变化。
        return this.rejectUnsupported(envelope, session);
    }
  }

  // ── v4 握手与订阅 ──

  async helloConversationV4(): Promise<HelloMessage> {
    return {
      kind: "hello",
      protocolVersion: 3,
      connectionId: `mock-conn-${createUuid()}`,
      clientMode: "web-remote-replayable",
      deliveryProfile: "replayable",
      serverTime: Date.now(),
      capabilities: {
        nativeDialogs: false,
        localTerminal: false,
        binaryFrames: true,
        compression: "none",
        workflowRunDeltas: true,
        independentPlanState: true,
        genUiContext: false,
      },
      auth: {},
    };
  }

  async initializeConversationV4(_clientHello: ClientHello): Promise<void> {}

  async setConnectionFlowStateV4(
    _params: P<IZCodeAgentService["setConnectionFlowStateV4"]>,
  ): Promise<void> {}

  async subscribeConversationV4(params: P<IZCodeAgentService["subscribeConversationV4"]>) {
    // 必须先验证原始入参，不能在预热／订阅之前只挑已知字段导致额外键被吞掉。
    conversationSubscribeInputSchema.parse(params);
    const workspaceKey = workspaceKeyOf(params);
    const session = this.ensureOrSeedDraftSession(params, workspaceKey);
    const binding = this.business?.getNativeBinding(session.sessionId);
    if (binding && !this.boundSessions.has(session.sessionId)) {
      this.boundSessions.add(session.sessionId);
      session.config = {
        ...session.config,
        provider: binding.providerId,
        model: binding.modelId,
        thought: binding.reasoning,
        thoughtLevels: ["default", "low", "medium", "high"],
        modelSelection: {
          providerId: binding.providerId,
          modelId: binding.modelId,
          options: { reasoningLevel: binding.reasoning },
        },
      };
    }
    const seed =
      session.rows.length === 0 ? this.business?.seedNative(session.sessionId) : undefined;
    if (seed)
      this.appendRow(session, {
        kind: "assistantText",
        rowId: this.nextRowId(session),
        turnId: `seed-${session.sessionId}`,
        entityId: `entity_${createUuid()}`,
        createdAt: Date.now(),
        createdAtSeq: session.seq,
        text: seed,
        state: "complete",
        model: session.config.model,
      });
    const subscriptionId = `sub-${createUuid()}`;
    this.conversationSubs.set(subscriptionId, { sessionId: session.sessionId, ordinal: 0 });
    try {
      const snapshot = buildConversationSnapshot(session, !binding);
      this.emitConversationFrame(session, { kind: "snapshot", snapshot }, "initial", subscriptionId);
    } catch (error) {
      this.conversationSubs.delete(subscriptionId);
      throw error;
    }
    return { ack: { subscriptionId, mode: "snapshot" as const, logEpoch: session.logEpoch } };
  }

  /** 订阅时目标会话可能尚未创建（draft 预热窗口）；按 workspace 种子一个空会话。 */
  private ensureOrSeedDraftSession(
    params: { sessionId: string; workspacePath: string; workspaceIdentity?: string },
    workspaceKey: string,
  ): MockSession {
    if (this.standalone)
      return this.ensureSession({ sessionId: params.sessionId, workspace: params });
    const existing = this.runtime.sessions.get(params.sessionId);
    if (existing) {
      if (
        existing.workspaceKey !== workspaceKey ||
        existing.workspaceRef.workspacePath !== params.workspacePath ||
        (existing.draftCreatorActor &&
          existing.draftCreatorActor !== this.business?.actorKey() &&
          !this.business?.isPublishedNativeSession(existing.sessionId))
      ) {
        // 会话 id 属于另一个工作区时等价于不存在，避免跨工作区读取会话状态。
        throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
      }
      return existing;
    }
    if (this.business && !this.business.getNativeBinding(params.sessionId))
      throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
    const now = Date.now();
    const session: MockSession = {
      sessionId: params.sessionId,
      workspaceKey,
      workspaceRef: workspaceRefOf(params),
      skillReferenceCatalog: this.readWorkspaceSkillCatalog(params.workspacePath),
      logEpoch: this.runtime.newLogEpoch(),
      seq: 0,
      revision: 0,
      phase: "draft",
      createdAt: now,
      lastActivityAt: now,
      meta: { title: "", titleSource: "default" },
      rows: [],
      usage: {
        contextWindow: null,
        cumulative: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      plan: null,
      pendingInteractions: [],
      queuedInputs: [],
      nextAdmissionSeq: 1,
      autoDrain: true,
      pendingStartInput: null,
      activeTurn: null,
      config: {
        provider: "account:bigmodel-start-plan",
        model: "GLM-5.3-Flash",
        thought: "max",
        thoughtLevels: ["low", "medium", "high", "max"],
        followupMode: "queue",
        mode: "build",
        modelSelection: {
          providerId: "bigmodel",
          modelId: "GLM-5.3-Flash",
          options: { reasoningLevel: "max" },
        },
      },
    };
    this.runtime.sessions.set(params.sessionId, session);
    return session;
  }

  async resyncConversationV4(params: P<IZCodeAgentService["resyncConversationV4"]>) {
    const sub = this.conversationSubs.get(params.subscriptionId);
    const session = sub ? this.runtime.sessions.get(sub.sessionId) : undefined;
    if (!sub || !session) {
      throw new Error("fault.subscription.unknownSubscription");
    }
    const snapshot = buildConversationSnapshot(
      session,
      !this.business?.getNativeBinding(session.sessionId),
    );
    this.emitConversationFrame(
      session,
      { kind: "snapshot", snapshot },
      "recovery",
      params.subscriptionId,
    );
    return {
      ack: {
        subscriptionId: params.subscriptionId,
        mode: "snapshot" as const,
        logEpoch: session.logEpoch,
      },
    };
  }

  async unsubscribeConversationV4(
    params: P<IZCodeAgentService["unsubscribeConversationV4"]>,
  ): Promise<void> {
    this.conversationSubs.delete(params.subscriptionId);
  }

  async conversationRowsRangeV4(params: P<IZCodeAgentService["conversationRowsRangeV4"]>) {
    conversationRowsRangeInputSchema.parse(params);
    // 原因：ensureSession 会补建有业务引用的缺失会话；只读驻留查询必须先拒绝，不能产生历史。
    if (params.residency === "resident-only" && !this.runtime.sessions.has(params.sessionId)) {
      throw new Error("proto.sessionNotResident");
    }
    const session = this.ensureSession({ sessionId: params.sessionId, workspace: params });
    const rows = session?.rows ?? [];
    const beforeRowId = params.beforeRowId ?? Number.MAX_SAFE_INTEGER;
    const eligible = rows.filter((row) => row.rowId < beforeRowId);
    let start = Math.max(0, eligible.length - params.limit);
    if (this.standalone) {
      // 分页是单个 RPC 响应而非分片快照；长会话不能一次返回超过传输预算的正文。
      let bytes = 0;
      let cursor = eligible.length;
      while (cursor > start) {
        bytes += jsonByteLength(eligible[cursor - 1]!) + 1;
        if (bytes > CHAT_QUEUE_MAX_BYTES) break;
        cursor -= 1;
      }
      start = cursor;
    }
    return {
      rows: eligible.slice(start),
      atSeq: session?.seq ?? 0,
      atRevision: session?.revision ?? 0,
      atLogEpoch: session?.logEpoch ?? "unknown",
      hasMore: start > 0,
    };
  }

  async conversationPlansV4(params: P<IZCodeAgentService["conversationPlansV4"]>) {
    const session = this.ensureSession({ sessionId: params.sessionId, workspace: params });
    return {
      plans: (session?.rows ?? []).filter(
        (row): row is Extract<WireConversationRow, { kind: "toolCall" }> =>
          row.kind === "toolCall" && row.toolName === "exit_plan_mode",
      ),
      atSeq: session?.seq ?? 0,
      atLogEpoch: session?.logEpoch ?? "unknown",
    };
  }

  async sendConversationCommandV4(
    params: P<IZCodeAgentService["sendConversationCommandV4"]>,
  ): Promise<CommandAck> {
    const parsed = parseCommandEnvelope(params.envelope);
    if (!parsed.ok) {
      return {
        commandId: params.envelope.commandId,
        status: "rejected",
        reasonCode: "fault.command.invalidEnvelope",
        revisionAtDecision: 0,
      };
    }
    const envelope = parsed.envelope;
    let directory: string | undefined;
    if (this.standalone) {
      if (
        envelope.type !== "createSession" &&
        envelope.type !== "sendText" &&
        envelope.type !== "switchModelConfig"
      )
        return this.rejectUnsupported(envelope, null);
      type TextInput = { text: string; attachments?: unknown[] };
      const input =
        envelope.type === "createSession"
          ? (envelope.payload as { firstInput?: TextInput }).firstInput
          : envelope.type === "sendText"
            ? (envelope.payload as TextInput)
            : undefined;
      if (input && !input.text.trim()) throw new Error("请输入要发送的消息。");
      if (input?.attachments?.length) return this.rejectUnsupported(envelope, null);
      if (envelope.type === "createSession") {
        directory = await this.standalone.resolveDirectory(params.workspacePath);
      }
    }
    // 缓存接纳结果同样按当前请求工作区隔离，不能绕过归属检查。
    const requestWorkspace = workspaceRefOf(params);
    if (
      parsed.envelope.workspace &&
      (workspaceKeyOf(parsed.envelope.workspace) !== workspaceKeyOf(requestWorkspace) ||
        parsed.envelope.workspace.workspacePath !== requestWorkspace.workspacePath)
    )
      throw new Error("命令工作区与当前请求不一致。");
    const key = `${this.actorKey() ?? "mock"}:${parsed.envelope.sessionId ?? "draft"}:${parsed.envelope.commandId}`;
    const serialized = JSON.stringify([requestWorkspace, parsed.envelope]);
    if (this.standalone && Buffer.byteLength(serialized) > CHAT_COMMAND_MAX_BYTES)
      return {
        commandId: envelope.commandId,
        status: "rejected",
        reasonCode: "fault.chat.inputTooLarge",
        message: "消息过长，请分段发送。",
        revisionAtDecision: 0,
      };
    const digest = createHash("sha256").update(serialized).digest("hex");
    const prior = this.commandResults.get(key);
    if (prior) {
      if (prior.digest !== digest) throw new Error("原生消息编号不能用于不同输入。");
      return prior.ack;
    }
    const ack = this.handleEnvelope(
      {
        ...parsed.envelope,
        workspace: { ...requestWorkspace, workspaceKey: workspaceKeyOf(requestWorkspace) },
      },
      directory,
    );
    this.commandResults.set(key, { digest, ack });
    return ack;
  }

  async queryConversationCommandsV4(
    params: P<IZCodeAgentService["queryConversationCommandsV4"]>,
  ): Promise<CommandsQueryResult> {
    return {
      results: params.commands.map((key) => {
        const result =
          this.commandResults.get(
            `${this.business?.actorKey() ?? "mock"}:${key.sessionId ?? "draft"}:${key.commandId}`,
          )?.ack ?? ("unknown" as const);
        const session = key.sessionId
          ? this.ensureSession({ sessionId: key.sessionId, workspace: params })
          : undefined;
        const header = session?.rows.find(
          (row) => row.kind === "turnHeader" && row.sourceCommandId === key.commandId,
        );
        return {
          key,
          result,
          ...(header?.kind === "turnHeader"
            ? { turn: { turnId: header.turnId, state: header.state } }
            : {}),
        };
      }),
      ...(params.clock ? { clock: { clockOffsetMs: 0, sampledAt: Date.now() } } : {}),
    } as unknown as CommandsQueryResult;
  }

  onDynamicConversationFrame(
    _params: P<IZCodeAgentService["onDynamicConversationFrame"]>,
  ): ReturnType<IZCodeAgentService["onDynamicConversationFrame"]> {
    return this.conversationFrameEmitter.event as unknown as ReturnType<
      IZCodeAgentService["onDynamicConversationFrame"]
    >;
  }

  onDynamicSessionLifecycle(
    _params: P<IZCodeAgentService["onDynamicSessionLifecycle"]>,
  ): ReturnType<IZCodeAgentService["onDynamicSessionLifecycle"]> {
    return this.sessionLifecycleEmitter.event as unknown as ReturnType<
      IZCodeAgentService["onDynamicSessionLifecycle"]
    >;
  }

  async getSessionLifecycle(
    params: P<IZCodeAgentService["getSessionLifecycle"]>,
  ): Promise<AR<IZCodeAgentService["getSessionLifecycle"]>> {
    if (!this.runtime.sessions.has(params.sessionId)) return null;
    const session = this.ensureSession({ sessionId: params.sessionId, workspace: params });
    return {
      sessionId: session.sessionId,
      // ready 仅表示已有内存 owner 可接纳命令，不表示外部进程存在。
      state: "ready",
      generation: this.sessionGeneration,
      revision: session.revision,
      lastError: null,
    };
  }

  onAgentRuntimeRestarted(listener: (event: { workspaceKey: string }) => void): IDisposable {
    return this.runtimeRestartedEmitter.event(listener);
  }

  /** 可选 runtime 事件：mock 无进程换代，恒为空事件。 */
  readonly onAgentRuntimeLifecycle: NonNullable<IZCodeAgentService["onAgentRuntimeLifecycle"]> =
    Event.None as unknown as NonNullable<IZCodeAgentService["onAgentRuntimeLifecycle"]>;

  // ── 附件 ──

  async attachmentBeginV4(params: P<IZCodeAgentService["attachmentBeginV4"]>) {
    const actor = this.business?.actorKey() ?? "mock";
    // 未知会话不能取得上传归属；合法业务 provisional 仍走现有会话 owner。
    const session = this.ensureSession({ sessionId: params.sessionId, workspace: params });
    if (
      typeof params.uploadId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(params.uploadId) ||
      !params.fileName ||
      params.fileName.length > 255 ||
      params.fileName.includes("\0") ||
      params.fileName.includes("\r") ||
      params.fileName.includes("\n") ||
      !/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(params.mime) ||
      !Number.isSafeInteger(params.totalBytes) ||
      params.totalBytes < 0 ||
      params.totalBytes > 20 * 1024 * 1024 ||
      !Number.isSafeInteger(params.totalChunks) ||
      params.totalChunks < 0 ||
      params.totalChunks > 4096 ||
      (params.totalBytes === 0) !== (params.totalChunks === 0) ||
      !/^sha256:[a-f0-9]{64}$/.test(params.checksum)
    )
      throw new Error("附件元数据无效。");
    const key = `${actor}:${params.uploadId}`;
    const existing = this.uploads.get(key);
    if (
      existing &&
      (existing.sessionId !== params.sessionId ||
        existing.workspaceKey !== session.workspaceKey ||
        existing.checksum !== params.checksum ||
        existing.fileName !== params.fileName ||
        existing.totalBytes !== params.totalBytes ||
        existing.totalChunks !== params.totalChunks ||
        existing.mime !== params.mime)
    )
      throw new Error("上传编号已用于其他文件。");
    const upload = existing ?? {
      actor,
      workspaceKey: session.workspaceKey,
      sessionId: params.sessionId,
      fileName: params.fileName,
      mime: params.mime,
      totalBytes: params.totalBytes,
      totalChunks: params.totalChunks,
      checksum: params.checksum,
      chunks: [],
    };
    this.uploads.set(key, upload);
    return upload.ref
      ? {
          uploadId: params.uploadId,
          state: "committed" as const,
          nextChunkIndex: upload.chunks.length,
          ref: upload.ref,
        }
      : {
          uploadId: params.uploadId,
          state: "staging" as const,
          nextChunkIndex: upload.chunks.length,
        };
  }
  private attachmentUpload(params: { uploadId: string; sessionId: string }) {
    const actor = this.business?.actorKey() ?? "mock";
    this.ensureSession({ sessionId: params.sessionId });
    const upload = this.uploads.get(`${actor}:${params.uploadId}`);
    if (!upload || upload.sessionId !== params.sessionId)
      throw new Error("附件上传不存在或归属不符。");
    return upload;
  }
  async attachmentChunkV4(params: P<IZCodeAgentService["attachmentChunkV4"]>) {
    const upload = this.attachmentUpload(params);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(params.dataBase64))
      throw new Error("附件块不是有效 base64。");
    const chunk = Buffer.from(params.dataBase64, "base64");
    if (
      chunk.length > 512 * 1024 ||
      !Number.isSafeInteger(params.chunkIndex) ||
      params.chunkIndex < 0 ||
      params.chunkIndex >= upload.totalChunks
    )
      throw new Error("附件块无效或过大。");
    if (params.chunkIndex < upload.chunks.length) {
      if (!upload.chunks[params.chunkIndex]!.equals(chunk)) throw new Error("已接纳块不能改写。");
    } else {
      if (
        params.chunkIndex !== upload.chunks.length ||
        upload.ref ||
        upload.chunks.reduce((total, item) => total + item.length, 0) + chunk.length >
          upload.totalBytes
      )
        throw new Error("附件块顺序或大小不符。");
      upload.chunks.push(chunk);
    }
    return { uploadId: params.uploadId, nextChunkIndex: upload.chunks.length };
  }
  async attachmentCommitV4(params: P<IZCodeAgentService["attachmentCommitV4"]>) {
    const upload = this.attachmentUpload(params);
    if (upload.ref) return { ref: upload.ref };
    if (upload.chunks.length !== upload.totalChunks) throw new Error("附件块尚未上传完整。");
    const bytes = Buffer.concat(upload.chunks);
    if (
      bytes.length !== upload.totalBytes ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== upload.checksum
    )
      throw new Error("附件大小或 SHA-256 校验失败。");
    const ref = `att_${createUuid()}`;
    this.attachments.set(ref, {
      actor: upload.actor,
      sessionId: upload.sessionId,
      workspaceKey: upload.workspaceKey,
      bytes,
      mime: upload.mime,
      fileName: upload.fileName,
    });
    upload.ref = ref;
    return { ref };
  }
  async attachmentAbortV4(params: P<IZCodeAgentService["attachmentAbortV4"]>): Promise<void> {
    const actor = this.business?.actorKey() ?? "mock";
    const value = this.uploads.get(`${actor}:${params.uploadId}`);
    if (value && value.sessionId !== params.sessionId) throw new Error("上传归属不符。");
    if (
      value?.ref &&
      ![...this.runtime.sessions.values()].some(
        (session) =>
          // ACK 后草稿 abort 只能移除暂存句柄，队列／提升项仍持有真实字节。
          session.queuedInputs.some((item) =>
            item.attachments.some((attachment) => attachment.ref === value.ref),
          ) ||
          session.pendingStartInput?.attachments.some(
            (attachment) => attachment.ref === value.ref,
          ) ||
          session.rows.some(
            (row) =>
              row.kind === "userInput" &&
              row.attachments?.some((attachment) => attachment.ref === value.ref),
          ),
      )
    )
      this.attachments.delete(value.ref);
    this.uploads.delete(`${actor}:${params.uploadId}`);
  }
  private attachmentFor(params: {
    sessionId: string;
    ref: string;
    target?: { rowId: number; entityId: string };
    attachmentIndex?: number;
    workspacePath: string;
    workspaceIdentity?: string;
  }) {
    const value = this.attachments.get(params.ref);
    if (!value) throw new Error("附件不存在。");
    // 原因：历史附件可能在会话移除后才读取，不能通过 ensureSession 重建空会话。
    if (!this.runtime.sessions.has(params.sessionId)) {
      throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
    }
    const session = this.ensureSession({ sessionId: params.sessionId, workspace: params });
    const own = value.actor === (this.business?.actorKey() ?? "mock");
    if (value.sessionId !== session.sessionId || value.workspaceKey !== session.workspaceKey)
      throw new Error("附件不属于当前会话投影。");
    const adopted = session.rows.some(
      (row) =>
        row.kind === "userInput" &&
        (!params.target ||
          (row.rowId === params.target.rowId && row.entityId === params.target.entityId)) &&
        (params.attachmentIndex === undefined
          ? row.attachments?.some((item) => item.ref === params.ref)
          : row.attachments?.[params.attachmentIndex]?.ref === params.ref),
    );
    // 旧校验把上传 actor 当成永久读者；跨 actor 只共享已发布会话中真实采用的行附件。
    if (!own) {
      if (!adopted || !this.business?.isPublishedNativeSession(session.sessionId))
        throw new Error("附件不属于当前会话投影。");
      return value;
    }
    // 已接纳但尚未生成行的输入同样拥有附件；不能依赖已释放的上传暂存。
    const queued =
      !params.target &&
      (session.queuedInputs.some((item) =>
        item.attachments.some((attachment) => attachment.ref === params.ref),
      ) ||
        session.pendingStartInput?.attachments.some((attachment) => attachment.ref === params.ref));
    const draft =
      !params.target &&
      [...this.uploads.values()].some(
        (upload) =>
          upload.sessionId === params.sessionId &&
          upload.ref === params.ref &&
          upload.actor === (this.business?.actorKey() ?? "mock"),
      );
    if (!adopted && !queued && !draft) throw new Error("附件不属于当前会话投影。");
    return value;
  }
  async attachmentReadV4(params: P<IZCodeAgentService["attachmentReadV4"]>) {
    const value = this.attachmentFor(params);
    if (
      !Number.isSafeInteger(params.offset) ||
      params.offset < 0 ||
      !Number.isSafeInteger(params.limit) ||
      params.limit < 1 ||
      params.limit > 512 * 1024
    )
      throw new Error("附件读取范围无效。");
    const bytes = value.bytes.subarray(params.offset, params.offset + params.limit);
    const next = params.offset + bytes.length;
    return {
      dataBase64: bytes.toString("base64"),
      mediaType: value.mime,
      totalBytes: value.bytes.length,
      nextOffset: next < value.bytes.length ? next : null,
    };
  }

  // ── 当前产品保留的目录与运行偏好 ──

  async syncAppRuntimePreferences(
    _preferences: P<IZCodeAgentService["syncAppRuntimePreferences"]>,
  ): Promise<void> {}

  async listSessionSubagents(
    _params: P<IZCodeAgentService["listSessionSubagents"]>,
  ): Promise<AR<IZCodeAgentService["listSessionSubagents"]>> {
    return { subagents: [], endedTotal: 0, revision: 0 } as unknown as AR<
      IZCodeAgentService["listSessionSubagents"]
    >;
  }

  private readWorkspaceSkillCatalog(
    workspacePath: string,
  ): AR<IZCodeAgentService["getSkillReferenceCatalog"]>["skills"] {
    return readPrototypeSkills(workspacePath)
      .filter((skill) => skill.enabled)
      .map(({ id, name, description, path, scope, pluginName }) => ({
        id,
        name,
        description,
        path,
        scope,
        enabled: true,
        ...(pluginName ? { pluginName } : {}),
      }));
  }

  async getSkillReferenceCatalog(
    params: P<IZCodeAgentService["getSkillReferenceCatalog"]>,
  ): Promise<AR<IZCodeAgentService["getSkillReferenceCatalog"]>> {
    if (params.sessionId === undefined)
      return {
        authority: "workspace",
        skills: this.readWorkspaceSkillCatalog(params.workspacePath),
      };
    // 目录必须属于已驻留且可访问的会话；补建或回退 workspace 会让新技能进入旧对话。
    const session = this.ensureSession({
      sessionId: params.sessionId,
      workspace: params,
      allowSeed: false,
    });
    // Skill 设计等私有业务会话的归属仍由业务 owner 校验，不能只核对 workspace。
    this.business?.getNativeBinding(session.sessionId);
    return { authority: "session", skills: structuredClone(session.skillReferenceCatalog) };
  }

  supportsConversationQuoteComment(
    _target: NonNullable<P<IZCodeAgentService["supportsConversationQuoteComment"]>>,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  async disposeWorkspace(_params: P<IZCodeAgentService["disposeWorkspace"]>): Promise<void> {
    for (const [sessionId, session] of this.runtime.sessions) {
      if (session.workspaceKey === workspaceKeyOf(_params)) {
        // 先撤销会话归属，避免同步取消收口重新启动待发队列。
        this.runtime.sessions.delete(sessionId);
        session.activeTurn?.abort();
      }
    }
  }

  disposeAll(): void {
    for (const session of this.runtime.sessions.values()) {
      this.runtime.sessions.delete(session.sessionId);
      session.activeTurn?.abort();
    }
    this.conversationSubs.clear();
  }
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function fitSnapshotTail(frame: ConversationTopicFrame): ConversationTopicFrame {
  if (frame.payload.kind !== "snapshot") return frame;
  const { snapshot } = frame.payload;
  const { rows } = snapshot;
  if (rows.window.length === 0) return frame;
  const emptyTail: typeof rows = { ...rows, window: [] };
  const emptyFrame: ConversationTopicFrame = {
    ...frame,
    payload: { kind: "snapshot", snapshot: { ...snapshot, rows: emptyTail } },
  };
  // 保留可分页的权威总量与首行；仅缩小从末行连续向前的快照窗口。
  let bytes = jsonByteLength(emptyFrame);
  let start = rows.window.length;
  while (start > 0) {
    const separator = start === rows.window.length ? 0 : 1;
    const nextBytes = jsonByteLength(rows.window[start - 1]!) + separator;
    if (bytes + nextBytes > PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes) break;
    bytes += nextBytes;
    start -= 1;
  }
  if (start === 0) return frame;
  emptyTail.window = rows.window.slice(start);
  return emptyFrame;
}

function textToTitle(text: string): string {
  const firstLine = text.trim().slice(0, 24).split("\n", 1)[0];
  return firstLine || "新任务";
}
