import {
  readObjectLink,
  resolveObjectLink,
  withoutObjectLink,
  proposalTaskUrl,
  selectionFromObjectLink,
  formalObjectUrl,
  formalProposalNavigation,
} from "./proposalRoutes.js";
export { clearAIReqObjectLink } from "./proposalRoutes.js";
import {
  proposalTaskFromSelection,
  restoreProposalTask,
  type ProposalTask,
} from "./proposals/proposalTasks.js";
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
  AIReqMaterialReadRequest,
  AIReqWorkflowTarget,
  AIReqWorkflowView,
} from "./contract.js";

import {
  requirementObjectLink,
  captureRequirementReturnView,
  restoreRequirementReturnView,
  restoreNavigationOverlay,
  restoreMainView,
  type AIReqNavigationState,
  type NavigationOverlay,
  type RequirementView,
} from "./navigationState.js";

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
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const { locale } = useZCodeIntl();
  const [navigationOwner] = useState(() => createUuid());
  const initialLink = useRef(readObjectLink());
  const initialLinkUrl = useRef(window.location.href);
  const pendingObjectLink = useRef(initialLink.current);
  // 修复：仅显式分享链接可越过默认总览，普通登录不恢复前一工号的页面。
  const [selection, setSelection] = useState<AIReqWorkflowTarget>(() => ({
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
    requirementView: "formal",
    requirementReturnView: null,
    proposalTask: "overview",
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
      target: AIReqWorkflowTarget,
      mainView: WorkspaceMainView,
      overlay: NavigationOverlay = null,
      requirementView: RequirementView = navigationRef.current.requirementView,
      overviewOrigin?: ProjectOverviewOrigin | null,
      proposalTask: ProposalTask = navigationRef.current.proposalTask,
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
        proposalTask,
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
          aiReqProposalTask: proposalTask,
          aiReqOverlay: overlay,
          aiReqOverviewOrigin: origin ?? null,
        },
        "",
        mainView === "chat" && requirementView === "proposals"
          ? proposalTaskUrl(window.location.href, target, releaseRef.current, proposalTask)
          : withoutObjectLink(new URL(window.location.href)),
      );
      navigationRef.current = next;
      setNavigation(next);
    },
    [source, navigationOwner],
  );
  const [view, setView] = useState<AIReqWorkflowView>();
  const [loadedSelection, setLoadedSelection] = useState<AIReqWorkflowTarget>();
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
    async (target: AIReqWorkflowTarget, throwOnError = false) => {
      const revision = ++requestRevision.current;
      setPending(true);
      try {
        const next = await source.readWorkflow(target);
        if (revision !== requestRevision.current) return;
        viewRef.current = next;
        setView(next);
        // 不同任务可以映射到相同的选择字段，必须区分各次导航的读取结果。
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
      value: AIReqWorkflowTarget,
      addHistory = true,
      mainView: WorkspaceMainView = "chat",
      targetReleaseId?: string,
      overviewOrigin?: ProjectOverviewOrigin | null,
      task?: ProposalTask,
    ) => {
      const proposalTask = task ?? proposalTaskFromSelection(value);
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
          proposalTask !== navigationRef.current.proposalTask ||
          overviewOrigin !== undefined)
      )
        recordNavigation(value, mainView, null, requirementView, overviewOrigin, proposalTask);
      selectionRef.current = value;
      setSelection(value);
      commandError.current = false;
      setError(undefined);
      setLinkError(undefined);
      void load(value);
    },
    [load, recordNavigation, resolveRelease],
  );
  const {
    setMainView,
    openFromProjectOverview,
    returnToProjectOverview,
    openProject,
    switchProject,
    openProposalTask,
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
    const resolved = resolveObjectLink(link, view);
    if (!resolved) {
      setLinkError("not-found");
      return;
    }
    const formal = resolved === "formal";
    // 修复：先按同一项目快照核对归属，再由唯一导航路径定位对象。
    releaseRef.current = link.releaseId;
    updateReleaseId(link.releaseId);
    select(
      selectionFromObjectLink(link, formal),
      true,
      "chat",
      link.releaseId,
      undefined,
      formal ? "overview" : link.task,
    );
    window.history.replaceState(
      window.history.state,
      "",
      formal
        ? formalObjectUrl(
            initialLinkUrl.current,
            selectionFromObjectLink(link, true),
            link.releaseId,
          )
        : initialLinkUrl.current,
    );
  }, [view, loadedSelection, select]);
  useEffect(() => {
    const next = formalProposalNavigation(navigationRef.current, selection, view);
    if (!next) return;
    // 转正属于同一 IR 生命周期：替换当前导航，避免刷新恢复失效的提案任务。
    navigationRef.current = next;
    setNavigation(next);
    window.history.replaceState(
      {
        ...window.history.state,
        aiReqRequirementView: "formal",
        aiReqProposalTask: "overview",
        aiReqRequirementReturnView: null,
      },
      "",
      formalObjectUrl(window.location.href, selection, releaseRef.current),
    );
  }, [selection, view, navigation]);
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
          aiReqProposalTask: navigationRef.current.proposalTask,
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
              aiReqProposalTask: current.proposalTask,
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
      const nextRelease =
        typeof event.state.aiReqReleaseId === "string" ? event.state.aiReqReleaseId : "";
      const overlay = restoreNavigationOverlay(event.state.aiReqOverlay);
      const requirementView: RequirementView =
        event.state.aiReqRequirementView === "proposals" ? "proposals" : "formal";
      const previous = navigationRef.current;
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
        proposalTask: restoreProposalTask(
          event.state.aiReqProposalTask,
          event.state.aiReqSelection,
        ),
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
      select(event.state.aiReqSelection as AIReqWorkflowTarget, false, mainView, nextRelease);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [source, select, navigate, navigationOwner]);
  const startProposalDraft = useCallback(
    (sourceIrId?: string) => {
      navigate(() => {
        const draft = { id: createUuid(), sourceIrId };
        const previousView = navigationRef.current.mainView;
        const { projectId } = selectionRef.current;
        const releaseId = releaseRef.current;
        const overviewOrigin =
          previousView === "projectOverview" && projectId && releaseId
            ? { projectId, releaseId }
            : undefined;
        // 新增弹窗此前只入栈页面而未记录弹窗，浏览器后退会留在原遮罩中。
        recordNavigation(
          selectionRef.current,
          "proposals",
          { kind: "proposal", draft, fromList: previousView === "proposals" },
          "proposals",
          overviewOrigin,
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
  const completeProposalDraft = useCallback(
    (releaseId: string) => {
      const current = navigationRef.current;
      const overlay = current.overlay;
      if (overlay?.kind !== "proposal" && overlay?.kind !== "proposal-import") return;
      const sameRelease = releaseId === releaseRef.current;
      if (sameRelease && (overlay.kind === "proposal-import" || overlay.fromList)) {
        closeOverlay();
        return;
      }
      // 成功回执才接纳目标版本。替换表单历史槽，后退回原页面而不是已经提交的表单。
      const target = { projectId: selectionRef.current.projectId };
      const next = {
        ...current,
        overlay: null,
        overviewOrigin: sameRelease ? current.overviewOrigin : undefined,
      };
      navigationRef.current = next;
      setNavigation(next);
      window.history.replaceState(
        {
          ...window.history.state,
          aiReqSelection: target,
          aiReqReleaseId: releaseId,
          aiReqOverlay: null,
          aiReqOverviewOrigin: next.overviewOrigin ?? null,
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
    return requirementObjectLink(window.location.href, target, group.releaseId);
  }, []);
  const retryMaterial = useCallback(
    async (request: AIReqMaterialReadRequest) => {
      const target = selectionRef.current;
      if (
        target.projectId !== request.projectId ||
        target.irId !== request.irId ||
        releaseRef.current !== request.releaseId
      )
        return false;
      try {
        return await source.retryMaterial(request);
      } catch {
        return false;
      } finally {
        if (selectionRef.current === target && releaseRef.current === request.releaseId)
          await refresh();
      }
    },
    [source, refresh],
  );
  const retrySession = useCallback(
    async (target: AIReqWorkflowTarget, sessionId: string, isCurrentPane: () => boolean) => {
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
          // 业务回执的错误字段由服务边界校验；保留版本、阶段等可操作原因，未知异常走统一回退。
          throw Object.assign(new Error(result.receipt.error ?? "操作失败。"), {
            code: "BUSINESS_RULE_VIOLATION",
          });
        // An operation completing in the background must not navigate a different view.
        if (selectionRef.current !== target) return result;
        commandError.current = false;
        if (value.type === "deleteRequirement")
          select({ projectId: target.projectId }, true, target.formalView ? "formal" : "proposals");
        else if (
          value.type === "submitProposalReview" &&
          result.receipt.status === "completed" &&
          value.projectId === target.projectId && value.irId === target.irId
        ) {
          // 送审会让原澄清页转为只读，当前对象成功后直接接到对应评审汇总。
          openProposalTask(value.kind === "full" ? "solutionReview" : "requirementsReview");
        } else await refresh();
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
    [source, refresh, report, select, openProposalTask],
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
        requirementView: navigation.requirementView,
        requirementReturnView: navigation.requirementReturnView,
        proposalTask: navigation.proposalTask,
        openProposalTask,
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
          view?.releases.some(
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
        select: (value, targetReleaseId, task) =>
          navigate(() => select(value, true, "chat", targetReleaseId, undefined, task)),
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
