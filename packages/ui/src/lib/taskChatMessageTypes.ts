// re-home 产物（为删除 zcodeChatMessages 铺路，模式同 zcode-task-types-core）。
// 本文件承载旧消息转换层（zcodeChatMessages/zcodeChatMessageHelpers）中仍被存活栈
// type-only 消费的承重类型：TaskChatMessage / TaskChatToolCall / TaskChatMessagePart。
// 消费方：ToolCallBlocks(toolCallTree) / PermissionDialog / taskChangeSummary /
// codeViewer / toolDisplay / toolError / app-shell 测试注入通道。
// 旧消息拼装运行时（zcodeChatMessages.ts）删除后，这里是该类型面的唯一事实源。
import type { ZCodeTaskSnapshotToolFieldRef } from "@zcode/shared";

export interface TaskChatToolCall {
  toolId: string;
  /** 上级 toolCallId；null 表示主 agent，非空表示来自某个 Task/Agent 子工具。 */
  parentToolUseId?: string | null;
  /** ZCode 固定工具名；kind 仍保留给旧 ZCode Agent 快照和 UI 聚合分类兼容。 */
  toolName?: string;
  kind: string;
  title?: string;
  input: unknown;
  status: string;
  /** parentToolUseId 归属的子 agent 正文输出。 */
  content?: string;
  /** parentToolUseId 归属的子 agent 思考输出。 */
  thought?: string;
  output?: unknown;
  error?: string;
  raw?: unknown;
  /** 工具大字段被快照预算裁剪后的引用；用于按需回填该工具的完整 input/output/raw。 */
  snapshotRefs?: ZCodeTaskSnapshotToolFieldRef[];
  /** tool call 首次进入当前消息流的本地时间，仅用于识别长时间运行中的工具调用。 */
  startedAt?: number;
}

