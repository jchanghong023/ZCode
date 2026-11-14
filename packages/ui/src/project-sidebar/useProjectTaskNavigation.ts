import { useCallback, useLayoutEffect, useRef } from "react";
import type {
  ProjectSidebarProps,
  ProjectTaskNavigation,
  ProjectTaskNavigationResult,
} from "@/project-sidebar/contract.js";
import { logger } from "@/logger.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { onTaskNavigationCommitted } from "@/store/zcodeSessionStoreNavigation.js";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";

/** 打开任务才绑定 workspace；列表 mutation 不借导航创建 scope。 */
export function useProjectTaskNavigation(props: ProjectSidebarProps): ProjectTaskNavigation {
  const tabStore = useTabStoreApi();
  const sequence = useRef(0);
  useLayoutEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const latest = useRef({ props });
  useLayoutEffect(() => {
    latest.current = { props };
  });
  return useCallback(
    (path, taskId, identity, remoteSessionId, unreadAt, options) => {
      const request = ++sequence.current;
      const cancelled: ProjectTaskNavigationResult = {
        status: "unavailable",
        reason: "project.navigation-cancelled",
      };
      const { props } = latest.current;
      let selecting = false;
      let supersededByNavigation = false;
      const navigationObserver = onTaskNavigationCommitted(() => {
        if (!selecting) supersededByNavigation = true;
      });
      const selectionResult = (): ProjectTaskNavigationResult => {
        const state = tabStore.getState();
        // 原回调会在模型重建或远端 scope 不可用时拒绝选择；投递事件不能冒充实际打开。
        return (state.activeWorkspaceIdentity || state.activeWorkspacePath) ===
          (identity || path) &&
          useZCodeSessionStore.getState().getWorkspaceState(path, identity).activeTaskId === taskId
          ? { status: "opened" }
          : { status: "unavailable", reason: "project.navigation-rejected" };
      };
      const open = async (): Promise<ProjectTaskNavigationResult> => {
        if (options?.signal?.aborted) return cancelled;
        // 提交选择前只复验本请求的取消及代际。
        if (options?.signal?.aborted || sequence.current !== request || supersededByNavigation)
          return cancelled;
        // 必须观察本次调用产生的完整导航提交；缓存 activeTaskId 可能仍属于已离开的草稿。
        let committed = false;
        const subscription = onTaskNavigationCommitted((target) => {
          if (
            sequence.current === request &&
            !options?.signal?.aborted &&
            target.taskId === taskId &&
            (target.workspaceIdentity || target.workspacePath) === (identity || path)
          )
            committed = true;
        });
        try {
          selecting = true;
          await props.onSelectTask(path, taskId, identity, remoteSessionId, unreadAt);
          if (sequence.current !== request || options?.signal?.aborted) return cancelled;
          return committed
            ? selectionResult()
            : { status: "unavailable", reason: "project.navigation-rejected" };
        } finally {
          subscription.dispose();
        }
      };
      return open()
        .catch((error): ProjectTaskNavigationResult => {
          // Bug 原因：首连等待期间连点任务，被替代的旧点击会抛 navigation-cancelled，或与新点击共享
          // 同一连接失败，每次都弹错误。被替代是用户的新意图，结果只由最新导航提示。
          if (
            options?.signal?.aborted ||
            supersededByNavigation ||
            sequence.current !== request ||
            (error instanceof Error && error.message === "project.navigation-cancelled")
          )
            return cancelled;
          logger.error("[project-sidebar] 打开任务失败", error);
          toast(String(error));
          return {
            status: "unavailable",
            reason: error instanceof Error ? error.message : String(error),
          };
        })
        .finally(() => navigationObserver.dispose());
    },
    [tabStore],
  );
}
