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

/** 辅助输入仅回填调用它的编辑器，返回 false 时弹层保留原内容。 */
export interface AIReqSpeechInputButtonProps {
  disabled: boolean;
  onInsertText: (text: string) => boolean;
  onReturnToComposer: () => void;
}

export interface AIReqSketchButtonProps {
  disabled: boolean;
  onAddFiles: (files: File[]) => string[];
  onReturnToComposer: () => void;
}
