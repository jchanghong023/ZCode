import { createUuid } from "@zcode/shared";
import type {
  AssistantTextRow,
  PlanState,
  ReasoningRow,
  SessionUsageState,
  SubagentRow,
  ToolCallRow,
  WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";

type TextRow = AssistantTextRow | ReasoningRow;
type End = "complete" | "failed" | "interrupted";
type Usage = SessionUsageState["cumulative"];
interface Sink {
  turnId: string;
  model?: string;
  base(): Pick<TextRow, "rowId" | "createdAt" | "createdAtSeq">;
  append(row: WireConversationRow): void;
  upsert(row: WireConversationRow): void;
  appendText?(row: TextRow, delta: string): void;
  addUsage(usage: Usage): void;
  setPlan?(plan: PlanState | null): void;
}

// SDK 事件可能含认证元数据、隐藏签名、工具原始结果或嵌套 Agent 的消息。
// 只在实际消费的位置投影需要的字段，不能把整个 SDK 对象直接写入协议行。
interface SourceEvent {
  type: string;
  message?: unknown;
  assistantMessageEvent?: {
    type: string;
    contentIndex?: number;
    content?: unknown;
    delta?: string;
  };
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  cancelled?: boolean;
  partialResult?: unknown;
  result?: unknown;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function tokens(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function childState(
  child: Record<string, unknown>,
  result: boolean,
): SubagentRow["status"] | undefined {
  if (result) {
    if (child.aborted === true) return "cancelled";
    if (typeof child.exitCode === "number") return child.exitCode === 0 ? "success" : "failed";
    return undefined;
  }
  switch (child.status) {
    case "running":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "failed";
    case "aborted":
      return "cancelled";
    default:
      return undefined;
  }
}

export class NativeRows {
  private blocks = new Map<number, TextRow>();
  private tools = new Map<string, ToolCallRow>();
  private children = new Map<string, SubagentRow>();
  private responseId: string;
  private model?: string;
  private finished = false;

  constructor(private readonly sink: Sink) {
    this.responseId = createUuid();
    this.model = sink.model;
  }

  private base() {
    return { ...this.sink.base(), turnId: this.sink.turnId, entityId: createUuid() };
  }

  event(event: SourceEvent): void {
    if (this.finished) return;
    if (event.type.startsWith("tool_execution_")) {
      this.tool(event);
      return;
    }
    if (event.type === "todo_auto_clear") this.sink.setPlan?.(null);
    const message = record(event.message);
    if (message?.role !== "assistant") return;
    if (typeof message.model === "string") this.model = message.model;
    if (event.type === "message_start") {
      this.closeBlocks("interrupted");
      this.blocks.clear();
      this.responseId =
        typeof message.responseId === "string" && message.responseId
          ? message.responseId
          : createUuid();
    } else if (event.type === "message_update") {
      const update = event.assistantMessageEvent;
      if (!update || update.contentIndex === undefined) return;
      const { type, contentIndex: index } = update;
      if (
        type !== "text_delta" &&
        type !== "thinking_delta" &&
        type !== "text_end" &&
        type !== "thinking_end"
      )
        return;
      const block = Array.isArray(message.content) ? record(message.content[index]) : undefined;
      if (block?.type === "redactedThinking") return;
      const kind =
        type.startsWith("thinking") && block?.narration !== true ? "reasoning" : "assistantText";
      if (type.endsWith("_delta") && update.delta) this.text(index, kind, update.delta, true);
      if (type.endsWith("_end") && typeof update.content === "string") {
        this.text(index, kind, update.content, false);
        this.closeBlock(index, "complete");
      }
    } else if (event.type === "message_end") {
      // 部分提供方只在结束时给完整正文，另一些会修正已流出的片段。
      if (Array.isArray(message.content))
        for (const [index, value] of message.content.entries()) {
          const block = record(value);
          if (block?.type === "text" && typeof block.text === "string") {
            this.text(index, "assistantText", block.text, false);
          } else if (block?.type === "thinking" && typeof block.thinking === "string") {
            this.text(
              index,
              block.narration === true ? "assistantText" : "reasoning",
              block.thinking,
              false,
            );
          }
        }
      this.closeBlocks(
        message.stopReason === "aborted"
          ? "interrupted"
          : message.stopReason === "error"
            ? "failed"
            : "complete",
      );
      const usage = record(message.usage);
      if (
        usage &&
        tokens(usage.input) &&
        tokens(usage.output) &&
        tokens(usage.cacheRead) &&
        tokens(usage.cacheWrite)
      ) {
        this.sink.addUsage({
          inputTokens: usage.input,
          outputTokens: usage.output,
          cacheReadTokens: usage.cacheRead,
          cacheWriteTokens: usage.cacheWrite,
        });
      }
    }
  }

  private text(index: number, kind: TextRow["kind"], value: string, delta: boolean) {
    const previous = this.blocks.get(index);
    if (!previous && !value) return;
    const text = delta && previous ? previous.text + value : value;
    if (previous?.text === text && previous.kind === kind) return;
    const row: TextRow = {
      ...(previous ?? this.base()),
      kind,
      assistantResponseId: this.responseId,
      text,
      state: previous?.state === "complete" ? "complete" : "streaming",
      ...(kind === "assistantText" && this.model ? { model: this.model } : {}),
    };
    this.blocks.set(index, row);
    if (!previous) this.sink.append(row);
    else if (
      delta &&
      previous.kind === kind &&
      previous.state === "streaming" &&
      this.sink.appendText
    )
      this.sink.appendText(row, value);
    else this.sink.upsert(row);
  }

  private closeBlock(index: number, state: End) {
    const row = this.blocks.get(index);
    if (row?.state !== "streaming") return;
    const next: TextRow =
      row.kind === "reasoning"
        ? {
            ...row,
            state: state === "complete" ? "complete" : "interrupted",
            durationMs: Math.max(0, Date.now() - row.createdAt),
          }
        : { ...row, state };
    this.blocks.set(index, next);
    this.sink.upsert(next);
  }
  private closeBlocks(state: End) {
    for (const index of this.blocks.keys()) this.closeBlock(index, state);
  }

  private tool(event: SourceEvent) {
    const { toolCallId, toolName } = event;
    if (!toolCallId || !toolName) return;
    const existing = this.tools.get(toolCallId);
    if (event.type === "tool_execution_start" && !existing) {
      const base = this.base();
      const row: ToolCallRow = {
        ...base,
        kind: "toolCall",
        assistantResponseId: this.responseId,
        toolCallId,
        toolName,
        inputText: "",
        status: "running",
        startedAt: base.createdAt,
      };
      this.tools.set(toolCallId, row);
      this.sink.append(row);
    }
    if (event.type === "tool_execution_end" && existing?.status === "running") {
      const status = event.cancelled ? "cancelled" : event.isError ? "error" : "success";
      const row: ToolCallRow = {
        ...existing,
        status,
        endedAt: Date.now(),
        ...(status === "error"
          ? { error: { code: "fault.omp.toolFailed", message: "OMP 工具执行失败。" } }
          : {}),
      };
      this.tools.set(toolCallId, row);
      this.sink.upsert(row);
    }
    const details = record(record(event.partialResult ?? event.result)?.details);
    if (!details) return;
    if (
      toolName === "todo" &&
      event.type === "tool_execution_end" &&
      !event.isError &&
      !event.cancelled
    )
      this.todo(details.phases);
    if (toolName === "task") {
      if (Array.isArray(details.progress))
        for (const child of details.progress) this.child(toolCallId, child, false);
      if (Array.isArray(details.results))
        for (const child of details.results) this.child(toolCallId, child, true);
    }
  }
  private todo(phases: unknown) {
    if (!Array.isArray(phases) || !this.sink.setPlan) return;
    const items: PlanState["items"] = [];
    for (const [phaseIndex, value] of phases.entries()) {
      const phase = record(value);
      if (!Array.isArray(phase?.tasks)) return;
      for (const [taskIndex, taskValue] of phase.tasks.entries()) {
        const task = record(taskValue);
        if (task?.status === "abandoned") continue;
        if (typeof task?.content !== "string") return;
        const status = task.status === "in_progress" ? "inProgress" : task.status;
        if (status !== "pending" && status !== "inProgress" && status !== "completed") return;
        items.push({ id: `${phaseIndex}:${taskIndex}`, content: task.content, status });
      }
    }
    this.sink.setPlan({ items, updatedAt: Date.now() });
  }
  private child(toolId: string, value: unknown, result: boolean) {
    const child = record(value);
    if (typeof child?.id !== "string" || typeof child.agent !== "string") return;
    const status = childState(child, result);
    if (!status) return;
    const key = JSON.stringify([toolId, child.id]);
    const previous = this.children.get(key);
    if (previous && previous.status !== "running") return;
    const summaryText =
      typeof child.description === "string" ? child.description : (previous?.summaryText ?? "");
    if (previous?.status === status && previous.summaryText === summaryText) return;
    const row: SubagentRow = {
      ...(previous ?? this.base()),
      kind: "subagent",
      parentToolCallId: toolId,
      subagentType: child.agent,
      summaryText,
      status,
      ...(status === "running"
        ? { startedAt: previous?.startedAt ?? Date.now() }
        : { endedAt: Date.now() }),
    };
    this.children.set(key, row);
    if (previous) this.sink.upsert(row);
    else this.sink.append(row);
  }

  finish(state: End, reply?: string): void {
    if (this.finished) return;
    if (reply && ![...this.blocks.values()].some((row) => row.kind === "assistantText")) {
      this.text(-1, "assistantText", reply, false);
    }
    this.closeBlocks(state);
    // 缺少结束事件时不推测成功；只把被取消或失败的宿主执行收口。
    if (state !== "complete") {
      const endedAt = Date.now();
      for (const row of this.tools.values())
        if (row.status === "running") {
          this.sink.upsert({
            ...row,
            status: state === "interrupted" ? "cancelled" : "error",
            endedAt,
            ...(state === "failed"
              ? { error: { code: "fault.omp.executionFailed", message: "OMP 执行失败。" } }
              : {}),
          });
        }
      for (const row of this.children.values())
        if (row.status === "running") {
          this.sink.upsert({
            ...row,
            status: state === "interrupted" ? "cancelled" : "failed",
            endedAt,
          });
        }
    }
    this.finished = true;
  }
}
