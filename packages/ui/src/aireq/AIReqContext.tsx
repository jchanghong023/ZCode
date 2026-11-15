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
import type { ConversationComposerSendOptions } from "../v4/ConversationComposer.js";
import { getEmployeeId } from "./identity.js";
import { useAIReqDataSource } from "./data-source.js";
import { selectionForRelease } from "./contract.js";
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
  startProposalDraft(): void;
  pending: boolean;
  selectionReady: boolean;
  error?: string;
  releaseId: string;
  setReleaseId(id: string): void;
  switchProject(projectId: string): void;
  select(value: AIReqSelection): void;
  refresh(): Promise<void>;
  retryMaterial(path: string): Promise<boolean>;
  retrySession(target: AIReqSelection, sessionId: string): Promise<void>;
  command(value: AIReqAction): Promise<AIReqWorkflowResult | undefined>;
  openFirstDiscussion(
    text: string,
    options: ConversationComposerSendOptions,
    preparedSessionId: string,
  ): Promise<AIReqNativeSessionRef>;
  finishFirstDiscussion(sessionId: string): void;
  setNavigationGuard(guard: ((navigate: () => void) => void) | null): void;
  navigate(action: () => void): void;
  report(error: unknown): void;
}
const AIReqContext = createContext<AIReqContextValue | null>(null);
function sourceScope(source: AIReqDataSource): string {
  return JSON.stringify([source.backend?.id ?? "aireq", source.clientId, getEmployeeId()]);
}
export const useAIReq = () => useContext(AIReqContext);

function scopeProposalDraft(value: AIReqSelection, webId: string): AIReqSelection {
  if (!value.proposalDraftId) return value;
  try {
    const key = JSON.parse(value.proposalDraftId);
    if (
      Array.isArray(key) &&
      key[0] === webId &&
      key[1] === getEmployeeId() &&
      key[2] === value.projectId &&
      key[3] === value.proposalDraftReleaseId
    )
      return value;
  } catch {
    /* 无效历史记录不恢复其他账号的未发送输入。 */
  }
  return { projectId: value.projectId };
}

/** One UI state controller; the entry point owns data and execution authority. */
export function AIReqProvider({ children }: { children: ReactNode }) {
  const source = useAIReqDataSource();
  // 每次进入工作台都从需求分析开始，不恢复上一位用户或上次登录的页面／需求会话。
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
    mainView: "requirementAnalysis",
  }));
  const navigationRef = useRef(navigation);
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
        },
        "",
      );
      navigationRef.current = next;
      setNavigation(next);
    },
    [source],
  );
  const setMainView = useCallback(
    (mainView: WorkspaceMainView) => {
      if (mainView !== navigationRef.current.mainView)
        recordNavigation(selectionRef.current, mainView);
    },
    [recordNavigation],
  );

  const [view, setView] = useState<AIReqWorkflowView>();
  const [loadedSelection, setLoadedSelection] = useState<AIReqSelection>();
  const viewRef = useRef(view);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(true);
  const [releaseId, updateReleaseId] = useState("");
  const requestRevision = useRef(0);
  const provisional = useRef(
    new Map<string, { projectId: string; irId: string; sessionId: string }>(),
  );
  const creatingFirst = useRef<Promise<AIReqNativeSessionRef> | null>(null);
  const guardRef = useRef<((navigate: () => void) => void) | null>(null);
  const historyReturn = useRef<{ delta: number } | null>(null);
  const approvedHistory = useRef(false);
  const setNavigationGuard = useCallback((guard: ((navigate: () => void) => void) | null) => {
    guardRef.current = guard;
  }, []);
  const navigate = useCallback((action: () => void) => {
    if (guardRef.current) guardRef.current(action);
    else action();
  }, []);
  const report = useCallback(
    (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    [],
  );
  const load = useCallback(
    async (target: AIReqSelection, projectChanged = false, throwOnError = false) => {
      const revision = ++requestRevision.current;
      setPending(true);
      try {
        const next = await source.readWorkflow(target);
        if (revision !== requestRevision.current) return;
        viewRef.current = next;
        setView(next);
        setLoadedSelection({ ...target });
        setError(next.error);
        updateReleaseId((current) =>
          !projectChanged &&
          next.releases.some((item) => item.id === current && item.projectId === target.projectId)
            ? current
            : (next.releases.find((item) => item.projectId === target.projectId)?.id ?? ""),
        );
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
    (value: AIReqSelection, addHistory = true, mainView: WorkspaceMainView = "chat") => {
      value = scopeProposalDraft(value, sourceScope(source));
      const projectChanged = selectionRef.current.projectId !== value.projectId;
      if (
        addHistory &&
        (JSON.stringify(value) !== JSON.stringify(selectionRef.current) ||
          navigationRef.current.mainView !== mainView)
      )
        recordNavigation(value, mainView);
      source.selectProject(value.projectId);
      selectionRef.current = value;
      setSelection(value);
      setError(undefined);
      void load(value, projectChanged);
    },
    [source, load, recordNavigation],
  );
  const switchProject = useCallback(
    (projectId: string) => {
      const current = selectionRef.current;
      if (current.projectId === projectId) return;
      // 项目切换只改变数据范围；不能复用打开需求时强制返回聊天页的导航行为。
      updateReleaseId("");
      select(
        { projectId, ...(current.formalView ? { formalView: "list" as const } : {}) },
        true,
        navigationRef.current.mainView,
      );
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
        if (guardRef.current) guardRef.current(resume);
        else resume();
        return;
      }
      if (guardRef.current && !approvedHistory.current && index !== navigationRef.current.index) {
        historyReturn.current = { delta: index - navigationRef.current.index };
        window.history.go(navigationRef.current.index - index);
        return;
      }
      approvedHistory.current = false;
      const mainView: WorkspaceMainView = [
        "chat",
        "automations",
        "skillDesign",
        "requirementAnalysis",
      ].includes(event.state.aiReqMainView)
        ? event.state.aiReqMainView
        : "chat";
      const next = { index, extent: navigationRef.current.extent, mainView };
      navigationRef.current = next;
      setNavigation(next);
      window.history.replaceState({ ...event.state, aiReqNavigationExtent: next.extent }, "");
      select(event.state.aiReqSelection as AIReqSelection, false, mainView);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, select]);
  const startProposalDraft = useCallback(() => {
    const projectId = selectionRef.current.projectId;
    if (
      !projectId ||
      !releaseId ||
      !source.capabilities.workflowCommands.includes("createProposal")
    )
      return;
    const key = JSON.stringify([sourceScope(source), getEmployeeId(), projectId, releaseId]);
    const target: AIReqSelection = {
      projectId,
      proposalDraftId: key,
      proposalDraftReleaseId: releaseId,
    };
    const current = selectionRef.current;
    if (current.projectId === projectId && current.proposalDraftId === key && !current.irId) return;
    select(target);
  }, [source, releaseId, select]);
  const setReleaseId = useCallback(
    (id: string) => {
      const current = selectionRef.current;
      const data = viewRef.current;
      if (!data?.releases.some((item) => item.id === id && item.projectId === current.projectId))
        return;
      updateReleaseId(id);
      if (current.proposalDraftId && current.projectId) {
        const key = JSON.stringify([sourceScope(source), getEmployeeId(), current.projectId, id]);
        select({ projectId: current.projectId, proposalDraftId: key, proposalDraftReleaseId: id });
        return;
      }
      const next = selectionForRelease(current, data, id);
      if (next !== current) select(next, true, navigationRef.current.mainView);
    },
    [source, select],
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
        if (value.type === "createProposal")
          select({ projectId: result.projectId, irId: result.irId });
        else if (value.type === "runRequirementsReview" || value.type === "submitProposalReview")
          select({
            ...target,
            discussionPhase: "requirements",
            proposalStep: "requirements-review",
            reviewAgent: undefined,
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
        else if (value.type === "deleteRequirement") select({ projectId: target.projectId });
        else await refresh();
        setError(undefined);
        return result;
      } catch (cause) {
        report(cause);
        return undefined;
      }
    },
    [source, refresh, report, select],
  );
  const openFirstDiscussion = useCallback(
    async (_text: string, _options: ConversationComposerSendOptions, preparedSessionId: string) => {
      if (!preparedSessionId.trim()) throw new Error("原生草稿会话尚未就绪，输入未发送");
      if (creatingFirst.current) {
        const session = await creatingFirst.current;
        if (session.sessionId !== preparedSessionId)
          throw new Error("首次发送会话与原生草稿不一致，输入未发送");
        return session;
      }
      const target = selectionRef.current;
      const targetRelease = target.proposalDraftReleaseId ?? releaseId;
      const key =
        target.proposalDraftId ??
        JSON.stringify([sourceScope(source), getEmployeeId(), target.projectId, targetRelease]);
      const create = async () => {
        const result = await source.command(
          {
            type: "createProposal",
            projectId: target.projectId,
            releaseId: targetRelease,
            // 输入槽会反复用于新提案；幂等 ID 必须绑定当前原生草稿，不能永久绑定项目和 Release。
            clientDraftId: JSON.stringify([key, preparedSessionId]),
            // Bug 原因：附件已属于原生预热会话，业务登记不得再分配第二个会话。
            preparedSessionId,
          },
          target,
          viewRef.current?.revision ?? 0,
        );
        if (result.status === "failed") throw new Error(result.error ?? "提案创建失败，输入未发送");
        const created = { projectId: result.projectId, irId: result.irId };
        const next = result.view ?? (await source.readWorkflow(created));
        const session = source.resolveSession(next, created);
        if (!session || !result.projectId || !result.irId)
          throw new Error("需求讨论会话尚未就绪，输入未发送");
        if (session.sessionId !== preparedSessionId)
          throw new Error("需求讨论会话与原生草稿不一致，输入未发送");
        provisional.current.set(key, {
          projectId: result.projectId,
          irId: result.irId,
          sessionId: session.sessionId,
        });
        return session;
      };
      const flight = create();
      creatingFirst.current = flight;
      try {
        return await flight;
      } finally {
        if (creatingFirst.current === flight) creatingFirst.current = null;
      }
    },
    [source, releaseId],
  );
  const finishFirstDiscussion = useCallback(
    (sessionId: string) => {
      const target = selectionRef.current;
      const provisionalTarget =
        target.proposalDraftId && provisional.current.get(target.proposalDraftId);
      if (provisionalTarget && provisionalTarget.sessionId === sessionId) {
        provisional.current.delete(target.proposalDraftId!);
        select({ projectId: provisionalTarget.projectId, irId: provisionalTarget.irId });
      } else void refresh();
    },
    [select, refresh],
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
        select: (value) => navigate(() => select(value)),
        refresh,
        retryMaterial,
        retrySession,
        command,
        report,
        startProposalDraft,
        openFirstDiscussion,
        finishFirstDiscussion,
        setNavigationGuard,
        navigate,
      }}
    >
      {children}
    </AIReqContext.Provider>
  );
}
