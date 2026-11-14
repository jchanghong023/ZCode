import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu.js";
import { TaskActionMenuContent } from "@/TaskActionMenuContent.js";

export function TaskListItemContextMenu({
  organizationActions,
  intl,
  isPinned,
  isArchived = false,
  taskSessionFile,
  activeSessionId,
  taskNativeSessionLogFile,
  onTogglePinTask,
  onStartRenameTask,
  onArchiveTask,
  onMarkTaskAsUnread,
  onCopyWorkspacePath,
  onCopyTaskPath,
  onCopyTaskLogPath,
  onCopySessionId,
  disableTaskActions = false,
  disabledReason,
  archiveDisabledReason,
}: {
  organizationActions?: React.ReactNode;
  intl: {
    formatMessage: (desc: { id: string }, values?: Record<string, string>) => string;
  };
  isPinned: boolean;
  isArchived?: boolean;
  taskSessionFile: { loading: boolean; path: string | null; exists: boolean };
  activeSessionId?: string | null;
  taskNativeSessionLogFile: {
    loading: boolean;
    path: string | null;
    exists: boolean;
  };
  onTogglePinTask: () => void;
  onStartRenameTask: () => void;
  onArchiveTask: () => void;
  onMarkTaskAsUnread: () => void;
  onCopyWorkspacePath: () => void;
  onCopyTaskPath: () => void;
  onCopyTaskLogPath: () => void;
  onCopySessionId?: () => void;
  disableTaskActions?: boolean;
  disabledReason?: string;
  archiveDisabledReason?: string;
}) {
  return (
    <ContextMenuContent className="w-52">
      {organizationActions}
      <TaskActionMenuContent
        intl={intl}
        isPinned={isPinned}
        isArchived={isArchived}
        taskSessionFile={taskSessionFile}
        activeSessionId={activeSessionId}
        taskNativeSessionLogFile={taskNativeSessionLogFile}
        Item={ContextMenuItem}
        Separator={ContextMenuSeparator}
        onTogglePinTask={onTogglePinTask}
        onStartRenameTask={onStartRenameTask}
        onArchiveTask={onArchiveTask}
        onMarkTaskAsUnread={onMarkTaskAsUnread}
        onCopyWorkspacePath={onCopyWorkspacePath}
        onCopyTaskPath={onCopyTaskPath}
        onCopyTaskLogPath={onCopyTaskLogPath}
        onCopySessionId={onCopySessionId}
        disableTaskActions={disableTaskActions}
        disabledReason={disabledReason}
        archiveDisabledReason={archiveDisabledReason}
      />
    </ContextMenuContent>
  );
}
