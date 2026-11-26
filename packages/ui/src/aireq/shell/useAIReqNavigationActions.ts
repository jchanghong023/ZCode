import { useCallback, type RefObject } from "react";
import type { AIReqMainView, AIReqSelection, AIReqWorkflowView } from "../contract.js";

type SelectTarget = (value: AIReqSelection, addHistory?: boolean, mainView?: AIReqMainView) => void;

/** 只转发导航意图；选择和历史由 AIReqContext 持有。 */
export function useAIReqNavigationActions({
  navigationRef,
  selectionRef,
  viewRef,
  select,
}: {
  navigationRef: RefObject<{ mainView: AIReqMainView }>;
  selectionRef: RefObject<AIReqSelection>;
  viewRef: RefObject<AIReqWorkflowView | undefined>;
  select: SelectTarget;
}) {
  const setMainView = useCallback(
    (mainView: AIReqMainView) => {
      if (mainView === navigationRef.current.mainView) return;
      const projectId = mainView === "roles" ? undefined : selectionRef.current.projectId;
      const releaseId =
        projectId && mainView !== "projectProgress" ? selectionRef.current.releaseId : undefined;
      select({ projectId, releaseId }, true, mainView);
    },
    [select, selectionRef, navigationRef],
  );
  const openProject = useCallback(
    (projectId: string, releaseId?: string) => {
      if (!viewRef.current?.projects.some((project) => project.id === projectId)) return;
      if (
        releaseId &&
        !viewRef.current.releases.some(
          (release) => release.projectId === projectId && release.id === releaseId,
        )
      )
        return;
      select({ projectId, releaseId }, true, "proposals");
      return true;
    },
    [select, viewRef],
  );
  const switchProject = useCallback(
    (projectId: string) => {
      const current = selectionRef.current;
      if (current.projectId === projectId) return;
      // 详情属于原 IR；切项目时返回同类需求列表，不能留下无对象的聊天页。
      const mainView =
        navigationRef.current.mainView === "chat" ? "proposals" : navigationRef.current.mainView;
      select({ projectId }, true, mainView);
    },
    [select, selectionRef, navigationRef],
  );
  return {
    setMainView,
    openProject,
    switchProject,
  };
}
