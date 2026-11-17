import type { AIReqContextValue } from "./context-types.js";
export type { AIReqContextValue } from "./context-types.js";
import {
  useAIReqNavigationActions,
  type ProjectOverviewOrigin,
} from "./shell/useAIReqNavigationActions.js";
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
  captureRequirementReturnView,
  restoreRequirementReturnView,
  restoreNavigationOverlay,
  restoreMainView,
  type AIReqNavigationState,
  type NavigationOverlay,
  type RequirementView,
} from "./navigationState.js";

export function aiReqQuery(selection: AIReqSelection): string {
  const query = new URLSearchParams();
  for (const key of ["projectId", "irId", "srId"] as const)
    if (selection[key]) query.set(key, selection[key]!);
  return query.toString();
}

type ObjectLink = { projectId: string; releaseId: string; irId: string; srId?: string };
const objectLinkKeys = ["aireqProject", "aireqRelease", "aireqIr", "aireqSr"] as const;

function readObjectLink(): ObjectLink | "invalid" | null {
  const query = new URLSearchParams(window.location.search);
  if (!objectLinkKeys.some((key) => query.has(key))) return null;
  const [projectId, releaseId, irId, srId] = objectLinkKeys.map((key) => query.get(key)?.trim());
  if (!projectId || !releaseId || !irId || (query.has("aireqSr") && !srId)) return "invalid";
  return { projectId, releaseId, irId, ...(srId ? { srId } : {}) };
}

function withoutObjectLink(url: URL) {
  objectLinkKeys.forEach((key) => url.searchParams.delete(key));
  return url;
}

export function clearAIReqObjectLink() {
  const url = withoutObjectLink(new URL(window.location.href));
  window.history.replaceState(window.history.state, "", url);
}
const AIReqContext = createContext<AIReqContextValue | null>(null);
function sourceScope(source: AIReqDataSource): string {
  return JSON.stringify([source.backend?.id ?? "aireq", source.clientId, getEmployeeId()]);
}
export const useAIReq = () => useContext(AIReqContext);

/** 详情消费显式目标的读取投影，不创建第二个主区导航或业务 owner。 */
export function AIReqContextProjection({
  value,
  children,
}: {
  value: AIReqContextValue;
  children: ReactNode;
}) {
  return <AIReqContext.Provider value={value}>{children}</AIReqContext.Provider>;
}

/** One UI state controller; the entry point owns data and execution authority. */
export function AIReqProvider({ children }: { children: ReactNode }) {
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const [navigationOwner] = useState(() => createUuid());
  const initialLink = useRef(readObjectLink());
  const initialLinkUrl = useRef(window.location.href);
  const pendingObjectLink = useRef(initialLink.current);
  // 修复：仅显式分享链接可越过默认总览，普通登录不恢复前一工号的页面。
  const [selection, setSelection] = useState<AIReqSelection>(() => ({
    projectId:
      initialLink.current && initialLink.current !== "invalid"
        ? initialLink.current.projectId
        : source.initialSelection.projectId,
  }));
  const selectionRef = useRef(selection);
  const [navigation, setNavigation] = useState<AIReqNavigationState>(() => ({
    index: 0,
    extent: 0,
    mainView: "projectProgress",
    requirementView: "formal",
    requirementReturnView: null,
    overlay: null,
  }));
  const navigationRef = useRef(navigation);
  const historyInitialized = useRef(false);
  const releaseRef = useRef("");
  const projectReleasesRef = useRef(new Map<string, string>());
  const resolveRelease = useCallback(
    (projectId: string | undefined, snapshot: AIReqWorkflowView, preferred?: string) => {
      const releases = snapshot.availableReleases.filter((item) => item.projectId === projectId);
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
      requirementView: RequirementView = navigationRef.current.requirementView,
      overviewOrigin?: ProjectOverviewOrigin | null,
    ) => {
      const previous = navigationRef.current;
      // 返回来源属于同一导航 owner；详情内切阶段／设置不能覆盖首次进入来源。
      const requirementReturnView = captureRequirementReturnView(previous, mainView);
      const candidate = overviewOrigin === undefined ? previous.overviewOrigin : overviewOrigin;
      // 来源只描述当前范围的浏览路径；切范围或回到概览后不能沿用旧来源。
      const origin =
        mainView !== "projectOverview" &&
        candidate?.projectId === target.projectId &&
        candidate?.releaseId === releaseRef.current
          ? (candidate ?? undefined)
          : undefined;
      const next = {
        index: previous.index + 1,
        extent: previous.index + 1,
        mainView,
        requirementView,
        requirementReturnView,
        overlay,
        overviewOrigin: origin,
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
          aiReqRequirementView: requirementView,
          aiReqRequirementReturnView: requirementReturnView,
          aiReqOverlay: overlay,
          aiReqOverviewOrigin: origin ?? null,
        },
        "",
        withoutObjectLink(new URL(window.location.href)),
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
      overviewOrigin?: ProjectOverviewOrigin | null,
    ) => {
      const previousReleaseId = releaseRef.current;
      const projectChanged = selectionRef.current.projectId !== value.projectId;
      const snapshot = viewRef.current;
      const selectedGroup = [...(snapshot?.drafts ?? []), ...(snapshot?.groups ?? [])].find(
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
      const requirementView: RequirementView =
        mainView === "proposals"
          ? "proposals"
          : mainView === "formal"
            ? "formal"
            : mainView === "chat"
              ? value.formalView ||
                viewRef.current?.groups.some(
                  (item) => item.projectId === value.projectId && item.id === value.irId,
                )
                ? "formal"
                : "proposals"
              : navigationRef.current.requirementView;
      if (
        addHistory &&
        (JSON.stringify(value) !== JSON.stringify(selectionRef.current) ||
          navigationRef.current.mainView !== mainView ||
          previousReleaseId !== releaseRef.current ||
          overviewOrigin !== undefined)
      )
        recordNavigation(value, mainView, null, requirementView, overviewOrigin);
      source.selectProject(value.projectId);
      selectionRef.current = value;
      setSelection(value);
      commandError.current = false;
      setError(undefined);
      setLinkError(undefined);
      void load(value, projectChanged);
    },
    [source, load, recordNavigation, resolveRelease],
  );
  const {
    setMainView,
    openFromProjectOverview,
    returnToProjectOverview,
    openProject,
    switchProject,
  } = useAIReqNavigationActions({
    navigationRef,
    selectionRef,
    releaseRef,
    viewRef,
    navigate,
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
    const project = view.projects.find((item) => item.id === link.projectId);
    const release = view.releases.find(
      (item) => item.projectId === link.projectId && item.id === link.releaseId,
    );
    const group = [...view.drafts, ...view.groups].find(
      (item) => item.projectId === link.projectId && item.id === link.irId,
    );
    const sr = link.srId
      ? view.srs.find(
          (item) =>
            item.projectId === link.projectId && item.irId === link.irId && item.id === link.srId,
        )
      : undefined;
    if (!project || !release || !group || group.releaseId !== release.id || (link.srId && !sr)) {
      setLinkError("not-found");
      return;
    }
    // 修复：先按同一项目快照核对归属，再由唯一导航路径定位对象。
    releaseRef.current = link.releaseId;
    updateReleaseId(link.releaseId);
    select(
      { projectId: link.projectId, irId: link.irId, ...(link.srId ? { srId: link.srId } : {}) },
      true,
      "chat",
      link.releaseId,
    );
    window.history.replaceState(window.history.state, "", initialLinkUrl.current);
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
          aiReqRequirementView: navigationRef.current.requirementView,
          aiReqRequirementReturnView: navigationRef.current.requirementReturnView,
          aiReqOverlay: navigationRef.current.overlay,
          aiReqOverviewOrigin: navigationRef.current.overviewOrigin ?? null,
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
            overviewOrigin: undefined,
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
              aiReqRequirementView: current.requirementView,
              aiReqRequirementReturnView: current.requirementReturnView,
              aiReqOverlay: current.overlay,
              aiReqOverviewOrigin: null,
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
      const restoredRelease =
        typeof event.state.aiReqReleaseId === "string" ? event.state.aiReqReleaseId : "";
      const overlay = restoreNavigationOverlay(event.state.aiReqOverlay);
      const requirementView: RequirementView =
        event.state.aiReqRequirementView === "proposals" ? "proposals" : "formal";
      const previous = navigationRef.current;
      // 弹窗内更换版本属于当前表单，不得因关闭弹窗恢复旧的全部 Release。
      const nextRelease =
        (previous.overlay?.kind === "proposal" || previous.overlay?.kind === "proposal-import") &&
        !overlay &&
        mainView === previous.mainView &&
        JSON.stringify(event.state.aiReqSelection) === JSON.stringify(selectionRef.current)
          ? releaseRef.current
          : restoredRelease;
      const requirementReturnView = restoreRequirementReturnView(
        mainView,
        event.state.aiReqRequirementReturnView,
      );
      const savedOrigin = event.state.aiReqOverviewOrigin;
      const overviewOrigin: ProjectOverviewOrigin | undefined =
        mainView !== "projectOverview" &&
        savedOrigin &&
        typeof savedOrigin.projectId === "string" &&
        typeof savedOrigin.releaseId === "string" &&
        savedOrigin.projectId === event.state.aiReqSelection.projectId &&
        savedOrigin.releaseId === nextRelease
          ? { projectId: savedOrigin.projectId, releaseId: savedOrigin.releaseId }
          : undefined;
      const next = {
        index,
        extent: previous.extent,
        mainView,
        requirementView,
        requirementReturnView,
        overlay,
        overviewOrigin,
      };
      navigationRef.current = next;
      setNavigation(next);
      window.history.replaceState(
        { ...event.state, aiReqNavigationExtent: next.extent, aiReqReleaseId: nextRelease },
        "",
      );
      releaseRef.current = nextRelease;
      updateReleaseId(nextRelease);
      select(event.state.aiReqSelection as AIReqSelection, false, mainView, nextRelease);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, select, navigate, navigationOwner]);
  const startProposalDraft = useCallback(
    (sourceIrId?: string) => {
      navigate(() => {
        const draft = { id: createUuid(), sourceIrId };
        // 新增弹窗此前只入栈页面而未记录弹窗，浏览器后退会留在原遮罩中。
        recordNavigation(
          selectionRef.current,
          "proposals",
          { kind: "proposal", draft },
          "proposals",
        );
      });
    },
    [navigate, recordNavigation],
  );
  const startProposalImport = useCallback(() => {
    navigate(() => {
      // 导入弹窗同样进入历史，后退不能仅移动被弹窗遮住的列表。
      recordNavigation(selectionRef.current, "proposals", { kind: "proposal-import" }, "proposals");
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
  const setReleaseId = useCallback(
    (id: string, options?: { inProposalDialog?: boolean }) => {
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
      if (options?.inProposalDialog) {
        // 新增和导入共享此分支；选择版本不离开表单，也不重置输入或预览。
        const next = { ...navigationRef.current, overviewOrigin: undefined };
        navigationRef.current = next;
        setNavigation(next);
        window.history.replaceState(
          { ...window.history.state, aiReqReleaseId: id, aiReqOverviewOrigin: null },
          "",
        );
        return;
      }
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
  const objectLink = useCallback(() => {
    const target = selectionRef.current;
    if (!target.projectId || !target.irId) return undefined;
    const group = [...(viewRef.current?.drafts ?? []), ...(viewRef.current?.groups ?? [])].find(
      (item) => item.projectId === target.projectId && item.id === target.irId,
    );
    if (!group) return undefined;
    const url = withoutObjectLink(new URL(window.location.href));
    url.username = "";
    url.password = "";
    url.hash = "";
    // 未知查询值可能包含敏感信息，分享链接只从当前业务定位事实构造。
    url.search = "";
    url.searchParams.set("aireqProject", target.projectId);
    url.searchParams.set("aireqRelease", group.releaseId);
    url.searchParams.set("aireqIr", target.irId);
    if (target.srId) url.searchParams.set("aireqSr", target.srId);
    return url.toString();
  }, []);
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
          // 业务回执的错误字段由服务边界校验；保留版本、阶段等可操作原因，未知异常走统一回退。
          throw Object.assign(new Error(result.error ?? result.receipt.error ?? "操作失败。"), {
            code: "BUSINESS_RULE_VIOLATION",
          });
        // An operation completing in the background must not navigate a different view.
        if (selectionRef.current !== target) return result;
        commandError.current = false;
        if (value.type === "createProposal" || value.type === "importProposals") await refresh();
        else if (value.type === "runRequirementsReview")
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
        requirementView: navigation.requirementView,
        requirementReturnView: navigation.requirementReturnView,
        settingsOpen: navigation.overlay?.kind === "settings",
        openSettings,
        closeSettings: closeOverlay,
        setMainView,
        openFromProjectOverview,
        returnToProjectOverview,
        canReturnToProjectOverview: Boolean(
          navigation.overviewOrigin &&
          navigation.mainView !== "projectOverview" &&
          navigation.overviewOrigin.projectId === selection.projectId &&
          navigation.overviewOrigin.releaseId === releaseId &&
          view?.availableReleases.some(
            (release) => release.projectId === selection.projectId && release.id === releaseId,
          ),
        ),
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
        openProject: (projectId, mainView, releaseId) =>
          navigate(() => openProject(projectId, mainView, releaseId)),
        select: (value, targetReleaseId) =>
          navigate(() => select(value, true, "chat", targetReleaseId)),
        openAnalysis: (value, targetReleaseId) =>
          navigate(() => select(value, true, "requirementAnalysis", targetReleaseId)),
        objectLink,
        refresh,
        retryMaterial,
        retrySession,
        command,
        report,
        startProposalDraft,
        startProposalImport,
        proposalDraft: navigation.overlay?.kind === "proposal" ? navigation.overlay.draft : null,
        proposalImportOpen: navigation.overlay?.kind === "proposal-import",
        closeProposalDraft: closeOverlay,
        setDraftNavigationGuard,
        setNavigationGuard,
        navigate,
      }}
    >
      {children}
    </AIReqContext.Provider>
  );
}
