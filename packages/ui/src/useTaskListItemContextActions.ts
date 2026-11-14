import type { ZCodeProvider } from "@zcode/shared";
import { useCallback } from "react";
import { useTaskNativeSessionLogFile } from "@/hooks/useTaskNativeSessionLogFile.js";
import { useTaskSessionFilePath } from "@/hooks/useTaskSessionFilePath.js";
import { logger } from "@/logger.js";

interface TaskPathState {
  loading: boolean;
  path: string | null;
  exists: boolean;
}

interface TaskListItemContextActionsResult {
  taskSessionFile: TaskPathState;
  taskNativeSessionLogFile: TaskPathState;
  handleCopyText: (label: string, value: string | null) => Promise<void>;
}

/**
 * 任务右键菜单的浏览器可用动作：只读取任务会话/日志路径并复制。
 * 打开本机文件管理器、编辑器或应用属于已裁撤宿主能力，不再经平台端口接线。
 */
export function useTaskListItemContextActions({
  workspacePath,
  workspaceIdentity,
  taskId,
  provider,
  loadTaskPaths = true,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
  provider?: ZCodeProvider;
  loadTaskPaths?: boolean;
}): TaskListItemContextActionsResult {
  const taskSessionFile = useTaskSessionFilePath(workspacePath, taskId, workspaceIdentity, {
    // task session/log 路径只用于右键菜单项；菜单未打开时不要在列表重排中批量触发 RPC。
    enabled: loadTaskPaths,
  });
  const taskNativeSessionLogFile = useTaskNativeSessionLogFile(
    workspacePath,
    taskId,
    provider ?? null,
    workspaceIdentity,
    { enabled: loadTaskPaths },
  );

  const handleCopyText = useCallback(async (label: string, value: string | null) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      logger.info(`[TaskListItem] ${label} 已复制: ${value}`);
    } catch (error) {
      logger.warn("[TaskListItem] 复制文本失败", {
        label,
        value,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  return {
    taskSessionFile,
    taskNativeSessionLogFile,
    handleCopyText,
  };
}
