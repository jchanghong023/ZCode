import {
  readObjectLink,
  resolveObjectLink,
  selectionFromObjectLink,
  withoutObjectLink,
} from "./proposalRoutes.js";
export { clearAIReqObjectLink } from "./proposalRoutes.js";
import type { AIReqContextValue } from "./context-types.js";
export type { AIReqContextValue } from "./context-types.js";
import { useAIReqNavigationActions } from "./shell/useAIReqNavigationActions.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type {
  AIReqAction,
  AIReqDataSource,
  AIReqSelection,
  AIReqRequirementListSyncReceipt,
  AIReqWorkflowView,
} from "./contract.js";

import {
  EMPTY_PROPOSAL_QUERY,
  requirementObjectLink,
  requirementScopeFallback,
  restoreNavigationOverlay,
  restoreMainView,
  type AIReqNavigationState,
  type AIReqProposalQuery,
  type NavigationOverlay,
} from "./navigationState.js";

const AIReqContext = createContext<AIReqContextValue | null>(null);
type PageActionState = { status: "pending" | "succeeded" } | { status: "failed"; cause: unknown };
type SyncState =
  | { status: "pending" }
  | { status: "failed"; cause: unknown }
  | { status: "succeeded"; receipt: AIReqRequirementListSyncReceipt };
const ProposalPageActionsContext = createContext<{
  projectRefresh?: PageActionState;
  redSync?: SyncState;
  syncRequirementList(): Promise<void>;
} | null>(null);
export const useAIReqProposalPageActions = () => useContext(ProposalPageActionsContext);

function sourceScope(source: AIReqDataSource): string {
  return JSON.stringify([source.backend?.id ?? "aireq", source.clientId, getEmployeeId()]);
}
export const useAIReq = () => useContext(AIReqContext);

/** One UI state controller; the entry point owns data and execution authority. */
export function AIReqProvider({ children }: { children: ReactNode }) {
  const source = useAIReqDataSource();
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const { locale } = useZCodeIntl();
  const [navigationOwner] = useState(() => createUuid());
  const initialLink = useRef(readObjectLink());
  const pendingObjectLink = useRef(initialLink.current);
  // 修复：仅显式分享链接可越过默认总览，普通登录不恢复前一工号的页面。
  const [selection, setSelection] = useState<AIReqSelection>(() => ({
    projectId:
      initialLink.current && initialLink.current !== "invalid"
        ? initialLink.current.projectId
        : source.initialProjectId,
  }));
  const selectionRef = useRef(selection);
  const [navigation, setNavigation] = useState<AIReqNavigationState>(() => ({
    index: 0,
    extent: 0,
    mainView: "projectProgress",
    overlay: null,
  }));
  const navigationRef = useRef(navigation);
  const historyInitialized = useRef(false);
  const proposalQueries = useRef(new Map<number, AIReqProposalQuery>());
  const [proposalQuery, setProposalQuery] = useState(EMPTY_PROPOSAL_QUERY);
  const updateProposalQuery = useCallback(
    (update: (current: AIReqProposalQuery) => AIReqProposalQuery) => {
      const { index, mainView, overlay } = navigationRef.current;
      if (mainView !== "proposals" || overlay) return;
      const next = update(proposalQueries.current.get(index) ?? EMPTY_PROPOSAL_QUERY);
      proposalQueries.current.set(index, next);
      setProposalQuery(next);
    },
    [],
  );
  const recordNavigation = useCallback(
    (target: AIReqSelection, mainView: WorkspaceMainView, overlay: NavigationOverlay = null) => {
      const previous = navigationRef.current;
      const next = {
        index: previous.index + 1,
        extent: previous.index + 1,
        mainView,
        overlay,
      };
      window.history.pushState(
        {
          ...window.history.state,
          aiReqSelection: target,
          aiReqBackendId: sourceScope(source),
          aiReqNavigationOwner: navigationOwner,
          aiReqNavigationIndex: next.index,
          aiReqNavigationExtent: next.extent,
          aiReqMainView: mainView,
          aiReqOverlay: overlay,
        },
        "",
        mainView !== "chat"
          ? withoutObjectLink(new URL(window.location.href))
          : requirementObjectLink(window.location.href, target, target.releaseId),
      );
      navigationRef.current = next;
      setNavigation(next);
      // 后退后另开页面时，浏览器会丢弃前进路径；历史索引可能被新页面复用。
      if (previous.index < previous.extent) {
        for (const index of proposalQueries.current.keys()) {
          if (index >= next.index) proposalQueries.current.delete(index);
        }
      }
      const current = selectionRef.current;
      const savedQuery =
        target.projectId && target.projectId === current.projectId
          ? proposalQueries.current.get(previous.index)
          : undefined;
      if (savedQuery) proposalQueries.current.set(next.index, savedQuery);
      setProposalQuery(savedQuery ?? EMPTY_PROPOSAL_QUERY);
    },
    [source, navigationOwner],
  );
  const replaceScopeInCurrentSlot = useCallback(
    (target: AIReqSelection, { index, mainView }: AIReqNavigationState) => {
      const saved = window.history.state;
      if (saved?.aiReqNavigationOwner !== navigationOwner || saved.aiReqNavigationIndex !== index)
        return;
      if (
        saved.aiReqMainView === mainView &&
        JSON.stringify(saved.aiReqSelection) === JSON.stringify(target)
      )
        return;
      window.history.replaceState(
        { ...saved, aiReqSelection: target, aiReqMainView: mainView },
        "",
        mainView === "chat"
          ? requirementObjectLink(window.location.href, target, target.releaseId)
          : withoutObjectLink(new URL(window.location.href)),
      );
    },
    [navigationOwner],
  );
  const [view, setView] = useState<AIReqWorkflowView>();
  const [loadedSelection, setLoadedSelection] = useState<AIReqSelection>();
  const viewRef = useRef(view);
  const [error, setError] = useState<string>();
  const [linkError, setLinkError] = useState<"incomplete" | "not-found">();
  const commandError = useRef(false);
  const [pending, setPending] = useState(true);
  const requestRevision = useRef(0);
  const [projectRefresh, setProjectRefresh] = useState<PageActionState>();
  const [redSync, setRedSync] = useState<SyncState>();
  const projectRefreshFlight = useRef<Promise<void> | undefined>(undefined);
  const redSyncInFlight = useRef(false);
  const draftGuardRef = useRef<((navigate: () => void) => void) | null>(null);
  const draftGuards = useRef(new Map<string, (navigate: () => void) => void>());
  const guardRef = useRef<((navigate: () => void) => void) | null>(null);
  const historyReturn = useRef<{ delta: number } | null>(null);
  const approvedHistory = useRef(false);
  const closingOverlay = useRef(false);
  const setNavigationGuard = useCallback((guard: ((navigate: () => void) => void) | null) => {
    guardRef.current = guard;
  }, []);
  const setDraftNavigationGuard = useCallback(
    (guard: ((navigate: () => void) => void) | null, ownerId = "primary") => {
      if (guard) draftGuards.current.set(ownerId, guard);
      else draftGuards.current.delete(ownerId);
      const guards = [...draftGuards.current.values()];
      // 主区与各详情 Tab 独立注册；一个表单卸载不能清除其他表单的未保存门禁。
      draftGuardRef.current = guards.length
        ? (action) => {
            const run = (index: number) => {
              if (index === guards.length) action();
              else guards[index]!(() => run(index + 1));
            };
            run(0);
          }
        : null;
    },
    [],
  );
  const navigate = useCallback((action: () => void) => {
    // 用户已主动导航时，不能让迟到的链接解析再覆盖其选择。
    pendingObjectLink.current = null;
    const next = () => {
      if (draftGuardRef.current) draftGuardRef.current(action);
      else action();
    };
    if (guardRef.current) guardRef.current(next);
    else next();
  }, []);
  const report = useCallback(
    (cause: unknown) => setError(formatUserFacingError(cause, "操作暂时未能完成，请重试。")),
    [],
  );
  const load = useCallback(
    async (target: AIReqSelection, throwOnError = false, refreshProjects = false) => {
      const revision = ++requestRevision.current;
      setPending(true);
      try {
        const next = await (refreshProjects
          ? source.refreshProjects(target)
          : source.readWorkflow(target));
        if (revision !== requestRevision.current) return;
        // 初次解析显式分享链接保留原目标及错误；普通范围则和新目录一起提交。
        const fallback = pendingObjectLink.current
          ? undefined
          : requirementScopeFallback(target, next);
        if (fallback) {
          const current = { ...navigationRef.current, mainView: fallback.mainView };
          navigationRef.current = current;
          selectionRef.current = fallback.selection;
          // 修正原历史槽，后退不会撞上另一个由回退生成的无效入口。
          replaceScopeInCurrentSlot(fallback.selection, current);
          setNavigation(current);
          setSelection(fallback.selection);
          if (!fallback.selection.projectId) {
            proposalQueries.current.delete(current.index);
            setProposalQuery(EMPTY_PROPOSAL_QUERY);
          }
        }
        viewRef.current = next;
        setView(next);
        // 区分各次导航的读取结果，避免同一对象切换 Agent 时显示旧会话。
        setLoadedSelection(fallback?.selection ?? target);
        // 修复：订阅重读不是命令重试，不能抹掉尚未处理的业务提交失败。
        if (!commandError.current) setError(undefined);
      } catch (cause) {
        if (!refreshProjects && revision === requestRevision.current) report(cause);
        if (throwOnError) throw cause;
      } finally {
        if (revision === requestRevision.current) setPending(false);
      }
    },
    [source, report, replaceScopeInCurrentSlot],
  );
  const refresh = useCallback(
    (throwOnError = false) => load(selectionRef.current, throwOnError),
    [load],
  );
  const refreshProjects = useCallback(
    async (throwOnError = false) => {
      let flight = projectRefreshFlight.current;
      if (!flight) {
        // 刷新按登录页而非发起时的范围结算，即使本次读取已被新范围或通知取代。
        setProjectRefresh({ status: "pending" });
        flight = load(selectionRef.current, true, true)
          .then(
            () => setProjectRefresh({ status: "succeeded" }),
            (cause: unknown) => {
              setProjectRefresh({ status: "failed", cause });
              if (navigationRef.current.mainView !== "proposals") report(cause);
              throw cause;
            },
          )
          .finally(() => {
            projectRefreshFlight.current = undefined;
          });
        projectRefreshFlight.current = flight;
      }
      try {
        await flight;
      } catch (cause) {
        if (throwOnError) throw cause;
      }
    },
    [load, report],
  );
  const syncRequirementList = useCallback(async () => {
    if (redSyncInFlight.current || projectRefreshFlight.current) return;
    redSyncInFlight.current = true;
    // 列表按项目重挂载，但全量同步的忙态与失败属于同一登录页。
    setRedSync({ status: "pending" });
    try {
      const receipt = await source.syncRequirementList();
      setRedSync({ status: "succeeded", receipt });
    } catch (cause) {
      setRedSync({ status: "failed", cause });
    } finally {
      redSyncInFlight.current = false;
    }
  }, [source]);
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
      const current = selectionRef.current;
      const reuseProjectRequirements =
        mainView === "proposals" &&
        navigationRef.current.mainView === "proposals" &&
        Boolean(value.projectId) &&
        value.projectId === current.projectId &&
        !current.irId &&
        !value.irId &&
        loadedSelection === current &&
        !pending &&
        viewRef.current !== undefined &&
        !requirementScopeFallback(value, viewRef.current) &&
        !error;
      if (
        addHistory &&
        (JSON.stringify(value) !== JSON.stringify(current) ||
          navigationRef.current.mainView !== mainView)
      )
        recordNavigation(value, mainView);
      selectionRef.current = value;
      setSelection(value);
      commandError.current = false;
      setError(undefined);
      setLinkError(undefined);
      if (reuseProjectRequirements) setLoadedSelection(value);
      else void load(value);
    },
    [error, load, loadedSelection, pending, recordNavigation],
  );
  const { setMainView, openProject, switchProject } = useAIReqNavigationActions({
    navigationRef,
    selectionRef,
    viewRef,
    select,
  });
  useEffect(() => {
    const link = pendingObjectLink.current;
    if (!link || !view || !loadedSelection) return;
    pendingObjectLink.current = null;
    if (link === "invalid") {
      // 链接归属错误不是数据读取失败，不能让总览误报已有快照过期。
      setLinkError("incomplete");
      return;
    }
    if (loadedSelection.projectId !== link.projectId) return;
    const resolved = resolveObjectLink(link, view);
    if (!resolved) {
      setLinkError("not-found");
      return;
    }
    const releaseId = link.releaseId
      ? view.requirements.find((item) => item.projectId === link.projectId && item.id === link.irId)
          ?.releaseId || undefined
      : undefined;
    select({ ...selectionFromObjectLink(link), releaseId }, true, "chat");
  }, [view, loadedSelection, select]);
  useEffect(() => {
    if (!historyInitialized.current) {
      // 重连会更换 source；不能再次初始化历史并抹掉当前覆盖层或对象 URL。
      window.history.replaceState(
        {
          ...window.history.state,
          aiReqSelection: selectionRef.current,
          aiReqBackendId: sourceScope(source),
          aiReqNavigationOwner: navigationOwner,
          aiReqNavigationIndex: navigationRef.current.index,
          aiReqNavigationExtent: navigationRef.current.extent,
          aiReqMainView: navigationRef.current.mainView,
          aiReqOverlay: navigationRef.current.overlay,
        },
        "",
        initialLink.current ? withoutObjectLink(new URL(window.location.href)) : undefined,
      );
      historyInitialized.current = true;
    }
    const restore = (event: PopStateEvent) => {
      closingOverlay.current = false;
      if (
        event.state?.aiReqBackendId !== sourceScope(source) ||
        event.state?.aiReqNavigationOwner !== navigationOwner
      ) {
        if (typeof event.state?.aiReqBackendId === "string") {
          // 修复：旧身份历史槽仅清 URL 会让当前身份的后退落入无效槽；以当前视图重建基点。
          const savedQuery = proposalQueries.current.get(navigationRef.current.index);
          const current = {
            ...navigationRef.current,
            index: 0,
            extent: 0,
          };
          navigationRef.current = current;
          setNavigation(current);
          proposalQueries.current.clear();
          if (savedQuery) proposalQueries.current.set(0, savedQuery);
          setProposalQuery(savedQuery ?? EMPTY_PROPOSAL_QUERY);
          window.history.replaceState(
            {
              ...event.state,
              aiReqSelection: selectionRef.current,
              aiReqBackendId: sourceScope(source),
              aiReqNavigationOwner: navigationOwner,
              aiReqNavigationIndex: 0,
              aiReqNavigationExtent: 0,
              aiReqMainView: current.mainView,
              aiReqOverlay: current.overlay,
            },
            "",
            withoutObjectLink(new URL(window.location.href)),
          );
        }
        return;
      }
      if (!event.state?.aiReqSelection) return;
      const index = Number.isSafeInteger(event.state.aiReqNavigationIndex)
        ? event.state.aiReqNavigationIndex
        : 0;
      // 浏览器后退先回到原历史槽，再走设置门禁；取消不能改变当前对象。
      if (historyReturn.current) {
        const { delta } = historyReturn.current;
        // 目录可能在浏览器暂处目标槽时返回；回到原槽再补写纠正后的范围。
        replaceScopeInCurrentSlot(selectionRef.current, navigationRef.current);
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
      const mainView = restoreMainView(event.state.aiReqMainView);
      const overlay = restoreNavigationOverlay(event.state.aiReqOverlay);
      const previous = navigationRef.current;
      const savedTarget = event.state.aiReqSelection as AIReqSelection;
      const currentTarget = selectionRef.current;
      // 设置返回同一项目时沿用已读选择，保留打开设置入口的焦点。
      const target =
        previous.overlay?.kind === "settings" &&
        !overlay &&
        previous.mainView === mainView &&
        JSON.stringify(currentTarget) === JSON.stringify(savedTarget)
          ? currentTarget
          : savedTarget;
      const next = {
        index,
        extent: previous.extent,
        mainView,
        overlay,
      };
      navigationRef.current = next;
      setNavigation(next);
      // 即使两个槽共享同一个查询，也要通知仍挂载的列表重置页码。
      setProposalQuery({ ...(proposalQueries.current.get(index) ?? EMPTY_PROPOSAL_QUERY) });
      window.history.replaceState({ ...event.state, aiReqNavigationExtent: next.extent }, "");
      select(target, false, mainView);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, select, navigate, navigationOwner, replaceScopeInCurrentSlot]);
  const openSettings = useCallback(() => {
    if (navigationRef.current.overlay?.kind === "settings") return;
    // 设置覆盖层参与同一历史，避免后退时在不可见工作区导航。
    recordNavigation(selectionRef.current, navigationRef.current.mainView, { kind: "settings" });
  }, [recordNavigation]);
  const closeOverlay = useCallback(() => {
    if (!navigationRef.current.overlay || closingOverlay.current) return;
    if (navigationRef.current.index === 0) {
      // 历史跨身份重置后覆盖层可能成为当前基点；关闭只替换该槽，不访问旧身份历史。
      const current = { ...navigationRef.current, overlay: null };
      navigationRef.current = current;
      setNavigation(current);
      window.history.replaceState({ ...window.history.state, aiReqOverlay: null }, "");
      return;
    }
    // 调用方已经通过原有离开门禁，避免关闭时二次提示或成功保存后误报未保存。
    approvedHistory.current = true;
    closingOverlay.current = true;
    window.history.back();
  }, []);
  const retrySession = useCallback(
    async (target: AIReqSelection, sessionId: string, isCurrentPane: () => boolean) => {
      const isCurrent = () =>
        isCurrentPane() &&
        sourceRef.current === source &&
        selectionRef.current === target &&
        Boolean(
          viewRef.current &&
          source.resolveSession(viewRef.current, target)?.sessionId === sessionId,
        );
      if (!isCurrent()) throw new Error("会话已切换，请在当前会话中重试。");
      try {
        await source.retrySession(target, sessionId);
        if (!isCurrent()) throw new Error("会话已切换，请在当前会话中重试。");
        await load(target, true);
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
        if (result.receipt.status === "failed")
          // 业务回执的错误字段由服务边界校验；保留可操作原因，未知异常走统一回退。
          throw Object.assign(new Error(result.receipt.error ?? "操作失败。"), {
            code: "BUSINESS_RULE_VIOLATION",
          });
        // An operation completing in the background must not navigate a different view.
        if (selectionRef.current !== target) return result;
        commandError.current = false;
        await refresh();
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
    [source, refresh, report],
  );
  return (
    <AIReqContext.Provider
      value={{
        view,
        selection,
        session: view && source.resolveSession(view, selection),
        pending,
        selectionReady: Boolean(view && loadedSelection === selection),
        mainView: navigation.mainView,
        proposalQuery,
        updateProposalQuery,
        settingsOpen: navigation.overlay?.kind === "settings",
        openSettings,
        closeSettings: closeOverlay,
        setMainView,
        error,
        linkError: linkError
          ? linkError === "incomplete"
            ? locale === "zh-CN"
              ? "需求链接无效：缺少项目或需求标识。"
              : "Invalid requirement link: the project or requirement identifier is missing."
            : locale === "zh-CN"
              ? "需求链接无效或目标已不存在，请核对项目和需求归属。"
              : "The requirement link is invalid or the target no longer exists. Check the project and requirement."
          : undefined,
        clearLinkError: () => setLinkError(undefined),
        switchProject,
        openProject: (projectId, releaseId, query) =>
          navigate(() => {
            // 筛选写入已接纳的目标历史槽，取消离开时不能改动原查询。
            if (openProject(projectId, releaseId) && query) updateProposalQuery(() => query);
          }),
        select: (value) =>
          navigate(() => {
            const current = selectionRef.current;
            const releaseId = value.projectId === current.projectId ? current.releaseId : undefined;
            select({ ...value, releaseId }, true, "chat");
          }),
        refresh,
        refreshProjects,
        retrySession,
        command,
        report,
        setDraftNavigationGuard,
        setNavigationGuard,
        navigate,
      }}
    >
      <ProposalPageActionsContext.Provider value={{ projectRefresh, redSync, syncRequirementList }}>
        {children}
      </ProposalPageActionsContext.Provider>
    </AIReqContext.Provider>
  );
}
