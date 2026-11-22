import { proposalTaskSelection, type ProposalTask } from "../proposals/proposalTasks.js";
import { useCallback, type RefObject } from "react";
import type { AIReqMainView, AIReqWorkflowTarget, AIReqWorkflowView } from "../contract.js";

type WorkspaceMainView = AIReqMainView;
export type ProjectOverviewOrigin = { projectId: string; releaseId: string };
type NavigationSnapshot = { mainView: WorkspaceMainView; overviewOrigin?: ProjectOverviewOrigin };
type SelectTarget = (
  value: AIReqWorkflowTarget,
  addHistory?: boolean,
  mainView?: WorkspaceMainView,
  targetReleaseId?: string,
  overviewOrigin?: ProjectOverviewOrigin | null,
  task?: ProposalTask,
) => void;

/** 只转发导航意图；所有可变选择、来源和历史仍由 AIReqContext 唯一持有。 */
export function useAIReqNavigationActions({
  navigationRef,
  selectionRef,
  releaseRef,
  viewRef,
  navigate,
  select,
}: {
  navigationRef: RefObject<NavigationSnapshot>;
  selectionRef: RefObject<AIReqWorkflowTarget>;
  releaseRef: RefObject<string>;
  viewRef: RefObject<AIReqWorkflowView | undefined>;
  navigate: (action: () => void) => void;
  select: SelectTarget;
}) {
  const setMainView = useCallback(
    (mainView: WorkspaceMainView, options?: { fromSidebar?: boolean }) => {
      if (
        mainView === navigationRef.current.mainView &&
        !(options?.fromSidebar && navigationRef.current.overviewOrigin)
      )
        return;
      select(
        { projectId: selectionRef.current.projectId },
        true,
        mainView,
        undefined,
        options?.fromSidebar ? null : undefined,
      );
    },
    [select, selectionRef, navigationRef],
  );
  const openFromProjectOverview = useCallback(
    (
      mainView: "proposals" | "formal" | "chat" | "todos",
      target?: AIReqWorkflowTarget,
      targetReleaseId?: string,
    ) => {
      navigate(() => {
        const projectId = selectionRef.current.projectId;
        const releaseId = releaseRef.current;
        if (navigationRef.current.mainView !== "projectOverview" || !projectId || !releaseId)
          return;
        select(target ?? { projectId }, true, mainView, targetReleaseId ?? releaseId, {
          projectId,
          releaseId,
        });
      });
    },
    [navigate, select, selectionRef, releaseRef, navigationRef],
  );
  const returnToProjectOverview = useCallback(() => {
    // 明确返回来源概览，而不是后退到可能属于表单、设置或外站的历史项。
    navigate(() => {
      const origin = navigationRef.current.overviewOrigin;
      if (
        !origin ||
        origin.projectId !== selectionRef.current.projectId ||
        origin.releaseId !== releaseRef.current ||
        !viewRef.current?.releases.some(
          (release) => release.projectId === origin.projectId && release.id === origin.releaseId,
        )
      )
        return;
      select({ projectId: origin.projectId }, true, "projectOverview", origin.releaseId, null);
    });
  }, [navigate, select, selectionRef, releaseRef, navigationRef, viewRef]);
  const openProject = useCallback(
    (
      projectId: string,
      mainView: "projectOverview" | "proposals" | "formal" = "projectOverview",
      releaseId?: string,
    ) => {
      if (
        releaseId &&
        !viewRef.current?.releases.some(
          (release) => release.projectId === projectId && release.id === releaseId,
        )
      )
        return;
      select({ projectId }, true, mainView, releaseId);
    },
    [select, viewRef],
  );
  const switchProject = useCallback(
    (projectId: string) => {
      const current = selectionRef.current;
      if (current.projectId === projectId) return;
      // 详情属于原 IR；切项目时返回同类需求列表，不能留下无对象的聊天页。
      const mainView =
        navigationRef.current.mainView === "chat"
          ? current.formalView ||
            viewRef.current?.groups.some(
              (item) => item.projectId === current.projectId && item.id === current.irId,
            )
            ? "formal"
            : "proposals"
          : navigationRef.current.mainView;
      select({ projectId }, true, mainView);
    },
    [select, viewRef, selectionRef, navigationRef],
  );
  const openProposalTask = useCallback(
    (task: ProposalTask, agent?: import("../contract.js").AIReqReviewAgentId) => {
      navigate(() =>
        select(
          proposalTaskSelection(selectionRef.current, task, agent),
          true,
          "chat",
          undefined,
          undefined,
          task,
        ),
      );
    },
    [navigate, select, selectionRef],
  );
  return {
    openProposalTask,
    setMainView,
    openFromProjectOverview,
    returnToProjectOverview,
    openProject,
    switchProject,
  };
}
