// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import type { AIReqMainView as WorkspaceMainView } from "./contract.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getEmployeeId } from "./identity.js";
import { useAIReqDataSource } from "./data-source.js";
import type {
  AIReqAction,
  AIReqDataSource,
  AIReqNativeSessionRef,
  AIReqSelection,
  AIReqWorkflowResult,
  AIReqWorkflowView,
} from "./contract.js";

export function aiReqQuery(selection: AIReqSelection): string {
  const query = new URLSearchParams();
  for (const key of ["projectId", "irId", "srId"] as const)
    if (selection[key]) query.set(key, selection[key]!);
  return query.toString();
}
interface AIReqContextValue {
  view?: AIReqWorkflowView;
  selection: AIReqSelection;
  session?: AIReqNativeSessionRef;
  mainView: WorkspaceMainView;
  setMainView(value: WorkspaceMainView): void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack(): void;
  goForward(): void;
  startProposalDraft(sourceIrId?: string): void;
  proposalDraft: { id: string; sourceIrId?: string } | null;
  closeProposalDraft(): void;
  pending: boolean;
  selectionReady: boolean;
  error?: string;
  releaseId: string;
  setReleaseId(id: string): void;
  switchProject(projectId: string): void;
  openProject(projectId: string): void;
  select(value: AIReqSelection, releaseId?: string): void;
  refresh(): Promise<void>;
  retryMaterial(path: string): Promise<boolean>;
  retrySession(target: AIReqSelection, sessionId: string): Promise<void>;
  command(value: AIReqAction): Promise<AIReqWorkflowResult | undefined>;
  setDraftNavigationGuard(guard: ((navigate: () => void) => void) | null): void;
  setNavigationGuard(guard: ((navigate: () => void) => void) | null): void;
  navigate(action: () => void): void;
  report(error: unknown): void;
}
const AIReqContext = createContext<AIReqContextValue | null>(null);
function sourceScope(source: AIReqDataSource): string {
  return JSON.stringify([source.backend?.id ?? "aireq", source.clientId, getEmployeeId()]);
}
export const useAIReq = () => useContext(AIReqContext);

/** One UI state controller; the entry point owns data and execution authority. */
export function AIReqProvider({ children }: { children: ReactNode }) {
  const source = useAIReqDataSource();
  // 登录默认项目进度；不恢复上一工号的会话或未发送提案。
  const [selection, setSelection] = useState<AIReqSelection>(() => ({
    projectId: source.initialSelection.projectId,
  }));
  const selectionRef = useRef(selection);
  const [navigation, setNavigation] = useState<{
    index: number;
    extent: number;
    mainView: WorkspaceMainView;
  }>(() => ({
    index: 0,
    extent: 0,
    mainView: "projectProgress",
  }));
  const navigationRef = useRef(navigation);
  const releaseRef = useRef("");
  const recordNavigation = useCallback(
    (target: AIReqSelection, mainView: WorkspaceMainView) => {
      const previous = navigationRef.current;
      const next = { index: previous.index + 1, extent: previous.index + 1, mainView };
      window.history.pushState(
        {
          ...window.history.state,
          aiReqSelection: target,
          aiReqBackendId: sourceScope(source),
          aiReqNavigationIndex: next.index,
          aiReqNavigationExtent: next.extent,
          aiReqMainView: mainView,
          aiReqReleaseId: releaseRef.current,
        },
        "",
      );
      navigationRef.current = next;
      setNavigation(next);
    },
    [source],
  );
  const [view, setView] = useState<AIReqWorkflowView>();
  const [loadedSelection, setLoadedSelection] = useState<AIReqSelection>();
  const viewRef = useRef(view);
  const [error, setError] = useState<string>();
  const commandError = useRef(false);
  const [pending, setPending] = useState(true);
  const [releaseId, updateReleaseId] = useState("");
  const requestRevision = useRef(0);
  const [proposalDraft, setProposalDraft] = useState<{ id: string; sourceIrId?: string } | null>(
    null,
  );
  const draftGuardRef = useRef<((navigate: () => void) => void) | null>(null);
  const guardRef = useRef<((navigate: () => void) => void) | null>(null);
  const historyReturn = useRef<{ delta: number } | null>(null);
  const approvedHistory = useRef(false);
  const setNavigationGuard = useCallback((guard: ((navigate: () => void) => void) | null) => {
    guardRef.current = guard;
  }, []);
  const setDraftNavigationGuard = useCallback((guard: ((navigate: () => void) => void) | null) => {
    draftGuardRef.current = guard;
  }, []);
  const navigate = useCallback((action: () => void) => {
    const next = () => {
      if (draftGuardRef.current) draftGuardRef.current(action);
      else action();
    };
    if (guardRef.current) guardRef.current(next);
    else next();
  }, []);
  const report = useCallback(
    (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    [],
  );
  const load = useCallback(
    async (target: AIReqSelection, _projectChanged = false, throwOnError = false) => {
      const revision = ++requestRevision.current;
      setPending(true);
      try {
        const next = await source.readWorkflow(target);
        if (revision !== requestRevision.current) return;
        viewRef.current = next;
        setView(next);
        setLoadedSelection({ ...target });
        // 修复：订阅重读不是命令重试，不能抹掉尚未处理的业务提交失败。
        if (!commandError.current) setError(next.error);
        const current = releaseRef.current;
        if (
          current &&
          !next.releases.some((item) => item.id === current && item.projectId === target.projectId)
        ) {
          releaseRef.current = "";
          updateReleaseId("");
        }
      } catch (cause) {
        if (revision === requestRevision.current) report(cause);
        if (throwOnError) throw cause;
      } finally {
        if (revision === requestRevision.current) setPending(false);
      }
    },
    [source, report],
  );
  const refresh = useCallback(() => load(selectionRef.current), [load]);
  useEffect(() => {
    void refresh();
    const unsubscribe = source.subscribeWorkflow(() => {
      void refresh();
    });
    return () => {
      unsubscribe();
      requestRevision.current += 1;
    };
  }, [source, refresh]);
  const select = useCallback(
    (
      value: AIReqSelection,
      addHistory = true,
      mainView: WorkspaceMainView = "chat",
      targetReleaseId?: string,
    ) => {
      const projectChanged = selectionRef.current.projectId !== value.projectId;
      if (projectChanged) {
        releaseRef.current = "";
        updateReleaseId("");
      }
      const selectedGroup = [
        ...(viewRef.current?.drafts ?? []),
        ...(viewRef.current?.groups ?? []),
      ].find((item) => item.projectId === value.projectId && item.id === value.irId);
      // 待办可跨项目直达；目标归属与导航同次写入，避免页头保留另一 Release。
      const detailRelease = targetReleaseId ?? selectedGroup?.releaseId;
      if (mainView === "chat" && detailRelease && detailRelease !== releaseRef.current) {
        releaseRef.current = detailRelease;
        updateReleaseId(detailRelease);
      }
      if (
        addHistory &&
        (JSON.stringify(value) !== JSON.stringify(selectionRef.current) ||
          navigationRef.current.mainView !== mainView)
      )
        recordNavigation(value, mainView);
      source.selectProject(value.projectId);
      selectionRef.current = value;
      setSelection(value);
      commandError.current = false;
      setError(undefined);
      void load(value, projectChanged);
    },
    [source, load, recordNavigation],
  );
  const setMainView = useCallback(
    (mainView: WorkspaceMainView) => {
      if (mainView === navigationRef.current.mainView) return;
      select({ projectId: selectionRef.current.projectId }, true, mainView);
    },
    [select],
  );
  const openProject = useCallback(
    (projectId: string) => {
      releaseRef.current = "";
      updateReleaseId("");
      select({ projectId }, true, "projectOverview");
    },
    [select],
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
    [select],
  );
  useEffect(() => {
    window.history.replaceState(
      {
        ...window.history.state,
        aiReqSelection: selectionRef.current,
        aiReqBackendId: sourceScope(source),
        aiReqNavigationIndex: navigationRef.current.index,
        aiReqNavigationExtent: navigationRef.current.extent,
        aiReqMainView: navigationRef.current.mainView,
        aiReqReleaseId: releaseRef.current,
      },
      "",
    );
    const restore = (event: PopStateEvent) => {
      if (event.state?.aiReqBackendId !== sourceScope(source) || !event.state?.aiReqSelection)
        return;
      const index = Number.isSafeInteger(event.state.aiReqNavigationIndex)
        ? event.state.aiReqNavigationIndex
        : 0;
      // 浏览器后退先回到原历史槽，再走设置门禁；取消不能改变当前对象。
      if (historyReturn.current) {
        const { delta } = historyReturn.current;
        historyReturn.current = null;
        const resume = () => {
          approvedHistory.current = true;
          window.history.go(delta);
        };
        if (guardRef.current || draftGuardRef.current) navigate(resume);
        else resume();
        return;
      }
      if (
        (guardRef.current || draftGuardRef.current) &&
        !approvedHistory.current &&
        index !== navigationRef.current.index
      ) {
        historyReturn.current = { delta: index - navigationRef.current.index };
        window.history.go(navigationRef.current.index - index);
        return;
      }
      approvedHistory.current = false;
      const savedView = event.state.aiReqMainView;
      const mainView: WorkspaceMainView = [
        "projectProgress",
        "projectOverview",
        "todos",
        "proposals",
        "formal",
        "requirementAnalysis",
        "skillDesign",
      ].includes(savedView)
        ? savedView
        : "chat";
      const restoredRelease =
        typeof event.state.aiReqReleaseId === "string" ? event.state.aiReqReleaseId : "";
      const next = { index, extent: navigationRef.current.extent, mainView };
      navigationRef.current = next;
      setNavigation(next);
      window.history.replaceState({ ...event.state, aiReqNavigationExtent: next.extent }, "");
      select(event.state.aiReqSelection as AIReqSelection, false, mainView);
      releaseRef.current = restoredRelease;
      updateReleaseId(restoredRelease);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, select, navigate]);
  const startProposalDraft = useCallback(
    (sourceIrId?: string) => {
      navigate(() => {
        recordNavigation(selectionRef.current, "proposals");
        setProposalDraft({ id: createUuid(), sourceIrId });
      });
    },
    [navigate, recordNavigation],
  );
  const setReleaseId = useCallback(
    (id: string) => {
      const current = selectionRef.current;
      if (id === releaseRef.current) return;
      if (
        id &&
        !viewRef.current?.releases.some(
          (item) => item.id === id && item.projectId === current.projectId,
        )
      )
        return;
      releaseRef.current = id;
      updateReleaseId(id);
      const target = {
        projectId: current.projectId,
        ...(current.formalView ? { formalView: "list" as const } : {}),
      };
      // Release 切换离开当前 IR，回到对应需求列表；详情不能脱离其所属范围。
      const mainView =
        navigationRef.current.mainView === "chat"
          ? current.formalView ||
            viewRef.current?.groups.some(
              (item) => item.projectId === current.projectId && item.id === current.irId,
            )
            ? "formal"
            : "proposals"
          : navigationRef.current.mainView;
      recordNavigation(target, mainView);
      select(target, false, mainView);
    },
    [select, recordNavigation],
  );
  const retryMaterial = useCallback(
    async (path: string) => {
      try {
        const recovered = await source.retryMaterial(path, selectionRef.current);
        await refresh();
        return recovered;
      } catch (cause) {
        report(cause);
        return false;
      }
    },
    [source, refresh, report],
  );
  const retrySession = useCallback(
    async (target: AIReqSelection, sessionId: string) => {
      const isCurrent = () =>
        selectionRef.current === target &&
        Boolean(
          viewRef.current &&
          source.resolveSession(viewRef.current, target)?.sessionId === sessionId,
        );
      if (!isCurrent()) throw new Error("会话已切换，请在当前会话中重试。");
      try {
        await source.retrySession({ ...target });
        if (!isCurrent()) throw new Error("会话已切换，请在当前会话中重试。");
        await load(target, false, true);
        if (!isCurrent()) throw new Error("会话已切换，请在当前会话中重试。");
      } catch (cause) {
        if (isCurrent()) report(cause);
        throw cause;
      }
    },
    [source, load, report],
  );
  const command = useCallback(
    async (value: AIReqAction) => {
      const target = selectionRef.current;
      try {
        const result = await source.command(value, target, viewRef.current?.revision ?? 0);
        if (result.status === "failed")
          throw new Error(result.error ?? result.receipt.error ?? "操作失败。");
        // An operation completing in the background must not navigate a different view.
        if (selectionRef.current !== target) return result;
        commandError.current = false;
        if (value.type === "createProposal" || value.type === "importProposals") await refresh();
        else if (value.type === "runRequirementsReview" || value.type === "submitProposalReview")
          select({
            ...target,
            discussionPhase: "requirements",
            proposalStep: "requirements-review",
            reviewAgent: undefined,
            proposalEditing: undefined,
          });
        else if (value.type === "runFullReview")
          // 修复：完整评审结束后的默认头像必须与实际原生报告会话一致。
          select({
            ...target,
            discussionPhase: "solution",
            proposalStep: "solution",
            reviewAgent: "summary",
            materialPath: undefined,
            proposalEditing: undefined,
          });
        else if (["acceptProposal", "returnProposal"].includes(value.type))
          select({
            ...target,
            materialPath: undefined,
            discussionPhase: undefined,
            proposalStep: undefined,
            proposalEditing: undefined,
          });
        else if (value.type === "deleteRequirement")
          select({ projectId: target.projectId }, true, target.formalView ? "formal" : "proposals");
        else await refresh();
        setError(undefined);
        return result;
      } catch (cause) {
        if (selectionRef.current === target) {
          commandError.current = true;
          report(cause);
        }
        return undefined;
      }
    },
    [source, refresh, report, select],
  );
  return (
    <AIReqContext.Provider
      value={{
        view,
        selection,
        session: view && source.resolveSession(view, selection),
        pending,
        selectionReady: Boolean(
          view && loadedSelection && JSON.stringify(loadedSelection) === JSON.stringify(selection),
        ),
        mainView: navigation.mainView,
        setMainView,
        canGoBack: navigation.index > 0,
        canGoForward: navigation.index < navigation.extent,
        goBack: () => {
          if (navigationRef.current.index > 0) window.history.back();
        },
        goForward: () => {
          if (navigationRef.current.index < navigationRef.current.extent) window.history.forward();
        },
        error,
        releaseId,
        setReleaseId,
        switchProject,
        openProject: (projectId) => navigate(() => openProject(projectId)),
        select: (value, targetReleaseId) =>
          navigate(() => select(value, true, "chat", targetReleaseId)),
        refresh,
        retryMaterial,
        retrySession,
        command,
        report,
        startProposalDraft,
        proposalDraft,
        closeProposalDraft: () => setProposalDraft(null),
        setDraftNavigationGuard,
        setNavigationGuard,
        navigate,
      }}
    >
      {children}
    </AIReqContext.Provider>
  );
}
