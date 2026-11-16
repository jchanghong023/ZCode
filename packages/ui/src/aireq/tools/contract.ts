import type { ReactNode } from "react";

/** 独立工具页不拥有会话消息和未发送附件；这些始终属于当前 v4 composer。 */
export interface AIReqToolConversationProps {
  sessionId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  focused?: boolean;
  readOnly?: boolean;
  emptyState?: ReactNode;
}

export interface AIReqSketchButtonProps {
  disabled: boolean;
  onAddFiles: (files: File[]) => string[];
  onReturnToComposer: () => void;
}
