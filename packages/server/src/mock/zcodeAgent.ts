/* eslint-disable max-lines -- 原生 v4 会话、附件与订阅共享唯一模拟运行时。 */
// 模拟 ZCode Agent 服务：仅保留当前产品与通用控件消费的会话/索引协议。
// 帧先校验再发送，原型工具执行记录、会话行与配置由本模块提交。
// 方法签名从服务契约派生，避免与公开接口漂移。
import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import { Emitter } from "@zcode/rpc";
import { createUuid, type SkillSummary } from "@zcode/shared";
import {
  COMMANDS_REQUIRING_BASE_REVISION,
  PROTOCOL_V4_LIMITS,
  commandEnvelopeSchema,
  commandPayloadSchemas,
  conversationTopicFrameSchema,
  commandsQueryParamsSchema,
  conversationTopicWireFrameSchema,
  encodeTopicWireFrames,
  measureTopicNotificationEnvelopeBytes,
  projectWebCommandAck,
  queueItemSchema,
  subscribeParamsSchema,
  v4ConversationRowsRangeParamsSchema,
  webCreateSessionPayloadSchema,
  type ClientHello,
  type CommandAck,
  type CommandEnvelope,
  type CommandPayloadMap,
  type CommandType,
  type ConversationDelta,
  type ConversationCommandCatalogEntry,
  type ConversationTopicFrame,
  type ConversationTopicWireFrame,
  type HelloMessage,
  type PlanState,
  type QueueItem,
  type StatePatch,
  type SubagentRow,
  type ToolCallRow,
  type WebCommandsQueryResult,
  type WebCreateSessionPayload,
  type WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";
import type {
  IZCodeAgentService,
  RecentChatDirectory,
  RecentChatSession,
  WebAIReqAgent,
} from "@zcode/services/zcode-agent";
import { completeMockModelSelection, MOCK_DEFAULT_MODEL_SELECTION } from "./domains/contract.js";
import type { AIReqNativeBridge } from "../aireq/contract.js";
import { businessFailureMessage, businessRule } from "../aireq/errors.js";
import { readBuiltinPrototypeSkills, readPrototypeSkills } from "../aireq/skills.js";
import {
  buildConversationSnapshot,
  projectMockExecution,
  projectMockQueue,
  workspaceKeyOf,
  workspaceRefOf,
  type MockActiveTurn,
  type MockInputContext,
  type MockQueuedInput,
  type MockRuntime,
  type MockSession,
} from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;
type MockTextSubmission = CommandPayloadMap["sendText"];
type MockInput = {
  commandId: string;
  clientId: string;
  text: string;
  attachments?: QueueItem["attachments"];
  conversationQuotes?: QueueItem["conversationQuotes"];
  context?: MockInputContext;
};
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
const BUILTIN_COMMANDS = [
  {
    name: "session",
    description: "查看当前会话（/session 或 /session info）。",
    source: "builtin",
  },
  { name: "rename", description: "修改当前会话标题（/rename <title>）。", source: "builtin" },
] as const satisfies readonly ConversationCommandCatalogEntry[];

type MockParsedInput =
  | { kind: "text"; context?: MockInputContext }
  | { kind: "builtin"; name: (typeof BUILTIN_COMMANDS)[number]["name"]; args: string }
  | { kind: "rejected"; message: string };

// 单次请求可超过物理帧上限，但队列全量投影仍须给逻辑帧的其他字段留空间。
const CHAT_COMMAND_MAX_BYTES = PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes / 4;
const CHAT_QUEUE_MAX_BYTES = PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes / 2;

const AIREQ_COMMANDS: ReadonlySet<CommandType> = new Set([
  "createSession",
  "sendText",
  "stop",
  "renameSession",
]);
const CHAT_COMMANDS: ReadonlySet<CommandType> = new Set([
  "createSession",
  "sendText",
  "stop",
  "switchModelConfig",
]);

// Channel 的扁平工作区目标复用 wire 的实际输入规则；仅保留连接 facade 注入的可信载体。
const workspaceTargetShape = {
  workspacePath: z.string(),
  workspaceIdentity: z.string().optional(),
  __zcodeTrustedV4Connection: z.unknown().optional(),
};
const conversationSubscribeInputSchema = subscribeParamsSchema
  .omit({ topic: true, visibility: true, retryInitialization: true })
  .extend({
    ...workspaceTargetShape,
    sessionId: z.string(),
  });
const conversationRowsRangeInputSchema = v4ConversationRowsRangeParamsSchema
  .omit({ workspace: true, clientMode: true })
  .extend(workspaceTargetShape);
const conversationCatalogInputSchema = z.strictObject({
  workspacePath: z.string(),
  workspaceIdentity: z.string().optional(),
  sessionId: z.string().optional(),
});
const strictConversationTopicFrameSchema = conversationTopicFrameSchema.strict();

interface ConversationSubscription {
  sessionId: string;
  ordinal: number;
}

function assertFrame<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

export class MockZCodeAgentService implements IZCodeAgentService {
  private chatHistory?: Promise<void>;
  private readonly conversationFrameEmitter = new Emitter<ConversationTopicWireFrame>();
  private readonly conversationSubs = new Map<string, ConversationSubscription>();

  private readonly commandResults = new Map<string, { digest: string; ack: CommandAck }>();
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
      prepareNativeResult: AIReqNativeBridge["prepareNativeResult"];
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
    this.chatHistory ??= this.seedChatHistory(this.standalone);
    await this.chatHistory;
    const sessions = [...this.runtime.sessions.values()].filter(
      (session) =>
        session.chatDirectory !== undefined && session.rows.some((row) => row.kind === "userInput"),
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
      const group = directories.get(key);
      if (group ? group.sessions.length === 5 : directories.size === 5) continue;
      const { workspacePath, workspaceIdentity } = session.workspaceRef;
      const entry: RecentChatSession = {
        workspacePath,
        ...(workspaceIdentity === undefined ? {} : { workspaceIdentity }),
        sessionId: session.sessionId,
        title: session.meta.title,
      };
      if (group) group.sessions.push(entry);
      else directories.set(key, { sessions: [entry] });
    }
    return [...directories.values()];
  }

  private async seedChatHistory(standalone: StandaloneChat): Promise<void> {
    const actor = "mock-chat-starter";
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
          payload: {},
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

  private startMockTurnWork(session: MockSession, turnId: string, responseId: string) {
    const rowBase = () => ({
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: Date.now(),
      createdAtSeq: session.seq,
    });
    const newTool = (toolName: string, input: object): ToolCallRow => {
      const base = rowBase();
      return {
        ...base,
        kind: "toolCall",
        assistantResponseId: responseId,
        toolCallId: `tool_${createUuid()}`,
        toolName,
        input,
        inputText: JSON.stringify(input),
        status: "running",
        startedAt: base.createdAt,
      };
    };
    let reasoning: Extract<WireConversationRow, { kind: "reasoning" }> = {
      ...rowBase(),
      kind: "reasoning",
      assistantResponseId: responseId,
      text: "正在模拟分析本轮输入。",
      state: "streaming",
    };
    const steps = ["整理本轮输入", "由模拟子代理复核", "整理本轮回复"];
    let completed = 0;
    let todo: ToolCallRow | undefined;
    let agent: ToolCallRow | undefined;
    let review: SubagentRow | undefined;
    // 停止先中断当前回合，不能让迟到增量改写下一轮。
    const reasoningIndex = session.rows.length;
    this.appendRow(session, reasoning);

    const finishReasoning = (state: "complete" | "interrupted") => {
      if (reasoning.state !== "streaming") return;
      reasoning = { ...reasoning, state, durationMs: Date.now() - reasoning.createdAt };
      this.upsertRow(session, reasoning);
    };
    const todoInput = (finished: boolean) => {
      const items = steps.map<PlanState["items"][number]>((content, index) => ({
        id: `${turnId}:${index}`,
        content,
        status:
          index < completed
            ? "completed"
            : index === completed && !finished
              ? "inProgress"
              : "pending",
      }));
      session.plan = { items, updatedAt: Date.now() };
      this.patchState(session, { plan: session.plan });
      return {
        todos: items.map((item) => ({
          ...item,
          status: item.status === "inProgress" ? "in_progress" : item.status,
        })),
      };
    };
    const updateTodo = (outcome?: "success" | "failed" | "cancelled") => {
      if (!todo) return;
      const input = todoInput(outcome !== undefined);
      todo = {
        ...todo,
        input,
        inputText: JSON.stringify(input),
        status: outcome === "failed" ? "error" : (outcome ?? "running"),
        ...(outcome ? { endedAt: Date.now() } : {}),
        ...(outcome === "failed"
          ? { error: { code: "fault.prototype.executionFailed", message: "本轮模拟工作未完成。" } }
          : {}),
      };
      this.upsertRow(session, todo);
    };
    const settleReview = (status: "success" | "failed" | "cancelled", summaryText: string) => {
      if (!agent || review?.status !== "running") return;
      const endedAt = Date.now();
      review = { ...review, status, summaryText, endedAt };
      this.upsertRow(session, review);
      this.upsertRow(session, {
        ...agent,
        status: status === "failed" ? "error" : status,
        endedAt,
        output: { text: summaryText },
        ...(status === "failed"
          ? { error: { code: "fault.prototype.executionFailed", message: summaryText } }
          : {}),
      });
    };
    return {
      explain: () => {
        const append = "\n\n先整理 Todo，再模拟子代理复核。";
        reasoning = { ...reasoning, text: reasoning.text + append };
        session.rows[reasoningIndex] = reasoning;
        this.emitConversationFrame(
          session,
          {
            kind: "deltas",
            deltas: [{ op: "row.delta", rowId: reasoning.rowId, path: "text", append }],
          },
          "online",
        );
      },
      startTodo: () => {
        finishReasoning("complete");
        todo = newTool("TodoWrite", todoInput(false));
        this.appendRow(session, todo);
      },
      startReview: () => {
        completed = 1;
        updateTodo();
        const subagentType = "原型复核";
        agent = newTool("Agent", {
          subagent_type: subagentType,
          description: "模拟复核本轮输入",
          prompt: "核对本轮已交付的输入。",
        });
        this.appendRow(session, agent);
        review = {
          ...rowBase(),
          kind: "subagent",
          parentToolCallId: agent.toolCallId,
          subagentType,
          status: "running",
          summaryText: "正在模拟复核本轮输入。",
          startedAt: agent.startedAt,
        };
        this.appendRow(session, review);
      },
      finishReview: (inputCount: number) => {
        settleReview("success", `原型复核已检查本轮 ${inputCount} 条输入，未启动真实子代理。`);
        completed = 2;
        updateTodo();
      },
      settle: (outcome: "success" | "failed" | "cancelled") => {
        finishReasoning(outcome === "success" ? "complete" : "interrupted");
        if (outcome === "success") completed = steps.length;
        else
          settleReview(outcome, outcome === "cancelled" ? "模拟复核已停止。" : "模拟复核未完成。");
        updateTodo(outcome);
      },
    };
  }

  private async runTurn(
    session: MockSession,
    input: MockInput,
    owner: MockActiveTurn,
  ): Promise<void> {
    const { startedAt, foregroundExecutionId } = owner.work;
    const { signal } = owner.controller;
    const modelSelection = session.config.modelSelection;
    const model = modelSelection?.modelId ?? session.config.model;
    const turnId = foregroundExecutionId;
    const responseId = `resp_${createUuid()}`;
    session.lastActivityAt = startedAt;
    session.phase = "running";
    delete session.lastError;
    this.patchExecution(session);

    const turnHeader: Extract<WireConversationRow, { kind: "turnHeader" }> = {
      kind: "turnHeader",
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: startedAt,
      createdAtSeq: session.seq,
      origin: "userInput",
      executionKind: "agent",
      sourceCommandId: input.commandId,
      state: "running",
      startedAt,
    };
    this.appendRow(session, turnHeader);
    const inputs: MockInput[] = [];
    const startedCommands: string[] = [];
    let work: ReturnType<MockZCodeAgentService["startMockTurnWork"]> | undefined;
    const discard = () => {
      for (const commandId of startedCommands)
        this.business?.discardNative(session.sessionId, commandId);
    };
    const enter = (submitted: MockInput) => {
      inputs.push(submitted);
      startedCommands.push(submitted.commandId);
      this.appendRow(session, {
        kind: "userInput",
        rowId: this.nextRowId(session),
        turnId,
        entityId: `entity_${createUuid()}`,
        createdAt: Date.now(),
        createdAtSeq: session.seq,
        text: submitted.text,
        origin: "realUser",
        sourceCommandId: submitted.commandId,
        clientId: submitted.clientId,
        attachments: submitted.attachments,
        conversationQuotes: submitted.conversationQuotes,
        modelSelection,
      });
      // AIReq 材料只消费用户语义；冻结的技能正文留在会话执行上下文。
      this.business?.beginNative(
        session.sessionId,
        submitted.commandId,
        submitted.text,
        modelSelection,
        submitted.context?.args,
      );
    };
    const consumeSteers = () => {
      for (let index = 0; index < session.queuedInputs.length; ) {
        const queued = session.queuedInputs[index]!;
        if (queued.retained || queued.item.delivery.admitted !== "guide") {
          index += 1;
          continue;
        }
        session.queuedInputs.splice(index, 1);
        this.patchQueue(session);
        enter(this.queuedInput(queued));
      }
    };
    signal.onabort = () => {
      discard();
      work?.settle("cancelled");
      this.interruptTurn(session, turnHeader, owner);
    };

    try {
      enter(input);
      work = this.startMockTurnWork(session, turnId, responseId);
      // 只恢复原型展示；保留投递检查点与执行窗口，不改变 steer、跟进及停止语义。
      await wait(160, undefined, { signal });
      work.explain();
      await wait(160, undefined, { signal });
      work.startTodo();
      await wait(220, undefined, { signal });
      consumeSteers();
      work.startReview();
      await wait(320, undefined, { signal });
      work.finishReview(inputs.length);
      await wait(160, undefined, { signal });
      if (signal.aborted || session.activeTurn !== owner) return;
      consumeSteers();
      const result = this.business?.prepareNativeResult(session.sessionId, startedCommands);
      const reply = result?.reply ?? standaloneReply(inputs);
      if (result) this.business!.completeNative(session.sessionId, result);
      work.settle("success");
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
        model,
      });
      this.finalizeTurn(session, turnHeader, owner, startedAt, reply);
    } catch (error) {
      if (signal.aborted || session.activeTurn !== owner) return;
      discard();
      work?.settle("failed");
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
        model,
      });
      this.interruptTurn(session, turnHeader, owner, message);
    }
  }

  private interruptTurn(
    session: MockSession,
    turnHeader: Extract<WireConversationRow, { kind: "turnHeader" }>,
    owner: MockActiveTurn,
    error?: string,
  ): void {
    owner.controller.signal.onabort = null;
    if (session.activeTurn !== owner) return;
    const endedAt = Date.now();
    session.activeTurn = null;
    session.phase = error ? "error" : "completedInterrupted";
    session.lastActivityAt = endedAt;
    if (error)
      session.lastError = {
        code: "fault.prototype.executionFailed",
        message: error,
        recoverable: true,
        at: endedAt,
        source: "runtime",
      };
    // 保留未交付的原提交；新的明确发送不会把这些输入带进无关执行。
    if (session.queuedInputs.some((input) => !input.retained)) {
      for (const input of session.queuedInputs) input.retained = true;
      session.pauseReason = error ? "error" : "stopped";
    }
    this.upsertRow(session, {
      ...turnHeader,
      state: error ? "failed" : "completedInterrupted",
      endedAt,
      activeMs: endedAt - turnHeader.startedAt,
    });
    this.patchExecution(session);
  }

  private patchExecution(session: MockSession): void {
    this.patchState(session, {
      ...projectMockExecution(session, !this.business),
      usage: session.usage,
      meta: session.meta,
    });
  }

  private finalizeTurn(
    session: MockSession,
    turnHeader: Extract<WireConversationRow, { kind: "turnHeader" }>,
    owner: MockActiveTurn,
    startedAt: number,
    reply: string,
  ): void {
    if (owner.controller.signal.aborted || session.activeTurn !== owner) return;
    owner.controller.signal.onabort = null;
    session.activeTurn = null;
    session.phase = "completedSuccess";
    session.lastActivityAt = Date.now();
    this.upsertRow(session, {
      ...turnHeader,
      state: "completedSuccess",
      endedAt: session.lastActivityAt,
      activeMs: session.lastActivityAt - startedAt,
      ...(this.business ? { outputTokens: Math.ceil(reply.length / 2) } : {}),
    });
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
    this.patchExecution(session);
    this.maybeStartFollowUp(session);
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
    if (params.workspace && !this.matchesWorkspace(session, params.workspace))
      throw this.sessionUnavailable();
    if (
      session.draftCreatorActor &&
      session.draftCreatorActor !== this.actorKey() &&
      !this.business?.isPublishedNativeSession(session.sessionId)
    )
      throw this.sessionUnavailable();
    return session;
  }

  private matchesWorkspace(
    session: MockSession,
    workspace: { workspacePath: string; workspaceIdentity?: string },
  ): boolean {
    return (
      session.workspaceRef.workspacePath === workspace.workspacePath &&
      ((this.standalone && workspace.workspaceIdentity === undefined) ||
        session.workspaceKey === workspaceKeyOf(workspace))
    );
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

  private ackNoop(envelope: CommandEnvelope, session: MockSession): CommandAck {
    return {
      commandId: envelope.commandId,
      status: "noop",
      revisionAtDecision: session.revision,
    };
  }

  private reject(
    envelope: CommandEnvelope,
    session: MockSession | null,
    reasonCode: string,
    message: string,
  ): CommandAck {
    return {
      commandId: envelope.commandId,
      status: "rejected",
      reasonCode,
      message,
      revisionAtDecision: session?.revision ?? 0,
    };
  }

  private rejectUnsupported(envelope: CommandEnvelope, session: MockSession | null): CommandAck {
    return this.reject(
      envelope,
      session,
      "fault.command.capabilityUnsupported",
      "当前服务暂不支持此操作。",
    );
  }

  private createQueueItem(
    session: MockSession,
    input: MockInput,
    delivery: "queue" | "guide",
  ): QueueItem {
    return assertFrame(queueItemSchema, {
      attachments: input.attachments ?? [],
      conversationQuotes: input.conversationQuotes,
      sourceCommandId: input.commandId,
      queueItemId: `input_${createUuid()}`,
      clientId: input.clientId,
      kind: "sendText",
      text: input.text,
      modelSelection: session.config.modelSelection,
      delivery: { requested: delivery, admitted: delivery },
      order: { admissionSeq: session.nextAdmissionSeq, queuePosition: session.queuedInputs.length },
      steer: { state: delivery === "guide" ? "steering" : "notRequested" },
      dispatch: { state: "queued" },
      admittedAt: Date.now(),
    });
  }

  private patchQueue(session: MockSession): void {
    this.patchState(session, { queue: projectMockQueue(session) });
  }

  private queuedInput({ item, context }: MockQueuedInput): MockInput {
    return {
      commandId: item.sourceCommandId,
      clientId: item.clientId,
      text: item.text,
      attachments: item.attachments,
      conversationQuotes: item.conversationQuotes,
      context,
    };
  }

  private startTurn(session: MockSession, input: MockInput): void {
    const owner: MockActiveTurn = {
      controller: new AbortController(),
      work: {
        kind: "primaryTurn",
        foregroundExecutionId: `turn_${createUuid()}`,
        sourceCommandId: input.commandId,
        startedAt: Date.now(),
      },
    };
    session.activeTurn = owner;
    void this.runTurn(session, input, owner);
  }

  private maybeStartFollowUp(session: MockSession): void {
    if (this.runtime.sessions.get(session.sessionId) !== session || session.activeTurn) return;
    const index = session.queuedInputs.findIndex(
      ({ item, retained }) => !retained && item.delivery.admitted === "queue",
    );
    if (index < 0) return;
    const [next] = session.queuedInputs.splice(index, 1);
    this.startTurn(session, this.queuedInput(next!));
  }

  private parseConversationInput(text: string, skills: readonly SkillSummary[]): MockParsedInput {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return { kind: "text" };
    const token = /^\S+/u.exec(trimmed)![0];
    const name = token.slice(1);
    const args = trimmed.slice(token.length).trim();
    const builtin = BUILTIN_COMMANDS.find((command) => command.name === name);
    if (builtin) return { kind: "builtin", name: builtin.name, args };
    if (name.startsWith("skill:")) {
      const skill = skills.find((entry) => entry.name === name.slice("skill:".length));
      if (skill) return { kind: "text", context: { skill, args } };
      return { kind: "rejected", message: "此会话未启用该技能。" };
    }
    return { kind: "rejected", message: "当前服务不支持此命令。" };
  }

  private handleBuiltinCommand(
    session: MockSession,
    envelope: CommandEnvelope,
    command: Extract<MockParsedInput, { kind: "builtin" }>,
  ): CommandAck {
    const { name, args } = command;
    if (name === "session" && (args === "" || args === "info")) {
      return this.ackAccepted(envelope, {
        type: "localCommand",
        name,
        output: `会话：${session.meta.title || "未命名会话"}\n会话 ID：${session.sessionId}\n模型：${session.config.model}\n状态：${session.phase}`,
      });
    }
    if (name === "rename" && args && !/[\r\n]/.test(args)) {
      this.business?.assertNativeWritable(session.sessionId);
      this.renameSession(session, args);
      return this.ackAccepted(envelope, {
        type: "localCommand",
        name,
        output: `会话已重命名为「${args}」。`,
      });
    }
    return this.reject(
      envelope,
      session,
      "fault.command.invalidArguments",
      name === "rename" ? "用法：/rename <title>。" : "用法：/session 或 /session info。",
    );
  }

  private renameSession(session: MockSession, title: string): void {
    session.meta = { title, titleSource: "custom" };
    const task = this.runtime.tasks.get(session.sessionId);
    if (task) {
      task.title = title;
      task.titleSource = "custom";
    }
    this.patchState(session, { meta: session.meta });
  }

  private createSessionInternal(envelope: CommandEnvelope, directory?: string): CommandAck {
    const payload = envelope.payload as WebCreateSessionPayload;
    // 首发无法执行时必须在创建会话/索引之前拒绝，不能返回“创建并发送”空成功。
    if (payload.firstInput && !this.business && !this.standalone)
      return this.rejectUnsupported(envelope, null);
    const chatConfig = this.standalone
      ? completeMockModelSelection(payload.config?.modelSelection ?? MOCK_DEFAULT_MODEL_SELECTION)
      : null;
    if (this.standalone && !chatConfig) return this.rejectUnsupported(envelope, null);
    if (!envelope.workspace) throw new Error("创建会话缺少请求工作区。");
    // 对客户端保留它选择的路径，规范身份由已校验的真实目录生成，不回传真实宿主路径。
    const sessionRef =
      directory === undefined
        ? workspaceRefOf(envelope.workspace)
        : {
            workspacePath: envelope.workspace.workspacePath,
            workspaceIdentity: workspaceKeyOf({ workspacePath: directory }),
          };
    const sessionId = payload.sessionId ?? this.runtime.newSessionId();
    const actor = this.business?.actorKey();
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
      return this.ackAccepted(envelope, {
        type: "createSession",
        sessionId,
        workspace: existing.workspaceRef,
      });
    }
    const skills = this.readEnabledSkills(sessionRef.workspacePath);
    const firstInput = payload.firstInput;
    const parsed = firstInput ? this.parseConversationInput(firstInput.text, skills) : undefined;
    if (parsed?.kind === "rejected")
      return this.reject(envelope, null, "fault.command.unsupportedSlashCommand", parsed.message);
    if (parsed?.kind === "builtin")
      return this.reject(envelope, null, "guard.command.sessionRequired", "此命令需要已有会话。");
    if (firstInput && !firstInput.attachments?.length && !firstInput.text.trim())
      return this.reject(envelope, null, "fault.command.emptyInput", "请输入要发送的消息。");
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
      skills,
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
      queuedInputs: [],
      nextAdmissionSeq: 1,
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
    const config = payload.config;
    if (config) {
      const { provider, model, thought, followupMode, modelSelection } = config;
      if (provider !== undefined) session.config.provider = provider;
      if (model !== undefined) session.config.model = model;
      if (thought !== undefined) session.config.thought = thought;
      if (followupMode !== undefined) session.config.followupMode = followupMode;
      if (modelSelection !== undefined) session.config.modelSelection = modelSelection;
    }
    if (chatConfig) Object.assign(session.config, chatConfig);
    this.validateInputAttachments(session, firstInput?.attachments ?? []);
    if (firstInput) {
      this.applyNativeBinding(session);
      this.business?.admitNative(sessionId, envelope.commandId, firstInput.text);
    }
    try {
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
    } catch (error) {
      if (firstInput) this.business?.discardNative(sessionId, envelope.commandId);
      throw error;
    }
    this.runtime.sessions.set(sessionId, session);
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

    if (firstInput) {
      const input = this.makeInput(
        envelope,
        firstInput,
        parsed?.kind === "text" ? parsed.context : undefined,
      );
      this.startSubmittedTurn(session, input);
      return this.ackAccepted(envelope, {
        type: "createSession",
        sessionId,
        workspace: session.workspaceRef,
        input: { delivery: "startNow", inputId: `input_${createUuid()}` },
      });
    }
    return this.ackAccepted(envelope, {
      type: "createSession",
      sessionId,
      workspace: session.workspaceRef,
    });
  }

  private validateInputAttachments(
    session: MockSession,
    attachments: QueueItem["attachments"],
  ): void {
    const actor = this.actorKey() ?? "mock";
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

  private allowsWebInput(payload: MockTextSubmission): boolean {
    return (
      (!this.standalone || !payload.attachments?.length) &&
      !payload.conversationQuotes?.some(({ comment }) => comment !== undefined) &&
      Object.entries(payload).every(
        ([key, value]) =>
          value === undefined ||
          key === "text" ||
          key === "attachments" ||
          key === "streamingBehavior" ||
          (key === "conversationQuotes" && this.business !== undefined),
      )
    );
  }

  private allowsWebPayload(envelope: CommandEnvelope): boolean {
    if (envelope.type === "sendText")
      return this.allowsWebInput(envelope.payload as MockTextSubmission);
    if (envelope.type !== "createSession") return true;

    const payload = envelope.payload as WebCreateSessionPayload;
    const config = payload.config;
    return (
      payload.additionalDirectories === undefined &&
      payload.cwd === undefined &&
      payload.worktreeCreation === undefined &&
      payload.permissionScope === undefined &&
      payload.mcpServers === undefined &&
      payload.offPeakToolEnabled === undefined &&
      config?.mode === undefined &&
      config?.planEnabled === undefined &&
      (!payload.firstInput || this.allowsWebInput(payload.firstInput))
    );
  }

  private sendTextInternal(session: MockSession, envelope: CommandEnvelope): CommandAck {
    if (!this.business && !this.standalone) return this.rejectUnsupported(envelope, session);
    const payload = envelope.payload as MockTextSubmission;
    const parsed = this.parseConversationInput(payload.text, session.skills);
    if (parsed.kind === "rejected")
      return this.reject(
        envelope,
        session,
        "fault.command.unsupportedSlashCommand",
        parsed.message,
      );
    if (parsed.kind === "builtin") {
      if (payload.attachments?.length) return this.rejectUnsupported(envelope, session);
      return this.handleBuiltinCommand(session, envelope, parsed);
    }
    if (!payload.text.trim() && !payload.attachments?.length)
      return this.reject(envelope, session, "fault.command.emptyInput", "请输入要发送的消息。");
    // 两个浏览器都可能按空闲状态发出输入；独立聊天把后到输入交给现有跟进队列。
    if (session.activeTurn && !payload.streamingBehavior && !this.standalone)
      return this.reject(
        envelope,
        session,
        "guard.command.streamingBehaviorRequired",
        "请选择引导当前执行或随后运行。",
      );
    this.validateInputAttachments(session, payload.attachments ?? []);
    return this.admitText(session, envelope, payload, parsed.context);
  }

  private admitText(
    session: MockSession,
    envelope: CommandEnvelope,
    payload: MockTextSubmission,
    context?: MockInputContext,
  ): CommandAck {
    const input = this.makeInput(envelope, payload, context);
    const delivery = payload.streamingBehavior === "steer" ? "guide" : "queue";
    const queued = session.activeTurn ? this.createQueueItem(session, input, delivery) : undefined;
    if (
      queued &&
      jsonByteLength(projectMockQueue(session).items) + jsonByteLength(queued) + 1 >
        CHAT_QUEUE_MAX_BYTES
    )
      return this.reject(
        envelope,
        session,
        "guard.chat.queueFull",
        "待发送的消息过多，请等当前回合处理完成。",
      );
    this.applyNativeBinding(session);
    this.business?.admitNative(session.sessionId, envelope.commandId, payload.text);
    if (queued) {
      session.nextAdmissionSeq += 1;
      session.queuedInputs.push({ item: queued, context });
      this.patchQueue(session);
      return this.ackAccepted(envelope, {
        type: "inputAccepted",
        delivery,
        inputId: queued.queueItemId,
      });
    }
    this.startSubmittedTurn(session, input);
    return this.ackAccepted(envelope, {
      type: "inputAccepted",
      delivery: "startNow",
      inputId: `input_${createUuid()}`,
    });
  }

  private makeInput(
    envelope: CommandEnvelope,
    payload: MockTextSubmission,
    context?: MockInputContext,
  ): MockInput {
    return {
      commandId: envelope.commandId,
      clientId: envelope.clientId,
      text: payload.text,
      attachments: payload.attachments,
      conversationQuotes: payload.conversationQuotes,
      context,
    };
  }

  private startSubmittedTurn(session: MockSession, input: MockInput): void {
    if (this.standalone && session.meta.titleSource === "default")
      session.meta = { title: textToTitle(input.text), titleSource: "generated" };
    this.startTurn(session, input);
  }

  private handleEnvelope(envelope: CommandEnvelope, directory?: string): CommandAck {
    if (envelope.type === "createSession") {
      return this.createSessionInternal(envelope, directory);
    }
    // 会话范围、产品能力和载荷已在收据入口检查；退役命令不能借归属检查补建会话。
    const session = this.ensureSession({
      sessionId: envelope.sessionId!,
      workspace: envelope.workspace,
      allowSeed: envelope.type !== "switchModelConfig",
    });
    if (envelope.type === "switchModelConfig" && envelope.baseRevision !== session.revision) {
      return {
        commandId: envelope.commandId,
        status: "rejected",
        reasonCode: "proto.staleRevision",
        revisionAtDecision: session.revision,
      };
    }
    // 普通输入和本地命令分别按实际写入行为校验业务权限。
    if (envelope.type === "stop" || envelope.type === "renameSession")
      this.business?.assertNativeWritable(session.sessionId);
    switch (envelope.type) {
      case "sendText":
        return this.sendTextInternal(session, envelope);
      case "stop": {
        const active = session.activeTurn;
        if (!active) return this.ackNoop(envelope, session);
        const { expectedForegroundExecutionId } = envelope.payload as CommandPayloadMap["stop"];
        if (expectedForegroundExecutionId !== active.work.foregroundExecutionId)
          return this.reject(
            envelope,
            session,
            "guard.stop.foregroundChanged",
            "当前执行已变化，未中断其他执行。",
          );
        active.controller.abort();
        return this.ackAccepted(envelope);
      }
      case "renameSession": {
        const payload = envelope.payload as { title: string };
        this.renameSession(session, payload.title);
        return this.ackAccepted(envelope);
      }
      case "switchModelConfig": {
        const payload = envelope.payload as CommandPayloadMap["switchModelConfig"];
        const previous = session.config;
        const chatConfig = completeMockModelSelection({
          providerId: payload.provider,
          modelId: payload.model,
          options: { reasoningLevel: payload.thought },
        });
        if (!chatConfig) return this.rejectUnsupported(envelope, session);
        if (session.activeTurn)
          return this.reject(envelope, session, "guard.session.busy", "当前回合结束后可切换模型。");
        session.config = { ...session.config, ...chatConfig };
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
      default:
        throw new Error("未装配已公开的 Web 会话命令。");
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
      },
      auth: {},
    };
  }

  async initializeConversationV4(_clientHello: ClientHello): Promise<void> {}

  private applyNativeBinding(session: MockSession): void {
    if (!this.business || session.nativeBindingApplied) return;
    const binding = this.business.getNativeBinding(session.sessionId);
    if (binding) {
      session.nativeBindingApplied = true;
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
  }

  async subscribeConversationV4(params: P<WebAIReqAgent["subscribeConversationV4"]>) {
    // 必须先验证原始入参，不能在预热／订阅之前只挑已知字段导致额外键被吞掉。
    conversationSubscribeInputSchema.parse(params);
    const workspaceKey = workspaceKeyOf(params);
    const session = this.ensureOrSeedDraftSession(params, workspaceKey);
    this.applyNativeBinding(session);
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
      const snapshot = buildConversationSnapshot(session, !this.business);
      this.emitConversationFrame(
        session,
        { kind: "snapshot", snapshot },
        "initial",
        subscriptionId,
      );
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
      skills: this.readEnabledSkills(params.workspacePath),
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
      queuedInputs: [],
      nextAdmissionSeq: 1,
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

  async resyncConversationV4(params: P<WebAIReqAgent["resyncConversationV4"]>) {
    const sub = this.conversationSubs.get(params.subscriptionId);
    const session = sub ? this.runtime.sessions.get(sub.sessionId) : undefined;
    if (!sub || !session) {
      throw new Error("fault.subscription.unknownSubscription");
    }
    this.ensureSession({ sessionId: session.sessionId, workspace: params, allowSeed: false });
    const snapshot = buildConversationSnapshot(session, !this.business);
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

  async conversationRowsRangeV4(params: P<WebAIReqAgent["conversationRowsRangeV4"]>) {
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
      atRevision: session?.revision ?? 0,
      atLogEpoch: session?.logEpoch ?? "unknown",
      hasMore: start > 0,
    };
  }

  async sendConversationCommandV4(
    params: P<IZCodeAgentService["sendConversationCommandV4"]>,
  ): Promise<CommandAck> {
    const parsed = commandEnvelopeSchema.safeParse(params.envelope);
    if (!parsed.success) {
      return {
        commandId: params.envelope.commandId,
        status: "rejected",
        reasonCode: "fault.command.invalidEnvelope",
        revisionAtDecision: 0,
      };
    }
    const supported = (this.standalone ? CHAT_COMMANDS : AIREQ_COMMANDS).has(parsed.data.type);
    const payloadSchema =
      parsed.data.type === "createSession"
        ? webCreateSessionPayloadSchema
        : commandPayloadSchemas[parsed.data.type];
    const payload = supported ? payloadSchema.safeParse(parsed.data.payload) : undefined;
    const envelope = payload?.success ? { ...parsed.data, payload: payload.data } : parsed.data;
    // 执行与查询使用同一可信 actor 和请求工作区。
    const requestWorkspace = {
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
    };
    const actor = this.actorKey() ?? "mock";
    const key = this.receiptKey(actor, requestWorkspace, envelope);
    const serialized = JSON.stringify(envelope);
    const digest = createHash("sha256").update(serialized).digest("hex");
    const replay = () => {
      const prior = this.commandResults.get(key);
      if (prior && prior.digest !== digest) throw new Error("原生消息编号不能用于不同输入。");
      return prior?.ack;
    };
    const prior = replay();
    if (prior) return prior;
    let ack: CommandAck;
    if (!supported) {
      ack = this.rejectUnsupported(envelope, null);
    } else if (this.standalone && Buffer.byteLength(serialized) > CHAT_COMMAND_MAX_BYTES) {
      ack = this.reject(envelope, null, "fault.chat.inputTooLarge", "消息过长，请分段发送。");
    } else if (
      !payload?.success ||
      (envelope.type === "createSession") !== (envelope.sessionId === null) ||
      (COMMANDS_REQUIRING_BASE_REVISION.has(envelope.type) && envelope.baseRevision === undefined)
    ) {
      ack = this.reject(envelope, null, "fault.command.invalidEnvelope", "命令信封无效。");
    } else if (!this.allowsWebPayload(envelope)) {
      ack = this.rejectUnsupported(envelope, null);
    } else {
      const directory =
        this.standalone && envelope.type === "createSession"
          ? await this.standalone.resolveDirectory(params.workspacePath)
          : undefined;
      const concurrent = replay();
      if (concurrent) return concurrent;
      ack = this.handleEnvelope(
        {
          ...envelope,
          workspace: { ...requestWorkspace, workspaceKey: workspaceKeyOf(requestWorkspace) },
        },
        directory,
      );
    }
    this.commandResults.set(key, { digest, ack });
    return ack;
  }

  private receiptKey(
    actor: string,
    workspace: { workspacePath: string; workspaceIdentity?: string },
    key: { sessionId: string | null; commandId: string },
  ): string {
    return JSON.stringify([
      actor,
      workspace.workspacePath,
      workspaceKeyOf(workspace),
      key.sessionId,
      key.commandId,
    ]);
  }

  async queryConversationCommandsV4(
    params: P<WebAIReqAgent["queryConversationCommandsV4"]>,
  ): Promise<WebCommandsQueryResult> {
    const { commands } = commandsQueryParamsSchema.parse({ commands: params.commands });
    const actor = this.actorKey() ?? "mock";
    return {
      results: commands.map((key) => {
        const ack = this.commandResults.get(this.receiptKey(actor, params, key))?.ack;
        return { key, result: ack ? projectWebCommandAck(ack) : "unknown" };
      }),
    };
  }

  onDynamicConversationFrame(
    _params: P<IZCodeAgentService["onDynamicConversationFrame"]>,
  ): ReturnType<IZCodeAgentService["onDynamicConversationFrame"]> {
    return this.conversationFrameEmitter.event as unknown as ReturnType<
      IZCodeAgentService["onDynamicConversationFrame"]
    >;
  }

  // ── 附件 ──

  async attachmentBeginV4(params: P<WebAIReqAgent["attachmentBeginV4"]>) {
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
          state: "committed" as const,
          ref: upload.ref,
        }
      : {
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
  async attachmentChunkV4(params: P<WebAIReqAgent["attachmentChunkV4"]>) {
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
    return { nextChunkIndex: upload.chunks.length };
  }
  async attachmentCommitV4(params: P<WebAIReqAgent["attachmentCommitV4"]>) {
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
  async attachmentAbortV4(params: P<WebAIReqAgent["attachmentAbortV4"]>): Promise<void> {
    const actor = this.business?.actorKey() ?? "mock";
    const value = this.uploads.get(`${actor}:${params.uploadId}`);
    if (value && value.sessionId !== params.sessionId) throw new Error("上传归属不符。");
    if (
      value?.ref &&
      ![...this.runtime.sessions.values()].some(
        (session) =>
          // ACK 后草稿 abort 只能移除暂存句柄，已接纳输入仍持有真实字节。
          session.queuedInputs.some(({ item }) =>
            item.attachments.some((attachment) => attachment.ref === value.ref),
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
      session.queuedInputs.some(({ item }) =>
        item.attachments.some((attachment) => attachment.ref === params.ref),
      );
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
  async attachmentReadV4(params: P<WebAIReqAgent["attachmentReadV4"]>) {
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
    return {
      dataBase64: bytes.toString("base64"),
      mediaType: value.mime,
      totalBytes: value.bytes.length,
    };
  }

  // ── 当前产品保留的 Skill 与命令目录 ──

  private readEnabledSkills(workspacePath: string): SkillSummary[] {
    return (
      this.standalone ? readBuiltinPrototypeSkills() : readPrototypeSkills(workspacePath)
    ).filter((skill) => skill.enabled && skill.body.trim().length > 0);
  }

  private skillReferences(
    skills: readonly SkillSummary[],
  ): AR<IZCodeAgentService["getSkillReferenceCatalog"]>["skills"] {
    return skills.map(({ id, name, description, path, scope, pluginName }) => ({
      id,
      name,
      description,
      path,
      scope,
      ...(pluginName ? { pluginName } : {}),
    }));
  }

  async getSkillReferenceCatalog(
    params: P<WebAIReqAgent["getSkillReferenceCatalog"]>,
  ): Promise<AR<IZCodeAgentService["getSkillReferenceCatalog"]>> {
    conversationCatalogInputSchema.parse(params);
    if (params.sessionId === undefined)
      return {
        authority: "workspace",
        skills: this.skillReferences(this.readEnabledSkills(params.workspacePath)),
      };
    // 目录必须属于已驻留且可访问的会话；补建或回退 workspace 会让新技能进入旧对话。
    const session = this.ensureSession({
      sessionId: params.sessionId,
      workspace: params,
      allowSeed: false,
    });
    // Skill 设计等私有业务会话的归属仍由业务 owner 校验，不能只核对 workspace。
    this.business?.getNativeBinding(session.sessionId);
    return { authority: "session", skills: this.skillReferences(session.skills) };
  }

  async getConversationCommandCatalog(
    params: P<WebAIReqAgent["getConversationCommandCatalog"]>,
  ): Promise<{ commands: ConversationCommandCatalogEntry[] }> {
    conversationCatalogInputSchema.parse(params);
    if (params.sessionId !== undefined) {
      const session = this.ensureSession({
        sessionId: params.sessionId,
        workspace: params,
        allowSeed: false,
      });
      this.business?.getNativeBinding(session.sessionId);
      return { commands: [...BUILTIN_COMMANDS, ...this.skillCommands(session.skills)] };
    }
    if (this.standalone) await this.standalone.resolveDirectory(params.workspacePath);
    return { commands: this.skillCommands(this.readEnabledSkills(params.workspacePath)) };
  }

  private skillCommands(skills: readonly SkillSummary[]): ConversationCommandCatalogEntry[] {
    const byName = new Map<string, ConversationCommandCatalogEntry>();
    for (const { name, description } of skills) {
      const command = `skill:${name}`;
      if (!byName.has(command))
        byName.set(command, { name: command, description, source: "skill" });
    }
    return [...byName.values()];
  }
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function standaloneReply(inputs: readonly MockInput[]): string {
  const sections = inputs.flatMap(({ text, context }) => {
    // 原型消费封装的技能指令与参数，不运行脚本，也不把正文复制到公开输出。
    if (context) {
      const args = context.args.split("\n", 1)[0]?.slice(0, 120);
      return [
        `已加载「${context.skill.name}」技能说明${args ? `，处理参数：${args}` : ""}。未执行外部操作。`,
      ];
    }
    const subject = text.trim().split("\n", 1)[0]?.slice(0, 120);
    return subject ? [`已收到：${subject}`] : [];
  });
  return ["本轮原型执行已完成。", ...sections].join("\n\n");
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
