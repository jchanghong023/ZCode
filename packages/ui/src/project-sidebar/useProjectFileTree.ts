import { useCallback, useEffect, useRef } from "react";
import type {
  ProjectSidebarProps,
  ProjectTask,
  VirtualProject,
} from "@/project-sidebar/contract.js";
import { getPathLeaf } from "@/lib/path.js";
import { resolveProjectFileTarget } from "@/project-sidebar/project-file-navigation.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";

export function useProjectFileTree(props: ProjectSidebarProps) {
  const { onOpenFileManager, fileTreeOpenRequest } = props;
  const consumedRequest = useRef<ProjectSidebarProps["fileTreeOpenRequest"]>(null);
  useEffect(() => {
    const next = fileTreeOpenRequest;
    if (!next || consumedRequest.current === next || !onOpenFileManager) return;
    consumedRequest.current = next;
    onOpenFileManager(next.target);
  }, [fileTreeOpenRequest, onOpenFileManager]);
  const openFiles = useCallback(
    async (project: VirtualProject, rootPath: string) => {
      const target = resolveProjectFileTarget({ project, rootPath });
      onOpenFileManager?.(target);
    },
    [onOpenFileManager],
  );

  const openTaskFiles = useCallback(
    async (task: ProjectTask, remoteSessionId?: string) => {
      const identity = task.workspaceIdentity?.trim();
      const sessions = useRemoteWorkspaceSessionStore.getState();
      const sessionId = identity
        ? (sessions.sessionIdByWorkspaceIdentity[identity] ?? remoteSessionId)
        : undefined;
      const session = sessionId ? sessions.sessionsById[sessionId] : undefined;
      // 原因：远端 cwd 可与本地同名；只接受该任务 identity 对应的 session，不能退回本机读取。
      // 手机 bridge 将 identity 绑定单独保存在索引，不一定重复写入 session 元数据。
      if (
        identity &&
        (!session ||
          (sessions.sessionIdByWorkspaceIdentity[identity] !== sessionId &&
            session.workspaceIdentity !== identity))
      )
        throw new Error("project.connection-unavailable");
      // worktree 任务的文件在它自己的 cwd 中，不在项目主目录（docs/git/worktree.md §3.7）。
      const filesPath = task.cwd ?? task.workspacePath;
      onOpenFileManager?.({
        workspacePath: filesPath,
        workspaceName: getPathLeaf(filesPath) || filesPath,
        ...(identity ? { workspaceIdentity: identity, workspaceRemoteSessionId: sessionId } : {}),
      });
    },
    [onOpenFileManager],
  );
  return { openFiles, openTaskFiles };
}
