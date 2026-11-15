/* eslint-disable max-lines -- IZCodeAgentService 是 150+ 方法的单一协议面：帧发射、命令分派
   与旧会话兼容桩必须实现同一个类才能保证契约完整，拆文件会让「实现完整性」分散到多处。 */
// 模拟 ZCode Agent 服务：实现 v4 conversation / sessions-index / workspace-config
// 三个 topic 的订阅-帧流协议与命令面。所有帧在发射前经 shared 的 zod schema 校验，
// 保证与真实执行端同一条协议契约（fail-closed，坏帧宁可抛错也不上线）。
// 方法签名统一从 IZCodeAgentService 派生（Parameters/ReturnType），避免与契约漂移。
import { createHash } from "node:crypto";
import { Emitter, Event, type IDisposable } from "@zcode/rpc";
import { createUuid, type SessionLifecycleSnapshot, type ZCodeSessionInfo } from "@zcode/shared";
import {
  conversationTopicFrameSchema,
  conversationTopicWireFrameSchema,
  parseCommandEnvelope,
  queueItemSchema,
  sessionsIndexTopicFrameSchema,
  sessionsIndexTopicWireFrameSchema,
  workspaceConfigTopicFrameSchema,
  workspaceConfigTopicWireFrameSchema,
  type ClientHello,
  type CommandAck,
  type CommandEnvelope,
  type CommandsQueryResult,
  type ConversationDelta,
  type ConversationTopicWireFrame,
  type HelloMessage,
  type QueueItem,
  type SessionsIndexTopicWireFrame,
  type StatePatch,
  type WireConversationRow,
  type WorkspaceConfigState,
  type WorkspaceConfigTopicWireFrame,
} from "@zcode/shared/zcode-protocol-v4";
import type { IZCodeAgentService } from "@zcode/services";
import {
  buildConversationSnapshot,
  buildSessionSummary,
  isListedSession,
  workspaceKeyOf,
  workspaceRefOf,
  type MockRuntime,
  type MockSession,
} from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;
type MockSubmission = Pick<QueueItem, "modelSelection" | "mode" | "planEnabled">;

interface ConversationSubscription {
  sessionId: string;
  ordinal: number;
}

interface SessionsIndexSubscription {
  workspaceKey: string;
  /** wire topic 沿用请求键；业务/水位仍按规范身份归一，兼容无 identity 的既有请求。 */
  wireWorkspaceKey: string;
  ordinal: number;
}

interface WorkspaceConfigSubscription {
  workspaceKey: string;
  wireWorkspaceKey: string;
  ordinal: number;
}

function assertFrame<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

/** workspace-config 目录：模拟后端没有可配置目录（只读空投影，形状按协议）。 */
const emptyWorkspaceConfigState: WorkspaceConfigState = {
  configOptions: [],
  slashCommands: [],
};

export class MockZCodeAgentService implements IZCodeAgentService {
  private readonly conversationFrameEmitter = new Emitter<ConversationTopicWireFrame>();
  private readonly sessionsIndexFrameEmitter = new Emitter<SessionsIndexTopicWireFrame>();
  private readonly workspaceConfigFrameEmitter = new Emitter<WorkspaceConfigTopicWireFrame>();
  private readonly sessionLifecycleEmitter = new Emitter<SessionLifecycleSnapshot>();
  private readonly runtimeRestartedEmitter = new Emitter<{ workspaceKey: string }>();
  private readonly conversationSubs = new Map<string, ConversationSubscription>();
  private readonly sessionsIndexSubs = new Map<string, SessionsIndexSubscription>();
  private readonly workspaceConfigSubs = new Map<string, WorkspaceConfigSubscription>();
  private sessionGeneration = 1;
  private storageGeneration = 0;

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
      admitNative(sessionId: string, commandId: string, text: string): void;
      publishNativeAdmission(sessionId: string): void;
      completeNative(sessionId: string, commandId: string, text: string): string;
      seedNative(sessionId: string): string | undefined;
      getNativeBinding(
        sessionId: string,
      ): { providerId: string; modelId: string; reasoning: string } | undefined;
      isPublishedNativeSession(sessionId: string): boolean;
      actorKey(): string;
      registerNativeDraft(
        sessionId: string,
        workspace: { workspacePath: string; workspaceIdentity?: string },
        original: () => boolean,
        exists: () => boolean,
      ): void;
      automations?: Partial<IZCodeAgentService>;
    },
  ) {
    for (const name of [
      "listAutomations",
      "listAllAutomations",
      "createAutomation",
      "updateAutomation",
      "deleteAutomation",
      "setAutomationEnabled",
      "restartAutomation",
      "runAutomationNow",
      "listAutomationRuns",
      "deleteAutomationRun",
    ] as const) {
      const method = business?.automations?.[name];
      if (method) Object.assign(this, { [name]: method });
    }
  }

  // ── 帧发射 ──

  private emitConversationFrame(
    session: MockSession,
    payload:
      | { kind: "snapshot"; snapshot: ReturnType<typeof buildConversationSnapshot> }
      | { kind: "deltas"; deltas: ConversationDelta[] },
    deliveryKind: "initial" | "online" | "recovery",
  ): void {
    const topic = `conversation/${session.sessionId}`;
    const isDelta = payload.kind === "deltas";
    const fromSeq = isDelta ? session.seq : 0;
    const toSeq = isDelta ? session.seq + 1 : session.seq;
    const wireFrames: ConversationTopicWireFrame[] = [];
    for (const [subscriptionId, sub] of this.conversationSubs) {
      if (sub.sessionId !== session.sessionId) continue;
      sub.ordinal += 1;
      const logicalFrame = assertFrame(conversationTopicFrameSchema, {
        topic,
        subscriptionId,
        fromSeq,
        toSeq,
        sentAt: Date.now(),
        payload,
      });
      const wire = assertFrame(conversationTopicWireFrameSchema, {
        wireVersion: 3,
        kind: "complete",
        deliveryKind,
        logicalFrameId: createUuid(),
        logicalFrameOrdinal: sub.ordinal,
        topic,
        subscriptionId,
        frame: logicalFrame,
      }) as ConversationTopicWireFrame;
      wireFrames.push(wire);
    }
    // 帧全部通过 schema 后再提交水位：校验失败不留下永久 seq 空洞。
    if (isDelta) session.seq = toSeq;
    for (const wire of wireFrames) this.conversationFrameEmitter.fire(wire);
  }

  private emitSessionsIndex(
    workspaceKey: string,
    payload:
      | { kind: "snapshot"; snapshot: { sessions: ReturnType<typeof buildSessionSummary>[] } }
      | {
          kind: "deltas";
          deltas: Array<
            | { op: "session.upserted"; session: ReturnType<typeof buildSessionSummary> }
            | { op: "session.removed"; sessionId: string }
          >;
        },
    deliveryKind: "initial" | "online" | "recovery",
  ): void {
    const canonicalTopic = `sessions-index/${workspaceKey}`;
    const subscribers = [...this.sessionsIndexSubs].filter(
      ([, sub]) => sub.workspaceKey === workspaceKey,
    );
    if (subscribers.length === 0) return;
    // topic 水位是工作区级唯一顺序：同一 workspace 的所有订阅者共享 (fromSeq, toSeq]。
    // 没有订阅者时不推进，避免产生无人观察的水位空洞。
    const current = this.runtime.topics.position(canonicalTopic);
    let logEpoch = current.logEpoch;
    let fromSeq = 0;
    let toSeq = current.seq;
    if (payload.kind === "deltas") {
      const advanced = this.runtime.topics.advance(canonicalTopic);
      logEpoch = advanced.logEpoch;
      fromSeq = advanced.fromSeq;
      toSeq = advanced.toSeq;
    }
    for (const [subscriptionId, sub] of subscribers) {
      const topic = `sessions-index/${sub.wireWorkspaceKey}`;
      sub.ordinal += 1;
      const inner =
        payload.kind === "snapshot"
          ? assertFrame(sessionsIndexTopicFrameSchema, {
              topic,
              subscriptionId,
              fromSeq,
              toSeq,
              sentAt: Date.now(),
              payload: {
                kind: "snapshot",
                snapshot: {
                  protocolVersion: 1,
                  workspaceId: sub.wireWorkspaceKey,
                  logEpoch,
                  sessions: payload.snapshot.sessions,
                },
              },
            })
          : assertFrame(sessionsIndexTopicFrameSchema, {
              topic,
              subscriptionId,
              fromSeq,
              toSeq,
              sentAt: Date.now(),
              payload: { kind: "deltas", deltas: payload.deltas },
            });
      const wire = assertFrame(sessionsIndexTopicWireFrameSchema, {
        wireVersion: 3,
        kind: "complete",
        deliveryKind,
        logicalFrameId: createUuid(),
        logicalFrameOrdinal: sub.ordinal,
        topic,
        subscriptionId,
        frame: inner,
      }) as SessionsIndexTopicWireFrame;
      this.sessionsIndexFrameEmitter.fire(wire);
    }
  }

  private emitWorkspaceConfigSnapshot(
    workspaceKey: string,
    deliveryKind: "initial" | "recovery",
  ): void {
    const canonicalTopic = `workspace-config/${workspaceKey}`;
    const subscribers = [...this.workspaceConfigSubs].filter(
      ([, sub]) => sub.workspaceKey === workspaceKey,
    );
    if (subscribers.length === 0) return;
    const position = this.runtime.topics.position(canonicalTopic);
    for (const [subscriptionId, sub] of subscribers) {
      const topic = `workspace-config/${sub.wireWorkspaceKey}`;
      sub.ordinal += 1;
      const inner = assertFrame(workspaceConfigTopicFrameSchema, {
        topic,
        subscriptionId,
        fromSeq: 0,
        toSeq: position.seq,
        sentAt: Date.now(),
        payload: {
          kind: "snapshot",
          snapshot: {
            protocolVersion: 1,
            workspaceId: sub.wireWorkspaceKey,
            logEpoch: position.logEpoch,
            config: emptyWorkspaceConfigState,
          },
        },
      });
      const wire = assertFrame(workspaceConfigTopicWireFrameSchema, {
        wireVersion: 3,
        kind: "complete",
        deliveryKind,
        logicalFrameId: createUuid(),
        logicalFrameOrdinal: sub.ordinal,
        topic,
        subscriptionId,
        frame: inner,
      }) as WorkspaceConfigTopicWireFrame;
      this.workspaceConfigFrameEmitter.fire(wire);
    }
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

  private publishSessionsIndexUpsert(session: MockSession): void {
    if (!this.runtime.sessions.has(session.sessionId) || !isListedSession(session)) return;
    this.emitSessionsIndex(
      session.workspaceKey,
      {
        kind: "deltas",
        deltas: [{ op: "session.upserted", session: buildSessionSummary(session) }],
      },
      "online",
    );
  }

  private publishSessionsIndexRemoved(workspaceKey: string, sessionId: string): void {
    this.emitSessionsIndex(
      workspaceKey,
      { kind: "deltas", deltas: [{ op: "session.removed", sessionId }] },
      "online",
    );
  }

  private nextRowId(session: MockSession): number {
    const last = session.rows.at(-1);
    return (last?.rowId ?? -1) + 1;
  }

  // ── turn 模拟：流式回复 + 工具调用 + plan ──

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async runTurn(
    session: MockSession,
    commandId: string,
    text: string,
    submission: MockSubmission,
  ): Promise<void> {
    const modelSelection = submission.modelSelection ?? session.config.modelSelection;
    const model = modelSelection?.modelId ?? session.config.model;
    const startedAt = Date.now();
    const turnId = `turn_${createUuid()}`;
    const responseId = `resp_${createUuid()}`;
    session.lastActivityAt = startedAt;
    session.phase = "running";
    this.patchState(session, {
      control: {
        phase: "running",
        sessionEnded: false,
        canStop: true,
        stopState: "stoppable",
        stopTargetKind: "assistant",
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
      clientId: "mock-client",
      inputOrigin: "desktop",
      attachments: this.turnAttachments.get(commandId),
      modelSelection,
      ...(submission.mode !== undefined ? { mode: submission.mode } : {}),
      ...(submission.planEnabled !== undefined ? { planEnabled: submission.planEnabled } : {}),
    };
    this.appendRow(session, userInputRow);
    this.publishSessionsIndexUpsert(session);
    // phase 已是 running：任务索引（controller/tasks-index）必须能看到活跃任务。
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: session.workspaceRef.workspacePath,
      type: "workspace_task_list_changed",
    });

    if (this.business) {
      await this.sleep(80);
      if (session.activeTurn === null) return this.finalizeInterruptedTurn(session, turnHeader);
      try {
        const reply = this.business.completeNative(session.sessionId, commandId, text);
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
        this.finalizeTurn(session, turnHeader, startedAt, reply);
      } catch (error) {
        this.appendRow(session, {
          kind: "assistantText",
          rowId: this.nextRowId(session),
          turnId,
          entityId: `entity_${createUuid()}`,
          createdAt: Date.now(),
          createdAtSeq: session.seq,
          assistantResponseId: responseId,
          text: `业务产物未完成：${error instanceof Error ? error.message : String(error)}。消息已保留，请重新读取当前材料；不会假报成功。`,
          state: "complete",
          model,
        });
        this.finalizeInterruptedTurn(session, turnHeader);
      }
      return;
    }

    // 工具调用演示：读取虚拟工作区文件，驱动工具卡渲染。
    const toolCallRow: WireConversationRow = {
      kind: "toolCall",
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: Date.now(),
      createdAtSeq: session.seq,
      assistantResponseId: responseId,
      toolCallId: `tool_${createUuid()}`,
      toolName: "read_file",
      status: "running",
      inputText: JSON.stringify({ path: "README.md" }),
      input: { path: "README.md" },
      startedAt: Date.now(),
    };
    this.appendRow(session, toolCallRow);
    await this.sleep(60);
    if (session.activeTurn === null) {
      return this.finalizeInterruptedTurn(session, turnHeader);
    }

    const succeededTool: WireConversationRow = {
      ...toolCallRow,
      status: "success",
      output: {
        text: "# ZCode Web Demo\n\n这是一个模拟后端驱动的演示工作区。（内容节选）",
      },
      endedAt: Date.now(),
    };
    this.upsertRow(session, succeededTool);

    // plan/todo 面板演示。
    session.plan = {
      items: [
        { id: "1", content: "分析请求内容", status: "completed" },
        { id: "2", content: "整理回复要点", status: "inProgress" },
        { id: "3", content: "输出结论", status: "pending" },
      ],
      updatedAt: Date.now(),
    };
    this.patchState(session, { plan: session.plan });

    const streamingRow: WireConversationRow = {
      kind: "assistantText",
      rowId: this.nextRowId(session),
      turnId,
      entityId: `entity_${createUuid()}`,
      createdAt: Date.now(),
      createdAtSeq: session.seq,
      assistantResponseId: responseId,
      text: "",
      state: "streaming",
      model,
    };
    this.appendRow(session, streamingRow);

    const reply = this.buildReplyText(text);
    const chunkSize = 24;
    for (let offset = 0; offset < reply.length; offset += chunkSize) {
      if (session.activeTurn === null) {
        this.upsertRow(session, {
          ...streamingRow,
          text: reply.slice(0, offset),
          state: "interrupted",
        });
        return this.finalizeInterruptedTurn(session, turnHeader);
      }
      const chunk = reply.slice(offset, offset + chunkSize);
      this.emitConversationFrame(
        session,
        {
          kind: "deltas",
          deltas: [{ op: "row.delta", rowId: streamingRow.rowId, path: "text", append: chunk }],
        },
        "online",
      );
      await this.sleep(45);
    }

    this.upsertRow(session, { ...streamingRow, text: reply, state: "complete" });
    this.finalizeTurn(session, turnHeader, startedAt, reply);
  }

  private finalizeInterruptedTurn(session: MockSession, turnHeader: WireConversationRow): void {
    // turn 已收口：清掉运行句柄，后续 sendText 才会开始新 turn，队列才允许续跑。
    session.activeTurn = null;
    session.phase = "completedInterrupted";
    session.lastActivityAt = Date.now();
    if (turnHeader.kind === "turnHeader") {
      this.upsertRow(session, {
        ...turnHeader,
        state: "completedInterrupted",
        endedAt: Date.now(),
        activeMs: Date.now() - turnHeader.startedAt,
      });
    }
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
    this.publishSessionsIndexUpsert(session);
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: session.workspaceRef.workspacePath,
      type: "workspace_task_list_changed",
    });
    this.maybeStartNextInput(session);
  }

  private finalizeTurn(
    session: MockSession,
    turnHeader: WireConversationRow,
    startedAt: number,
    reply: string,
  ): void {
    // turn 已收口：清掉运行句柄，后续 sendText 才会开始新 turn，队列才允许续跑。
    session.activeTurn = null;
    session.phase = "completedSuccess";
    session.lastActivityAt = Date.now();
    if (turnHeader.kind === "turnHeader") {
      this.upsertRow(session, {
        ...turnHeader,
        state: "completedSuccess",
        endedAt: Date.now(),
        activeMs: Date.now() - startedAt,
        outputTokens: Math.ceil(reply.length / 2),
      });
    }
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
    if (session.meta.titleSource === "default") {
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
    this.publishSessionsIndexUpsert(session);
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: session.workspaceRef.workspacePath,
      type: "workspace_task_list_changed",
    });
    this.maybeStartNextInput(session);
  }

  /** 模拟回复正文：确定性生成，不访问网络。 */
  private buildReplyText(input: string): string {
    const trimmed = input.trim();
    return [
      `已收到你的消息：「${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}」。`,
      "",
      "这是模拟后端生成的回复。当前链路为：",
      "",
      "1. 浏览器 UI 通过 WebSocket RPC 连接模拟服务；",
      "2. 模拟服务按 ZCode Protocol v4 推送会话帧（快照 + 增量）；",
      "3. 流式文本、工具调用与计划面板均由内存状态驱动。",
      "",
      "你可以继续发送消息、新建任务、在侧栏重命名/归档，或在设置页浏览各项配置。",
    ].join("\n");
  }

  // ── 会话与命令 ──

  private ensureSession(params: {
    sessionId: string;
    workspace?: { workspacePath: string; workspaceIdentity?: string };
  }): MockSession {
    let session = this.runtime.sessions.get(params.sessionId);
    if (!session && params.workspace && this.business?.getNativeBinding(params.sessionId))
      session = this.ensureOrSeedDraftSession(
        { ...params.workspace, sessionId: params.sessionId },
        workspaceKeyOf(params.workspace),
      );
    if (!session) throw new Error(`fault.command.sessionNotFound: ${params.sessionId}`);
    if (
      params.workspace &&
      (session.workspaceKey !== workspaceKeyOf(params.workspace) ||
        session.workspaceRef.workspacePath !== params.workspace.workspacePath)
    ) {
      // 会话按工作区隔离：不属于调用方工作区的会话对外等价于不存在。
      throw new Error(`fault.command.sessionNotFound: ${params.sessionId}`);
    }
    if (
      session.draftCreatorActor &&
      session.draftCreatorActor !== this.business?.actorKey() &&
      !this.business?.isPublishedNativeSession(session.sessionId)
    )
      throw new Error(`fault.command.sessionNotFound: ${params.sessionId}`);
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
      message: `mock: 命令 ${envelope.type} 未实现`,
      revisionAtDecision: session?.revision ?? 0,
    };
  }

  private createQueueItem(
    session: MockSession,
    envelope: CommandEnvelope,
    text: string,
  ): QueueItem {
    const queueItemId = `input_${createUuid()}`;
    const submission = envelope.payload as MockSubmission;
    return assertFrame(queueItemSchema, {
      inputOrigin: "desktop",
      // 附件归已接纳输入所有，不属于编辑锁，也不能被空数组覆盖。
      attachments: this.turnAttachments.get(envelope.commandId) ?? [],
      sourceCommandId: envelope.commandId,
      queueItemId,
      clientId: envelope.clientId,
      kind: "sendText",
      text,
      ...(submission.modelSelection ? { modelSelection: submission.modelSelection } : {}),
      ...(submission.mode !== undefined ? { mode: submission.mode } : {}),
      ...(submission.planEnabled !== undefined ? { planEnabled: submission.planEnabled } : {}),
      delivery: { requested: "queue", admitted: "queue" },
      order: {
        admissionSeq: session.nextAdmissionSeq++,
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
    text: string,
    attachments?: QueueItem["attachments"],
    submission: MockSubmission = {},
  ): void {
    // 队列编辑后的附件以队列项为准，沿用原命令身份进入同一 turn 管线。
    if (attachments !== undefined) this.turnAttachments.set(commandId, attachments);
    session.activeTurn = {
      abort: () => {
        session.activeTurn = null;
      },
    };
    void this.runTurn(session, commandId, text, submission);
  }

  /** turn 结束后处理 sendQueuedNow 提升项或 autoDrain 队列；运行中不并发开新 turn。 */
  private maybeStartNextInput(session: MockSession): void {
    // 删除后旧 turn 可能才结束，不能让它复活索引或继续启动排队输入。
    if (!this.runtime.sessions.has(session.sessionId) || session.activeTurn !== null) return;
    if (session.pendingStartInput !== null) {
      const input = session.pendingStartInput;
      session.pendingStartInput = null;
      this.startTurn(session, input.sourceCommandId, input.text, input.attachments, input);
      return;
    }
    if (!session.autoDrain) return;
    const next = session.queuedInputs.shift();
    if (!next) return;
    this.patchQueue(session);
    this.startTurn(session, next.sourceCommandId, next.text, next.attachments, next);
  }

  private createSessionInternal(envelope: CommandEnvelope): CommandAck {
    const payload = envelope.payload as {
      sessionId?: string;
      firstInput?: {
        text: string;
        attachments?: import("@zcode/shared/zcode-protocol-v4").AttachmentRef[];
        modelSelection?: import("@zcode/shared").ModelSelection;
      };
      config?: Record<string, unknown>;
    };
    if (!envelope.workspace) throw new Error("创建会话缺少请求工作区。");
    const sessionRef = workspaceRefOf(envelope.workspace);
    const sessionId = payload.sessionId ?? this.runtime.newSessionId();
    const existing = this.runtime.sessions.get(sessionId);
    // 刷新/重复准备不能用新 createSession 覆盖已接纳 rows；首发重放由 commandId 收据对账。
    if (existing) {
      if (
        existing.workspaceKey !== workspaceKeyOf(sessionRef) ||
        existing.workspaceRef.workspacePath !== sessionRef.workspacePath ||
        (existing.draftCreatorActor && existing.draftCreatorActor !== this.business?.actorKey())
      )
        throw new Error("fault.command.sessionNotFound");
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
      ...(this.business ? { draftCreatorActor: this.business.actorKey() } : {}),
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
    if (!this.business) {
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
      this.publishSessionsIndexUpsert(session);
      this.runtime.onWorkspaceTaskListChanged.fire({
        workspacePath: sessionRef.workspacePath,
        type: "workspace_task_list_changed",
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
    const payload = envelope.payload as MockSubmission & {
      text: string;
      attachments?: import("@zcode/shared/zcode-protocol-v4").AttachmentRef[];
    };
    // 先校验真实字节及归属，再执行业务接纳；失败不能留下已采用的输入。
    this.validateInputAttachments(session, payload.attachments ?? []);
    this.business?.admitNative(session.sessionId, envelope.commandId, payload.text);
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
    if (session.activeTurn !== null) {
      // 运行中发送真实进入队列：ACK 的 delivery=queue 与 snapshot.queue.items 一致。
      const item = this.createQueueItem(session, envelope, payload.text);
      session.queuedInputs.push(item);
      this.patchQueue(session);
      this.business?.publishNativeAdmission(session.sessionId);
      return this.ackAccepted(envelope, {
        type: "inputAccepted",
        delivery: "queue",
        inputId: item.queueItemId,
      });
    }
    this.startTurn(session, envelope.commandId, payload.text, undefined, payload);
    this.business?.publishNativeAdmission(session.sessionId);
    return this.ackAccepted(envelope, {
      type: "inputAccepted",
      delivery: "startNow",
      inputId: `input_${createUuid()}`,
    });
  }

  private handleEnvelope(envelope: CommandEnvelope): CommandAck {
    if (envelope.type === "createSession") {
      return this.createSessionInternal(envelope);
    }
    if (!envelope.sessionId) {
      // 没有会话归属的命令（如 createSelectionSideSession）一律走未实现分支，不先抛 fault。
      return this.rejectUnsupported(envelope, null);
    }
    const session = this.ensureSession({
      sessionId: envelope.sessionId,
      workspace: envelope.workspace,
    });
    switch (envelope.type) {
      case "sendText":
        return this.sendTextInternal(session, envelope);
      case "stop": {
        if (session.activeTurn !== null) {
          // stop 暂停自动续跑：队列保留，直到 setAutoDrain 恢复。
          session.autoDrain = false;
          session.pauseReason = "stopped";
          session.activeTurn.abort();
          session.activeTurn = null;
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
          session.activeTurn = null;
        } else {
          this.startTurn(session, item.sourceCommandId, item.text, item.attachments, item);
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
        if (payload.editorId && item.editLock?.editorId !== payload.editorId) {
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
        // 同一命令释放编辑锁（docs/ui/composer-edit-mode.md）。
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
        this.publishSessionsIndexUpsert(session);
        this.runtime.onWorkspaceTaskListChanged.fire({
          workspacePath: session.workspaceRef.workspacePath,
          type: "workspace_task_list_changed",
        });
        return this.ackAccepted(envelope);
      }
      case "deleteSession": {
        this.runtime.sessions.delete(session.sessionId);
        this.runtime.tasks.delete(session.sessionId);
        this.publishSessionsIndexRemoved(session.workspaceKey, session.sessionId);
        this.runtime.onWorkspaceTaskListChanged.fire({
          workspacePath: session.workspaceRef.workspacePath,
          type: "workspace_task_list_changed",
        });
        return this.ackAccepted(envelope);
      }
      case "switchModelConfig": {
        if (this.business?.getNativeBinding(session.sessionId))
          throw new Error("此 Agent 会话保留创建时模型和思考强度，请修改平台配置后用于新会话。");
        const payload = envelope.payload as { provider: string; model: string; thought: string };
        session.revision += 1;
        session.config = {
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
        this.emitConversationFrame(
          session,
          {
            kind: "deltas",
            deltas: [
              {
                op: "state.updated",
                patch: {
                  revision: session.revision,
                  config: { ...session.config },
                },
              },
              {
                op: "row.appended",
                row: {
                  kind: "timelineMarker",
                  rowId: this.nextRowId(session),
                  turnId: `turn_${createUuid()}`,
                  createdAt: Date.now(),
                  createdAtSeq: session.seq,
                  lane: "lightBoundary",
                  marker: {
                    type: "modelChange",
                    fromProvider: "account:bigmodel-start-plan",
                    fromModel: "GLM-5.3-Flash",
                    toProvider: payload.provider,
                    toModel: payload.model,
                    toThought: payload.thought,
                  },
                },
              },
            ],
          },
          "online",
        );
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
          target: { rowId: number };
          feedback: "like" | "dislike" | null;
        };
        const row = session.rows.find((candidate) => candidate.rowId === payload.target.rowId);
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
    const snapshot = buildConversationSnapshot(session);
    this.emitConversationFrame(session, { kind: "snapshot", snapshot }, "initial");
    return { ack: { subscriptionId, mode: "snapshot" as const, logEpoch: session.logEpoch } };
  }

  /** 订阅时目标会话可能尚未创建（draft 预热窗口）；按 workspace 种子一个空会话。 */
  private ensureOrSeedDraftSession(
    params: { sessionId: string; workspacePath: string; workspaceIdentity?: string },
    workspaceKey: string,
  ): MockSession {
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
        throw new Error(`fault.command.sessionNotFound: ${params.sessionId}`);
      }
      return existing;
    }
    if (this.business && !this.business.getNativeBinding(params.sessionId))
      throw new Error(`fault.command.sessionNotFound: ${params.sessionId}`);
    const now = Date.now();
    const session: MockSession = {
      sessionId: params.sessionId,
      workspaceKey,
      workspaceRef: workspaceRefOf(params),
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
    const snapshot = buildConversationSnapshot(session);
    this.emitConversationFrame(session, { kind: "snapshot", snapshot }, "recovery");
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
    const session = this.ensureSession({ sessionId: params.sessionId, workspace: params });
    const rows = session?.rows ?? [];
    const beforeRowId = params.beforeRowId ?? Number.MAX_SAFE_INTEGER;
    const eligible = rows.filter((row) => row.rowId < beforeRowId);
    const start = Math.max(0, eligible.length - params.limit);
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

  async conversationInputPredictionV4(
    _params: P<IZCodeAgentService["conversationInputPredictionV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationInputPredictionV4"]>> {
    return { kind: "unsupported" } as unknown as AR<
      IZCodeAgentService["conversationInputPredictionV4"]
    >;
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
    // 缓存接纳结果同样按当前请求工作区隔离，不能绕过归属检查。
    const requestWorkspace = workspaceRefOf(params);
    if (
      parsed.envelope.workspace &&
      (workspaceKeyOf(parsed.envelope.workspace) !== workspaceKeyOf(requestWorkspace) ||
        parsed.envelope.workspace.workspacePath !== requestWorkspace.workspacePath)
    )
      throw new Error("命令工作区与当前请求不一致。");
    const key = `${this.business?.actorKey() ?? "mock"}:${parsed.envelope.sessionId ?? "draft"}:${parsed.envelope.commandId}`;
    const digest = JSON.stringify([requestWorkspace, parsed.envelope]);
    const prior = this.commandResults.get(key);
    if (prior) {
      if (prior.digest !== digest) throw new Error("原生消息编号不能用于不同输入。");
      return prior.ack;
    }
    const ack = this.handleEnvelope({
      ...parsed.envelope,
      workspace: { ...requestWorkspace, workspaceKey: workspaceKeyOf(requestWorkspace) },
    });
    if (ack.status !== "rejected") this.commandResults.set(key, { digest, ack });
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

  async subscribeSessionsIndexV4(params: P<IZCodeAgentService["subscribeSessionsIndexV4"]>) {
    const workspaceKey = workspaceKeyOf(params);
    const subscriptionId = `sub-${createUuid()}`;
    this.sessionsIndexSubs.set(subscriptionId, {
      workspaceKey,
      wireWorkspaceKey: params.workspaceIdentity?.trim() || params.workspacePath,
      ordinal: 0,
    });
    const sessions = [...this.runtime.sessions.values()]
      .filter((session) => session.workspaceKey === workspaceKey && isListedSession(session))
      .map((session) => buildSessionSummary(session));
    this.emitSessionsIndex(workspaceKey, { kind: "snapshot", snapshot: { sessions } }, "initial");
    const position = this.runtime.topics.position(`sessions-index/${workspaceKey}`);
    return { ack: { subscriptionId, mode: "snapshot" as const, logEpoch: position.logEpoch } };
  }

  async resyncSessionsIndexV4(params: P<IZCodeAgentService["resyncSessionsIndexV4"]>) {
    const sub = this.sessionsIndexSubs.get(params.subscriptionId);
    if (!sub) throw new Error("fault.subscription.unknownSubscription");
    const sessions = [...this.runtime.sessions.values()]
      .filter((session) => session.workspaceKey === sub.workspaceKey && isListedSession(session))
      .map((session) => buildSessionSummary(session));
    this.emitSessionsIndex(
      sub.workspaceKey,
      { kind: "snapshot", snapshot: { sessions } },
      "recovery",
    );
    const position = this.runtime.topics.position(`sessions-index/${sub.workspaceKey}`);
    return {
      ack: {
        subscriptionId: params.subscriptionId,
        mode: "snapshot" as const,
        logEpoch: position.logEpoch,
      },
    };
  }

  async unsubscribeSessionsIndexV4(
    params: P<IZCodeAgentService["unsubscribeSessionsIndexV4"]>,
  ): Promise<void> {
    this.sessionsIndexSubs.delete(params.subscriptionId);
  }

  async reconcileSessionsIndexV4(
    params: NonNullable<P<IZCodeAgentService["reconcileSessionsIndexV4"]>>,
  ) {
    return {
      sessions: params.sessionIds.map((sessionId) => {
        const session = this.runtime.sessions.get(sessionId);
        if (!session) {
          return { sessionId, exists: false as const, deleted: false as const };
        }
        return {
          sessionId,
          exists: true as const,
          deleted: false,
          title: session.meta.title,
          titleSource: session.meta.titleSource,
          createdAt: session.createdAt,
          updatedAt: session.lastActivityAt,
          ...(session.phase === "completedSuccess"
            ? { lastOutcome: "completed" as const }
            : session.phase === "completedInterrupted"
              ? { lastOutcome: "interrupted" as const }
              : {}),
        };
      }),
    };
  }

  async subscribeWorkspaceConfigV4(params: P<IZCodeAgentService["subscribeWorkspaceConfigV4"]>) {
    const workspaceKey = workspaceKeyOf(params);
    const subscriptionId = `sub-${createUuid()}`;
    this.workspaceConfigSubs.set(subscriptionId, {
      workspaceKey,
      wireWorkspaceKey: params.workspaceIdentity?.trim() || params.workspacePath,
      ordinal: 0,
    });
    this.emitWorkspaceConfigSnapshot(workspaceKey, "initial");
    const position = this.runtime.topics.position(`workspace-config/${workspaceKey}`);
    return { ack: { subscriptionId, mode: "snapshot" as const, logEpoch: position.logEpoch } };
  }

  async resyncWorkspaceConfigV4(params: P<IZCodeAgentService["resyncWorkspaceConfigV4"]>) {
    const sub = this.workspaceConfigSubs.get(params.subscriptionId);
    if (!sub) throw new Error("fault.subscription.unknownSubscription");
    this.emitWorkspaceConfigSnapshot(sub.workspaceKey, "recovery");
    const position = this.runtime.topics.position(`workspace-config/${sub.workspaceKey}`);
    return {
      ack: {
        subscriptionId: params.subscriptionId,
        mode: "snapshot" as const,
        logEpoch: position.logEpoch,
      },
    };
  }

  async unsubscribeWorkspaceConfigV4(
    params: P<IZCodeAgentService["unsubscribeWorkspaceConfigV4"]>,
  ): Promise<void> {
    this.workspaceConfigSubs.delete(params.subscriptionId);
  }

  onDynamicConversationFrame(
    _params: P<IZCodeAgentService["onDynamicConversationFrame"]>,
  ): ReturnType<IZCodeAgentService["onDynamicConversationFrame"]> {
    return this.conversationFrameEmitter.event as unknown as ReturnType<
      IZCodeAgentService["onDynamicConversationFrame"]
    >;
  }

  onDynamicSessionsIndexFrame(
    _params: P<IZCodeAgentService["onDynamicSessionsIndexFrame"]>,
  ): ReturnType<IZCodeAgentService["onDynamicSessionsIndexFrame"]> {
    return this.sessionsIndexFrameEmitter.event as unknown as ReturnType<
      IZCodeAgentService["onDynamicSessionsIndexFrame"]
    >;
  }

  onDynamicWorkspaceConfigFrame(
    _params: P<IZCodeAgentService["onDynamicWorkspaceConfigFrame"]>,
  ): ReturnType<IZCodeAgentService["onDynamicWorkspaceConfigFrame"]> {
    return this.workspaceConfigFrameEmitter.event as unknown as ReturnType<
      IZCodeAgentService["onDynamicWorkspaceConfigFrame"]
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
    const session = this.runtime.sessions.get(params.sessionId);
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      // mock 运行时无常驻进程概念：会话存在即视为 ready，否则 UI 的 runtimeBlocked 会禁用发送。
      state: "ready",
      generation: this.sessionGeneration,
      revision: session.revision,
      lastError: null,
    };
  }

  async ensureSessionReady(_params: P<IZCodeAgentService["ensureSessionReady"]>): Promise<void> {}

  async stopSessionRuntime(_params: P<IZCodeAgentService["stopSessionRuntime"]>): Promise<void> {}

  async restartSessionRuntime(
    _params: P<IZCodeAgentService["restartSessionRuntime"]>,
  ): Promise<void> {}

  onAgentRuntimeRestarted(listener: (event: { workspaceKey: string }) => void): IDisposable {
    return this.runtimeRestartedEmitter.event(listener);
  }

  /** 可选 runtime 事件：mock 无进程换代，恒为空事件。 */
  readonly onAgentRuntimeLifecycle: NonNullable<IZCodeAgentService["onAgentRuntimeLifecycle"]> =
    Event.None as unknown as NonNullable<IZCodeAgentService["onAgentRuntimeLifecycle"]>;
  readonly onAgentRuntimeExited: NonNullable<IZCodeAgentService["onAgentRuntimeExited"]> =
    Event.None as unknown as NonNullable<IZCodeAgentService["onAgentRuntimeExited"]>;

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
  async attachmentPreviewSourceV4(params: P<IZCodeAgentService["attachmentPreviewSourceV4"]>) {
    this.attachmentFor(params);
    return { kind: "chunked" as const };
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
  async conversationAttachmentReadV4(
    params: P<IZCodeAgentService["conversationAttachmentReadV4"]>,
  ) {
    return this.attachmentReadV4(params);
  }
  async conversationAttachmentStatV4(
    params: P<IZCodeAgentService["conversationAttachmentStatV4"]>,
  ) {
    const value = this.attachmentFor(params);
    return { mediaType: value.mime, totalBytes: value.bytes.length };
  }

  // ── 旧会话面（mock 返回内存态或最小合法结果） ──

  async prepareStorage(_params: P<IZCodeAgentService["prepareStorage"]>): Promise<void> {
    this.storageGeneration += 1;
  }

  async getStorageStartupState(): Promise<AR<IZCodeAgentService["getStorageStartupState"]>> {
    return { generation: this.storageGeneration, state: null };
  }

  onDynamicStorageStartupState(): ReturnType<IZCodeAgentService["onDynamicStorageStartupState"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicStorageStartupState"]>;
  }

  async initialize(
    params: P<IZCodeAgentService["initialize"]>,
  ): Promise<AR<IZCodeAgentService["initialize"]>> {
    return {
      available: true,
      workspaceKey: workspaceKeyOf(params),
      protocolName: "ZCode Protocol",
      protocolVersion: 1,
      transportKind: "stdio",
    };
  }

  async syncAppRuntimePreferences(
    _preferences: P<IZCodeAgentService["syncAppRuntimePreferences"]>,
  ): Promise<void> {}

  async getWorkspaceRuntimeIdentity(
    params: P<IZCodeAgentService["getWorkspaceRuntimeIdentity"]>,
  ): Promise<AR<IZCodeAgentService["getWorkspaceRuntimeIdentity"]>> {
    return {
      generation: this.sessionGeneration,
      identity: `mock-${workspaceKeyOf(params)}`,
      workspaceKey: workspaceKeyOf(params),
    };
  }

  async createSession(
    _params: P<IZCodeAgentService["createSession"]>,
  ): Promise<AR<IZCodeAgentService["createSession"]>> {
    throw new Error("mock: legacy createSession 由 v4 createSession 命令承担");
  }

  async resumeSession(
    _params: P<IZCodeAgentService["resumeSession"]>,
  ): Promise<AR<IZCodeAgentService["resumeSession"]>> {
    throw new Error("mock: legacy resumeSession 由 v4 订阅承担");
  }

  async listSessions(_params: P<IZCodeAgentService["listSessions"]>): Promise<ZCodeSessionInfo[]> {
    return [];
  }

  async listSessionSubagents(
    _params: P<IZCodeAgentService["listSessionSubagents"]>,
  ): Promise<AR<IZCodeAgentService["listSessionSubagents"]>> {
    return { subagents: [], endedTotal: 0, revision: 0 } as unknown as AR<
      IZCodeAgentService["listSessionSubagents"]
    >;
  }

  async getAppUsageStats(
    _params: P<IZCodeAgentService["getAppUsageStats"]>,
  ): Promise<AR<IZCodeAgentService["getAppUsageStats"]>> {
    return { generatedAt: Date.now(), ranges: [] } as unknown as AR<
      IZCodeAgentService["getAppUsageStats"]
    >;
  }

  async getTaskTokenUsage(
    _params: P<IZCodeAgentService["getTaskTokenUsage"]>,
  ): Promise<AR<IZCodeAgentService["getTaskTokenUsage"]>> {
    return {
      taskId: _params.sessionId,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelRequestCount: 0,
      modelErrorCount: 0,
    } as unknown as AR<IZCodeAgentService["getTaskTokenUsage"]>;
  }

  async readSession(
    _params: P<IZCodeAgentService["readSession"]>,
  ): Promise<AR<IZCodeAgentService["readSession"]>> {
    throw new Error("mock: legacy readSession 由 v4 投影承担");
  }

  async readSessionMessages(
    _params: P<IZCodeAgentService["readSessionMessages"]>,
  ): Promise<AR<IZCodeAgentService["readSessionMessages"]>> {
    return { messages: [], nextBeforeMessageId: null } as unknown as AR<
      IZCodeAgentService["readSessionMessages"]
    >;
  }

  async readSessionDebug(
    _params: P<IZCodeAgentService["readSessionDebug"]>,
  ): Promise<AR<IZCodeAgentService["readSessionDebug"]>> {
    return { events: [], notes: [] } as unknown as AR<IZCodeAgentService["readSessionDebug"]>;
  }

  async readSessionEvents(
    _params: P<IZCodeAgentService["readSessionEvents"]>,
  ): Promise<AR<IZCodeAgentService["readSessionEvents"]>> {
    return [] as unknown as AR<IZCodeAgentService["readSessionEvents"]>;
  }

  async readWorkspacePresentation(
    _params: P<IZCodeAgentService["readWorkspacePresentation"]>,
  ): Promise<AR<IZCodeAgentService["readWorkspacePresentation"]>> {
    return {
      workspace: {
        workspacePath: _params.workspacePath,
        workspaceKey: workspaceKeyOf(_params),
      },
      mode: "build",
      slashCommands: [],
    } as unknown as AR<IZCodeAgentService["readWorkspacePresentation"]>;
  }

  async grantWorkspaceHookTrust(
    _params: P<IZCodeAgentService["grantWorkspaceHookTrust"]>,
  ): Promise<AR<IZCodeAgentService["grantWorkspaceHookTrust"]>> {
    return { skills: [] } as unknown as AR<IZCodeAgentService["grantWorkspaceHookTrust"]>;
  }

  async setWorkspaceMcpTrust(
    _params: P<IZCodeAgentService["setWorkspaceMcpTrust"]>,
  ): Promise<AR<IZCodeAgentService["setWorkspaceMcpTrust"]>> {
    return { applied: false } as unknown as AR<IZCodeAgentService["setWorkspaceMcpTrust"]>;
  }

  async listMcpServerStatuses(
    _params: P<IZCodeAgentService["listMcpServerStatuses"]>,
  ): Promise<AR<IZCodeAgentService["listMcpServerStatuses"]>> {
    return { servers: [], mode: "all" } as unknown as AR<
      IZCodeAgentService["listMcpServerStatuses"]
    >;
  }

  async listPlugins(
    _params: P<IZCodeAgentService["listPlugins"]>,
  ): Promise<AR<IZCodeAgentService["listPlugins"]>> {
    return { plugins: [], marketplaces: [] } as unknown as AR<IZCodeAgentService["listPlugins"]>;
  }

  async getPluginsOverview(
    _params: P<IZCodeAgentService["getPluginsOverview"]>,
  ): Promise<AR<IZCodeAgentService["getPluginsOverview"]>> {
    return {
      marketplaces: [],
      availablePlugins: [],
      installedPlugins: [],
      restorableBuiltins: [],
      diagnostics: [],
      capability: { supported: false, reason: "mock" },
    } as unknown as AR<IZCodeAgentService["getPluginsOverview"]>;
  }

  async getPluginReferenceCatalog(
    _params: P<IZCodeAgentService["getPluginReferenceCatalog"]>,
  ): Promise<AR<IZCodeAgentService["getPluginReferenceCatalog"]>> {
    return { authority: "workspace" as const, plugins: [] } as unknown as AR<
      IZCodeAgentService["getPluginReferenceCatalog"]
    >;
  }

  async getSkillReferenceCatalog(
    _params: P<IZCodeAgentService["getSkillReferenceCatalog"]>,
  ): Promise<AR<IZCodeAgentService["getSkillReferenceCatalog"]>> {
    return { authority: "workspace" as const, skills: [] } as unknown as unknown as AR<
      IZCodeAgentService["getSkillReferenceCatalog"]
    >;
  }

  async resolveSuggestedPluginReference(
    _params: P<IZCodeAgentService["resolveSuggestedPluginReference"]>,
  ): Promise<AR<IZCodeAgentService["resolveSuggestedPluginReference"]>> {
    throw new Error("mock: 建议插件解析未启用");
  }

  async listSavedWorkflows(
    _params: P<IZCodeAgentService["listSavedWorkflows"]>,
  ): Promise<AR<IZCodeAgentService["listSavedWorkflows"]>> {
    return { workflows: [] } as unknown as AR<IZCodeAgentService["listSavedWorkflows"]>;
  }

  async getSavedWorkflow(
    _params: P<IZCodeAgentService["getSavedWorkflow"]>,
  ): Promise<AR<IZCodeAgentService["getSavedWorkflow"]>> {
    throw new Error("fault.workflow.notFound");
  }

  async updateSavedWorkflowMeta(
    _params: P<IZCodeAgentService["updateSavedWorkflowMeta"]>,
  ): Promise<AR<IZCodeAgentService["updateSavedWorkflowMeta"]>> {
    throw new Error("fault.workflow.notFound");
  }

  async deleteSavedWorkflow(
    _params: P<IZCodeAgentService["deleteSavedWorkflow"]>,
  ): Promise<AR<IZCodeAgentService["deleteSavedWorkflow"]>> {
    throw new Error("fault.workflow.notFound");
  }

  async listSavedWorkflowRuns(
    _params: P<IZCodeAgentService["listSavedWorkflowRuns"]>,
  ): Promise<AR<IZCodeAgentService["listSavedWorkflowRuns"]>> {
    return { runs: [], hasMore: false } as unknown as AR<
      IZCodeAgentService["listSavedWorkflowRuns"]
    >;
  }

  async moveSavedWorkflow(
    _params: P<IZCodeAgentService["moveSavedWorkflow"]>,
  ): Promise<AR<IZCodeAgentService["moveSavedWorkflow"]>> {
    throw new Error("fault.workflow.notFound");
  }

  async saveSavedWorkflowFromRun(
    _params: P<IZCodeAgentService["saveSavedWorkflowFromRun"]>,
  ): Promise<AR<IZCodeAgentService["saveSavedWorkflowFromRun"]>> {
    throw new Error("fault.workflow.notFound");
  }

  async findSavedWorkflowForRun(
    _params: P<IZCodeAgentService["findSavedWorkflowForRun"]>,
  ): Promise<AR<IZCodeAgentService["findSavedWorkflowForRun"]>> {
    return null as unknown as AR<IZCodeAgentService["findSavedWorkflowForRun"]>;
  }

  async listAutomations(
    _params: P<IZCodeAgentService["listAutomations"]>,
  ): Promise<AR<IZCodeAgentService["listAutomations"]>> {
    return [];
  }

  async listAllAutomations(): Promise<AR<IZCodeAgentService["listAllAutomations"]>> {
    return [];
  }

  async collectLocalRuntimeChildProcesses(
    _params: P<IZCodeAgentService["collectLocalRuntimeChildProcesses"]>,
  ): Promise<AR<IZCodeAgentService["collectLocalRuntimeChildProcesses"]>> {
    return { children: [] } as unknown as AR<
      IZCodeAgentService["collectLocalRuntimeChildProcesses"]
    >;
  }

  async generateWorkspaceText(
    _params: P<IZCodeAgentService["generateWorkspaceText"]>,
  ): Promise<AR<IZCodeAgentService["generateWorkspaceText"]>> {
    throw new Error("mock: generateWorkspaceText 未实现");
  }

  async testModelConnectivity(
    _params: P<IZCodeAgentService["testModelConnectivity"]>,
  ): Promise<AR<IZCodeAgentService["testModelConnectivity"]>> {
    return { ok: true, latencyMs: 12 } as unknown as AR<
      IZCodeAgentService["testModelConnectivity"]
    >;
  }

  async sendPrompt(
    _params: P<IZCodeAgentService["sendPrompt"]>,
  ): Promise<AR<IZCodeAgentService["sendPrompt"]>> {
    throw new Error("mock: legacy sendPrompt 已退役，请使用 v4 sendConversationCommandV4");
  }

  async compactSession(
    _params: P<IZCodeAgentService["compactSession"]>,
  ): Promise<AR<IZCodeAgentService["compactSession"]>> {
    return { status: "noop" } as unknown as AR<IZCodeAgentService["compactSession"]>;
  }

  async goalSession(
    _params: P<IZCodeAgentService["goalSession"]>,
  ): Promise<AR<IZCodeAgentService["goalSession"]>> {
    return { status: "noop" } as unknown as AR<IZCodeAgentService["goalSession"]>;
  }

  async closeSession(
    params: P<IZCodeAgentService["closeSession"]>,
  ): Promise<AR<IZCodeAgentService["closeSession"]>> {
    const session = this.runtime.sessions.get(params.sessionId);
    if (session?.activeTurn) session.activeTurn.abort();
    return false as unknown as AR<IZCodeAgentService["closeSession"]>;
  }

  async setModel(
    _params: P<IZCodeAgentService["setModel"]>,
  ): Promise<AR<IZCodeAgentService["setModel"]>> {
    throw new Error("mock: legacy setModel 由 v4 switchModelConfig 承担");
  }

  async setThoughtLevel(
    _params: P<IZCodeAgentService["setThoughtLevel"]>,
  ): Promise<AR<IZCodeAgentService["setThoughtLevel"]>> {
    throw new Error("mock: legacy setThoughtLevel 由 v4 switchModelConfig 承担");
  }

  async setMode(
    _params: P<IZCodeAgentService["setMode"]>,
  ): Promise<AR<IZCodeAgentService["setMode"]>> {
    throw new Error("mock: legacy setMode 由 v4 switchCollaborationMode 承担");
  }

  async respondProviderRuntimeHeaders(
    _params: P<IZCodeAgentService["respondProviderRuntimeHeaders"]>,
  ): Promise<void> {}

  async respondSessionRuntimePreferences(
    _params: P<IZCodeAgentService["respondSessionRuntimePreferences"]>,
  ): Promise<void> {}

  onDynamicProviderRuntimeHeadersRequest(): ReturnType<
    IZCodeAgentService["onDynamicProviderRuntimeHeadersRequest"]
  > {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicProviderRuntimeHeadersRequest"]
    >;
  }

  onDynamicWorkspaceProviderRuntimeHeadersRequest(
    _params: P<IZCodeAgentService["onDynamicWorkspaceProviderRuntimeHeadersRequest"]>,
  ): ReturnType<IZCodeAgentService["onDynamicWorkspaceProviderRuntimeHeadersRequest"]> {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicWorkspaceProviderRuntimeHeadersRequest"]
    >;
  }

  onDynamicWorkspaceProviderRuntimeHeadersCancelled(
    _params: P<IZCodeAgentService["onDynamicWorkspaceProviderRuntimeHeadersCancelled"]>,
  ): ReturnType<IZCodeAgentService["onDynamicWorkspaceProviderRuntimeHeadersCancelled"]> {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicWorkspaceProviderRuntimeHeadersCancelled"]
    >;
  }

  onDynamicSessionRuntimePreferencesRequest(): ReturnType<
    IZCodeAgentService["onDynamicSessionRuntimePreferencesRequest"]
  > {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicSessionRuntimePreferencesRequest"]
    >;
  }

  onDynamicProcessResourceSample(): ReturnType<
    IZCodeAgentService["onDynamicProcessResourceSample"]
  > {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicProcessResourceSample"]
    >;
  }

  onDynamicPluginStartupDegraded(
    _params: P<IZCodeAgentService["onDynamicPluginStartupDegraded"]>,
  ): ReturnType<IZCodeAgentService["onDynamicPluginStartupDegraded"]> {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicPluginStartupDegraded"]
    >;
  }

  onDynamicRemoteConversationTelemetry(): ReturnType<
    IZCodeAgentService["onDynamicRemoteConversationTelemetry"]
  > {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicRemoteConversationTelemetry"]
    >;
  }

  onDynamicMcpTelemetry(): ReturnType<IZCodeAgentService["onDynamicMcpTelemetry"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicMcpTelemetry"]>;
  }

  onDynamicMcpResourceSamples(): ReturnType<IZCodeAgentService["onDynamicMcpResourceSamples"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicMcpResourceSamples"]>;
  }

  onDynamicToolExecResource(): ReturnType<IZCodeAgentService["onDynamicToolExecResource"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicToolExecResource"]>;
  }

  onDynamicSessionEvent(
    _params: P<IZCodeAgentService["onDynamicSessionEvent"]>,
  ): ReturnType<IZCodeAgentService["onDynamicSessionEvent"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicSessionEvent"]>;
  }

  onDynamicLocalTtftFacts(
    _params: P<IZCodeAgentService["onDynamicLocalTtftFacts"]>,
  ): ReturnType<IZCodeAgentService["onDynamicLocalTtftFacts"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicLocalTtftFacts"]>;
  }

  onDynamicConversationTelemetryFact(
    _params: P<IZCodeAgentService["onDynamicConversationTelemetryFact"]>,
  ): ReturnType<IZCodeAgentService["onDynamicConversationTelemetryFact"]> {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicConversationTelemetryFact"]
    >;
  }

  onDynamicModelRequestMetrics(
    _params: NonNullable<P<IZCodeAgentService["onDynamicModelRequestMetrics"]>>,
  ): ReturnType<NonNullable<IZCodeAgentService["onDynamicModelRequestMetrics"]>> {
    return Event.None as unknown as ReturnType<
      NonNullable<IZCodeAgentService["onDynamicModelRequestMetrics"]>
    >;
  }

  onDynamicOffPeakLifecycle(
    _params: P<IZCodeAgentService["onDynamicOffPeakLifecycle"]>,
  ): ReturnType<IZCodeAgentService["onDynamicOffPeakLifecycle"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicOffPeakLifecycle"]>;
  }

  async controlOffPeakExecutionV4(
    _params: P<IZCodeAgentService["controlOffPeakExecutionV4"]>,
  ): Promise<AR<IZCodeAgentService["controlOffPeakExecutionV4"]>> {
    return { kind: "unsupported" } as unknown as AR<
      IZCodeAgentService["controlOffPeakExecutionV4"]
    >;
  }

  onDynamicCuaPermissionObservation(): ReturnType<
    IZCodeAgentService["onDynamicCuaPermissionObservation"]
  > {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicCuaPermissionObservation"]
    >;
  }

  onDynamicPluginUiToolResult(): ReturnType<IZCodeAgentService["onDynamicPluginUiToolResult"]> {
    return Event.None as unknown as ReturnType<IZCodeAgentService["onDynamicPluginUiToolResult"]>;
  }

  async conversationFileChangesV4(
    _params: P<IZCodeAgentService["conversationFileChangesV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationFileChangesV4"]>> {
    return { files: 0, additions: 0, deletions: 0, items: [] } as unknown as AR<
      IZCodeAgentService["conversationFileChangesV4"]
    >;
  }

  async conversationFileRewindPreviewV4(
    _params: P<IZCodeAgentService["conversationFileRewindPreviewV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationFileRewindPreviewV4"]>> {
    return { canApply: false, ignoredFiles: [], safeFiles: [], unsafeFiles: [] } as unknown as AR<
      IZCodeAgentService["conversationFileRewindPreviewV4"]
    >;
  }

  async backgroundBashOutputV4(
    _params: P<IZCodeAgentService["backgroundBashOutputV4"]>,
  ): Promise<AR<IZCodeAgentService["backgroundBashOutputV4"]>> {
    return { kind: "unsupported" } as unknown as AR<IZCodeAgentService["backgroundBashOutputV4"]>;
  }

  async conversationWorkflowRunEventsV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunEventsV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunEventsV4"]>> {
    return { events: [], hasMore: false } as unknown as AR<
      IZCodeAgentService["conversationWorkflowRunEventsV4"]
    >;
  }

  async conversationWorkflowRunsV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunsV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunsV4"]>> {
    return { runs: [] } as unknown as AR<IZCodeAgentService["conversationWorkflowRunsV4"]>;
  }

  async conversationWorkflowRunArtifactsV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunArtifactsV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunArtifactsV4"]>> {
    return { artifacts: [], hasMore: false } as unknown as AR<
      IZCodeAgentService["conversationWorkflowRunArtifactsV4"]
    >;
  }

  async conversationWorkflowRunArtifactDataV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunArtifactDataV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunArtifactDataV4"]>> {
    return { items: [], hasMore: false } as unknown as AR<
      IZCodeAgentService["conversationWorkflowRunArtifactDataV4"]
    >;
  }

  async conversationWorkflowRunArtifactReadV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunArtifactReadV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunArtifactReadV4"]>> {
    return {
      dataBase64: "",
      mediaType: "text/plain",
      totalBytes: 0,
      nextOffset: null,
    } as unknown as AR<IZCodeAgentService["conversationWorkflowRunArtifactReadV4"]>;
  }

  async conversationWorkflowRunWorkspaceV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunWorkspaceV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunWorkspaceV4"]>> {
    return { rows: [], hasMore: false } as unknown as AR<
      IZCodeAgentService["conversationWorkflowRunWorkspaceV4"]
    >;
  }

  async conversationWorkflowRunNodeResultV4(
    _params: P<IZCodeAgentService["conversationWorkflowRunNodeResultV4"]>,
  ): Promise<AR<IZCodeAgentService["conversationWorkflowRunNodeResultV4"]>> {
    return { content: "", truncated: false } as unknown as AR<
      IZCodeAgentService["conversationWorkflowRunNodeResultV4"]
    >;
  }

  async previewSessionDeletion(
    _params: P<NonNullable<IZCodeAgentService["previewSessionDeletion"]>>,
  ): Promise<AR<NonNullable<IZCodeAgentService["previewSessionDeletion"]>>> {
    return { sessions: [], totalBytes: 0 } as unknown as AR<
      NonNullable<IZCodeAgentService["previewSessionDeletion"]>
    >;
  }

  async executeSessionDeletion(
    _params: P<NonNullable<IZCodeAgentService["executeSessionDeletion"]>>,
  ): Promise<AR<NonNullable<IZCodeAgentService["executeSessionDeletion"]>>> {
    return { deletedSessionIds: [], failedSessionIds: [] } as unknown as AR<
      NonNullable<IZCodeAgentService["executeSessionDeletion"]>
    >;
  }

  async measureSessionData(
    _params: P<NonNullable<IZCodeAgentService["measureSessionData"]>>,
  ): Promise<AR<NonNullable<IZCodeAgentService["measureSessionData"]>>> {
    return { totalBytes: 0, sessions: [] } as unknown as AR<
      NonNullable<IZCodeAgentService["measureSessionData"]>
    >;
  }

  async purgeSessionData(
    _params: P<NonNullable<IZCodeAgentService["purgeSessionData"]>>,
  ): Promise<AR<NonNullable<IZCodeAgentService["purgeSessionData"]>>> {
    return { purgedBytes: 0 } as unknown as AR<NonNullable<IZCodeAgentService["purgeSessionData"]>>;
  }

  supportsWorktreeCwd(
    _target: NonNullable<P<IZCodeAgentService["supportsWorktreeCwd"]>>,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  supportsExtensionInputSource(
    _target: NonNullable<P<IZCodeAgentService["supportsExtensionInputSource"]>>,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  supportsConversationQuoteComment(
    _target: NonNullable<P<IZCodeAgentService["supportsConversationQuoteComment"]>>,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  hasActiveCuaOperationTurn(): boolean {
    return false;
  }

  async disposeWorkspace(_params: P<IZCodeAgentService["disposeWorkspace"]>): Promise<void> {
    for (const [sessionId, session] of this.runtime.sessions) {
      if (session.workspaceKey === workspaceKeyOf(_params)) {
        session.activeTurn?.abort();
        this.runtime.sessions.delete(sessionId);
      }
    }
  }

  async openMcpUiInstance(
    _params: P<IZCodeAgentService["openMcpUiInstance"]>,
  ): Promise<AR<IZCodeAgentService["openMcpUiInstance"]>> {
    throw new Error("mock: openMcpUiInstance 未启用");
  }

  async readMcpResource(
    _params: P<IZCodeAgentService["readMcpResource"]>,
  ): Promise<AR<IZCodeAgentService["readMcpResource"]>> {
    throw new Error("mock: readMcpResource 未启用");
  }

  async sampleMcpApp(
    _params: P<IZCodeAgentService["sampleMcpApp"]>,
  ): Promise<AR<IZCodeAgentService["sampleMcpApp"]>> {
    throw new Error("mock: sampleMcpApp 未启用");
  }

  async callMcpToolForUi(
    _params: P<IZCodeAgentService["callMcpToolForUi"]>,
  ): Promise<AR<IZCodeAgentService["callMcpToolForUi"]>> {
    throw new Error("mock: callMcpToolForUi 未启用");
  }

  async readMcpResourceForUi(
    _params: P<IZCodeAgentService["readMcpResourceForUi"]>,
  ): Promise<AR<IZCodeAgentService["readMcpResourceForUi"]>> {
    throw new Error("mock: readMcpResourceForUi 未启用");
  }

  async claimAppToolCallForUi(
    _params: P<IZCodeAgentService["claimAppToolCallForUi"]>,
  ): Promise<AR<IZCodeAgentService["claimAppToolCallForUi"]>> {
    throw new Error("mock: claimAppToolCallForUi 未启用");
  }

  async addPluginMarketplace(
    _params: P<IZCodeAgentService["addPluginMarketplace"]>,
  ): Promise<AR<IZCodeAgentService["addPluginMarketplace"]>> {
    throw new Error("mock: addPluginMarketplace 未启用");
  }

  async installPlugin(
    _params: P<IZCodeAgentService["installPlugin"]>,
  ): Promise<AR<IZCodeAgentService["installPlugin"]>> {
    throw new Error("mock: installPlugin 未启用");
  }

  async updatePlugin(
    _params: P<IZCodeAgentService["updatePlugin"]>,
  ): Promise<AR<IZCodeAgentService["updatePlugin"]>> {
    throw new Error("mock: updatePlugin 未启用");
  }

  async restoreBuiltinPlugin(
    _params: P<IZCodeAgentService["restoreBuiltinPlugin"]>,
  ): Promise<AR<IZCodeAgentService["restoreBuiltinPlugin"]>> {
    throw new Error("mock: restoreBuiltinPlugin 未启用");
  }

  async configurePlugin(
    _params: P<IZCodeAgentService["configurePlugin"]>,
  ): Promise<AR<IZCodeAgentService["configurePlugin"]>> {
    throw new Error("mock: configurePlugin 未启用");
  }

  async resetPluginConfig(
    _params: P<IZCodeAgentService["resetPluginConfig"]>,
  ): Promise<AR<IZCodeAgentService["resetPluginConfig"]>> {
    throw new Error("mock: resetPluginConfig 未启用");
  }

  async createAutomation(
    _params: P<IZCodeAgentService["createAutomation"]>,
  ): Promise<AR<IZCodeAgentService["createAutomation"]>> {
    throw new Error("mock: createAutomation 未启用");
  }

  async updateAutomation(
    _params: P<IZCodeAgentService["updateAutomation"]>,
  ): Promise<AR<IZCodeAgentService["updateAutomation"]>> {
    throw new Error("mock: updateAutomation 未启用");
  }

  async runAutomationNow(
    _params: P<IZCodeAgentService["runAutomationNow"]>,
  ): Promise<AR<IZCodeAgentService["runAutomationNow"]>> {
    throw new Error("mock: runAutomationNow 未启用");
  }

  async validateMcpUiInstance(
    _params: P<IZCodeAgentService["validateMcpUiInstance"]>,
  ): Promise<AR<IZCodeAgentService["validateMcpUiInstance"]>> {
    return null as unknown as AR<IZCodeAgentService["validateMcpUiInstance"]>;
  }

  async recycleMcpUiInstance(
    _params: P<IZCodeAgentService["recycleMcpUiInstance"]>,
  ): Promise<AR<IZCodeAgentService["recycleMcpUiInstance"]>> {
    return null as unknown as AR<IZCodeAgentService["recycleMcpUiInstance"]>;
  }

  async closeMcpUiInstance(
    _params: P<IZCodeAgentService["closeMcpUiInstance"]>,
  ): Promise<AR<IZCodeAgentService["closeMcpUiInstance"]>> {
    return null as unknown as AR<IZCodeAgentService["closeMcpUiInstance"]>;
  }

  async cancelMcpAppSampling(
    _params: P<IZCodeAgentService["cancelMcpAppSampling"]>,
  ): Promise<AR<IZCodeAgentService["cancelMcpAppSampling"]>> {
    return null as unknown as AR<IZCodeAgentService["cancelMcpAppSampling"]>;
  }

  async cancelMcpToolCallForUi(
    _params: P<IZCodeAgentService["cancelMcpToolCallForUi"]>,
  ): Promise<AR<IZCodeAgentService["cancelMcpToolCallForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["cancelMcpToolCallForUi"]>;
  }

  async listMcpResourcesForUi(
    _params: P<IZCodeAgentService["listMcpResourcesForUi"]>,
  ): Promise<AR<IZCodeAgentService["listMcpResourcesForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["listMcpResourcesForUi"]>;
  }

  async listMcpResourceTemplatesForUi(
    _params: P<IZCodeAgentService["listMcpResourceTemplatesForUi"]>,
  ): Promise<AR<IZCodeAgentService["listMcpResourceTemplatesForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["listMcpResourceTemplatesForUi"]>;
  }

  async subscribeMcpResourceForUi(
    _params: P<IZCodeAgentService["subscribeMcpResourceForUi"]>,
  ): Promise<AR<IZCodeAgentService["subscribeMcpResourceForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["subscribeMcpResourceForUi"]>;
  }

  async unsubscribeMcpResourceForUi(
    _params: P<IZCodeAgentService["unsubscribeMcpResourceForUi"]>,
  ): Promise<AR<IZCodeAgentService["unsubscribeMcpResourceForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["unsubscribeMcpResourceForUi"]>;
  }

  async registerAppToolsForUi(
    _params: P<IZCodeAgentService["registerAppToolsForUi"]>,
  ): Promise<AR<IZCodeAgentService["registerAppToolsForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["registerAppToolsForUi"]>;
  }

  async unregisterAppToolsForUi(
    _params: P<IZCodeAgentService["unregisterAppToolsForUi"]>,
  ): Promise<AR<IZCodeAgentService["unregisterAppToolsForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["unregisterAppToolsForUi"]>;
  }

  async resolveAppToolCallForUi(
    _params: P<IZCodeAgentService["resolveAppToolCallForUi"]>,
  ): Promise<AR<IZCodeAgentService["resolveAppToolCallForUi"]>> {
    return null as unknown as AR<IZCodeAgentService["resolveAppToolCallForUi"]>;
  }

  async removePluginMarketplace(
    _params: P<IZCodeAgentService["removePluginMarketplace"]>,
  ): Promise<AR<IZCodeAgentService["removePluginMarketplace"]>> {
    return null as unknown as AR<IZCodeAgentService["removePluginMarketplace"]>;
  }

  async updatePluginMarketplace(
    _params: P<IZCodeAgentService["updatePluginMarketplace"]>,
  ): Promise<AR<IZCodeAgentService["updatePluginMarketplace"]>> {
    return null as unknown as AR<IZCodeAgentService["updatePluginMarketplace"]>;
  }

  async cancelPluginOperation(
    _params: P<IZCodeAgentService["cancelPluginOperation"]>,
  ): Promise<AR<IZCodeAgentService["cancelPluginOperation"]>> {
    return null as unknown as AR<IZCodeAgentService["cancelPluginOperation"]>;
  }

  async uninstallPlugin(
    _params: P<IZCodeAgentService["uninstallPlugin"]>,
  ): Promise<AR<IZCodeAgentService["uninstallPlugin"]>> {
    return null as unknown as AR<IZCodeAgentService["uninstallPlugin"]>;
  }

  async deleteAutomation(
    _params: P<IZCodeAgentService["deleteAutomation"]>,
  ): Promise<AR<IZCodeAgentService["deleteAutomation"]>> {
    return null as unknown as AR<IZCodeAgentService["deleteAutomation"]>;
  }

  async setAutomationEnabled(
    _params: P<IZCodeAgentService["setAutomationEnabled"]>,
  ): Promise<AR<IZCodeAgentService["setAutomationEnabled"]>> {
    return null as unknown as AR<IZCodeAgentService["setAutomationEnabled"]>;
  }

  async restartAutomation(
    _params: P<IZCodeAgentService["restartAutomation"]>,
  ): Promise<AR<IZCodeAgentService["restartAutomation"]>> {
    return null as unknown as AR<IZCodeAgentService["restartAutomation"]>;
  }

  async listAutomationRuns(
    _params: P<IZCodeAgentService["listAutomationRuns"]>,
  ): Promise<AR<IZCodeAgentService["listAutomationRuns"]>> {
    return null as unknown as AR<IZCodeAgentService["listAutomationRuns"]>;
  }

  async deleteAutomationRun(
    _params: P<IZCodeAgentService["deleteAutomationRun"]>,
  ): Promise<AR<IZCodeAgentService["deleteAutomationRun"]>> {
    return null as unknown as AR<IZCodeAgentService["deleteAutomationRun"]>;
  }

  async listPluginUiSurfaces(
    _params: P<IZCodeAgentService["listPluginUiSurfaces"]>,
  ): Promise<AR<IZCodeAgentService["listPluginUiSurfaces"]>> {
    return [] as unknown as AR<IZCodeAgentService["listPluginUiSurfaces"]>;
  }

  async validatePlugin(
    _params: P<IZCodeAgentService["validatePlugin"]>,
  ): Promise<AR<IZCodeAgentService["validatePlugin"]>> {
    return {
      ok: true,
      issues: [],
      diagnostics: [],
      compatibility: { runnable: [], diagnosticOnly: [], unsupported: [] },
    } as unknown as AR<IZCodeAgentService["validatePlugin"]>;
  }

  async describePlugin(
    _params: P<IZCodeAgentService["describePlugin"]>,
  ): Promise<AR<IZCodeAgentService["describePlugin"]>> {
    return null as unknown as AR<IZCodeAgentService["describePlugin"]>;
  }

  async setPluginEnabled(
    _params: P<IZCodeAgentService["setPluginEnabled"]>,
  ): Promise<AR<IZCodeAgentService["setPluginEnabled"]>> {
    return {} as unknown as AR<IZCodeAgentService["setPluginEnabled"]>;
  }

  onDynamicPluginOperationProgress(): ReturnType<
    IZCodeAgentService["onDynamicPluginOperationProgress"]
  > {
    return Event.None as unknown as ReturnType<
      IZCodeAgentService["onDynamicPluginOperationProgress"]
    >;
  }

  disposeAll(): void {
    for (const session of this.runtime.sessions.values()) {
      session.activeTurn?.abort();
    }
    this.runtime.sessions.clear();
    this.conversationSubs.clear();
    this.sessionsIndexSubs.clear();
    this.workspaceConfigSubs.clear();
  }
}

function textToTitle(text: string): string {
  const firstLine = text.trim().split("\n")[0] ?? "";
  return firstLine.slice(0, 24) || "新任务";
}
