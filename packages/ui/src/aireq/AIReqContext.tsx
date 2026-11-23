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
  AIReqWorkflowView,
} from "./contract.js";

import {
  requirementObjectLink,
  restoreNavigationOverlay,
  restoreMainView,
  type AIReqNavigationState,
  type NavigationOverlay,
} from "./navigationState.js";

const AIReqContext = createContext<AIReqContextValue | null>(null);
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
  const releaseRef = useRef("");
  const projectReleasesRef = useRef(new Map<string, string>());
  const resolveRelease = useCallback(
    (projectId: string | undefined, snapshot: AIReqWorkflowView, preferred?: string) => {
      const releases = snapshot.releases.filter((item) => item.projectId === projectId);
      const saved =
        preferred || (projectId ? projectReleasesRef.current.get(projectId) : undefined);
      return (
        releases.find((item) => item.id === saved)?.id ??
        [...releases].sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
        )[0]?.id ??
        ""
      );
    },
    [],
  );
  const recordNavigation = useCallback(
    (
      target: AIReqSelection,
      mainView: WorkspaceMainView,
      overlay: NavigationOverlay = null,
    ) => {
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
          aiReqReleaseId: releaseRef.current,
          aiReqOverlay: overlay,
        },
        "",
        mainView !== "chat"
          ? withoutObjectLink(new URL(window.location.href))
          : requirementObjectLink(window.location.href, target, releaseRef.current),
      );
      navigationRef.current = next;
      setNavigation(next);
    },
    [source, navigationOwner],
  );
  const [view, setView] = useState<AIReqWorkflowView>();
  const [loadedSelection, setLoadedSelection] = useState<AIReqSelection>();
  const viewRef = useRef(view);
  const [error, setError] = useState<string>();
  const [linkError, setLinkError] = useState<"incomplete" | "not-found">();
  const commandError = useRef(false);
  const [pending, setPending] = useState(true);
  const [releaseId, updateReleaseId] = useState("");
  const requestRevision = useRef(0);
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
    async (target: AIReqSelection, throwOnError = false) => {
      const revision = ++requestRevision.current;
      setPending(true);
      try {
        const next = await source.readWorkflow(target);
        if (revision !== requestRevision.current) return;
        viewRef.current = next;
        setView(next);
        // 区分各次导航的读取结果，避免同一对象切换 Agent 时显示旧会话。
        setLoadedSelection(target);
        // 修复：订阅重读不是命令重试，不能抹掉尚未处理的业务提交失败。
        if (!commandError.current) setError(undefined);
        // 旧历史与首次读取也必须落到具体版本；只在当前读取代际接纳后规范范围。
        const resolved = resolveRelease(target.projectId, next, releaseRef.current);
        releaseRef.current = resolved;
        updateReleaseId(resolved);
        if (target.projectId && resolved)
          projectReleasesRef.current.set(target.projectId, resolved);
        window.history.replaceState({ ...window.history.state, aiReqReleaseId: resolved }, "");
      } catch (cause) {
        if (revision === requestRevision.current) report(cause);
        if (throwOnError) throw cause;
      } finally {
        if (revision === requestRevision.current) setPending(false);
      }
    },
    [source, report, resolveRelease],
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
      const previousReleaseId = releaseRef.current;
      const projectChanged = selectionRef.current.projectId !== value.projectId;
      const snapshot = viewRef.current;
      const selectedGroup = snapshot?.requirements.find(
        (item) => item.projectId === value.projectId && item.id === value.irId,
      );
      // 对象所属版本优先；普通切项目恢复该项目选择，不携带旧项目的范围。
      const preferred =
        targetReleaseId ||
        selectedGroup?.releaseId ||
        (!projectChanged ? releaseRef.current : undefined);
      const resolved = snapshot
        ? resolveRelease(value.projectId, snapshot, preferred)
        : (preferred ?? "");
      releaseRef.current = resolved;
      updateReleaseId(resolved);
      if (value.projectId && resolved) projectReleasesRef.current.set(value.projectId, resolved);
      if (
        addHistory &&
        (JSON.stringify(value) !== JSON.stringify(selectionRef.current) ||
          navigationRef.current.mainView !== mainView ||
          previousReleaseId !== releaseRef.current)
      )
        recordNavigation(value, mainView);
      selectionRef.current = value;
      setSelection(value);
      commandError.current = false;
      setError(undefined);
      setLinkError(undefined);
      void load(value);
    },
    [load, recordNavigation, resolveRelease],
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
    select(selectionFromObjectLink(link), true, "chat", link.releaseId);
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
          aiReqReleaseId: releaseRef.current,
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
          const current = {
            ...navigationRef.current,
            index: 0,
            extent: 0,
          };
          navigationRef.current = current;
          setNavigation(current);
          window.history.replaceState(
            {
              ...event.state,
              aiReqSelection: selectionRef.current,
              aiReqBackendId: sourceScope(source),
              aiReqNavigationOwner: navigationOwner,
              aiReqNavigationIndex: 0,
              aiReqNavigationExtent: 0,
              aiReqMainView: current.mainView,
              aiReqReleaseId: releaseRef.current,
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
      const nextRelease =
        typeof event.state.aiReqReleaseId === "string" ? event.state.aiReqReleaseId : "";
      const overlay = restoreNavigationOverlay(event.state.aiReqOverlay);
      const previous = navigationRef.current;
      const savedTarget = event.state.aiReqSelection as AIReqSelection;
      const currentTarget = selectionRef.current;
      // 设置返回同一范围时沿用已读选择，避免重读期间卸载「配置 Release」入口而丢失焦点。
      const target =
        previous.overlay?.kind === "settings" &&
        !overlay &&
        previous.mainView === mainView &&
        releaseRef.current === nextRelease &&
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
      window.history.replaceState(
        { ...event.state, aiReqNavigationExtent: next.extent, aiReqReleaseId: nextRelease },
        "",
      );
      releaseRef.current = nextRelease;
      updateReleaseId(nextRelease);
      select(target, false, mainView, nextRelease);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, select, navigate, navigationOwner]);
  const startProposalDraft = useCallback(() => {
    navigate(() => {
      const draft = { id: createUuid() };
      // 新增弹窗此前只入栈页面而未记录弹窗，浏览器后退会留在原遮罩中。
      recordNavigation(selectionRef.current, "proposals", { kind: "proposal", draft });
    });
  }, [navigate, recordNavigation]);
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
  const completeProposalDraft = useCallback(
    (releaseId: string) => {
      const current = navigationRef.current;
      const overlay = current.overlay;
      if (overlay?.kind !== "proposal") return;
      if (releaseId === releaseRef.current) {
        closeOverlay();
        return;
      }
      // 成功回执才接纳目标版本。替换表单历史槽，后退回原页面而不是已经提交的表单。
      const target = { projectId: selectionRef.current.projectId };
      const next = {
        ...current,
        overlay: null,
      };
      navigationRef.current = next;
      setNavigation(next);
      window.history.replaceState(
        {
          ...window.history.state,
          aiReqSelection: target,
          aiReqReleaseId: releaseId,
          aiReqOverlay: null,
        },
        "",
      );
      select(target, false, "proposals", releaseId);
    },
    [closeOverlay, select],
  );
  const setReleaseId = useCallback(
    (id: string) => {
      const current = selectionRef.current;
      if (id === releaseRef.current) return;
      if (
        !id ||
        !viewRef.current?.releases.some(
          (item) => item.id === id && item.projectId === current.projectId,
        )
      )
        return;
      releaseRef.current = id;
      updateReleaseId(id);
      if (current.projectId) projectReleasesRef.current.set(current.projectId, id);
      const target = { projectId: current.projectId };
      const mainView =
        navigationRef.current.mainView === "chat" ? "proposals" : navigationRef.current.mainView;
      recordNavigation(target, mainView);
      select(target, false, mainView);
    },
    [select, recordNavigation],
  );
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
        if (
          value.type === "deleteRequirement" &&
          target.irId === value.irId &&
          target.projectId === value.projectId
        )
          select({ projectId: target.projectId }, true, "proposals");
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
        selectionReady: Boolean(view && loadedSelection === selection),
        mainView: navigation.mainView,
        settingsOpen: navigation.overlay?.kind === "settings",
        openSettings,
        closeSettings: closeOverlay,
        setMainView,
        error,
        linkError: linkError
          ? linkError === "incomplete"
            ? locale === "zh-CN"
              ? "需求链接无效：缺少项目、Release 或需求标识。"
              : "Invalid requirement link: the project, Release, or requirement identifier is missing."
            : locale === "zh-CN"
              ? "需求链接无效或目标已不存在，请核对项目、Release 和需求归属。"
              : "The requirement link is invalid or the target no longer exists. Check the project, Release, and requirement."
          : undefined,
        clearLinkError: () => setLinkError(undefined),
        releaseId,
        setReleaseId,
        switchProject,
        openProject: (projectId, releaseId) => navigate(() => openProject(projectId, releaseId)),
        select: (value, targetReleaseId) =>
          navigate(() => select(value, true, "chat", targetReleaseId)),
        refresh,
        retrySession,
        command,
        report,
        startProposalDraft,
        proposalDraft: navigation.overlay?.kind === "proposal" ? navigation.overlay.draft : null,
        closeProposalDraft: closeOverlay,
        completeProposalDraft,
        setDraftNavigationGuard,
        setNavigationGuard,
        navigate,
      }}
    >
      {children}
    </AIReqContext.Provider>
  );
}
