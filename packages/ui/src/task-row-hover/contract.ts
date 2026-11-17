import type { ReactElement } from "react";
import type { ZCodeTaskMeta } from "@zcode/shared";

/**
 * 会话行悬浮卡片的输入契约。
 *
 * 卡片只读，不修改任务、workspace 或 Git 状态；调用方提供任务事实和行内显示名，
 * 分支标签由调用方提供真实 Git 投影；卡片不自行查询 Git。
 */
export interface TaskRowIdentityHoverCardProps {
  /** 会话行对应的任务事实；worktree 标签、路径、最近活动都从它派生。 */
  task: ZCodeTaskMeta;
  /** 会话行当前显示的工作区名；worktree 任务在卡片里会被 `<仓库名> · <bucket>` 覆盖。 */
  workspaceLabel: string;
  /** 远程会话的 Host session；用于把 home 缩写路由到远端。 */
  remoteSessionId?: string;
  branchLabel?: string | null;
  /**
   * 当前表面不应出现悬停卡片时显式禁用（例如 Web remote 的分组行）。
   * 远程未连接不是禁用条件：卡片仍显示已知路径和活动时间，只跳过 RPC。
   */
  disabled?: boolean;
  /** 触发器必须是一个元素，Radix HoverCardTrigger 会合并到该元素上。 */
  children: ReactElement;
}
