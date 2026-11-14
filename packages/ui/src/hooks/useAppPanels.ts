import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";

import { forgetWorkspaceConversation } from "@/v4/workspaceConnectionRegistry.js";
import type { IDisposable } from "@zcode/rpc";
import type {
  IWindowControllerService,
  IZCodeTaskService,
  WindowHostTasksRemovedSignal,
} from "@zcode/services";
import { useOptionalTabStore } from "@/store/TabStoreProvider.js";
import {
  openFileManagerSidePane,
  navigateFileManagerSidePane,
  type FileManagerTarget,
} from "@/lib/workspaceSidePane.js";
/* eslint-disable max-lines */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import {
  buildTaskSidePaneMemoryKey,
  getSidePaneCollapsedPreference,
  readTaskSidePaneMemoryState,
  saveTaskSidePaneCollapsedPreference,
  saveTaskSidePaneMemoryState,
} from "@/lib/taskSidePaneMemory.js";
import {
  ensureSidePaneTab,
  closeSidePaneTab,
  closeSidePaneTabs,
  isSidePaneTabOwnedByTask,
  isSidePaneTabVisibleInScope,
  closeGitSidePane,
  closeCodeViewerSidePane,
  openSubagentSessionSidePane,
  openSubagentDirectorySidePane,
  openSelectionSideChatPane,
  openPlanDetailSidePane,
  openWorkflowRunSidePane,
  replaceWorkflowRunSidePane,
  openWorkflowRunDirectorySidePane,
  openWorkflowActorSessionSidePane,
  openWorkflowWorkspaceSidePane,
  openWorkflowArtifactSidePane,
  activateDeveloperToolsSidePane,
  activateExtensionViewSidePane,
  moveAppScopedExtensionViewTabs,
  activateExtensionLogsSidePane,
  activatePluginMarketSidePane,
  activateNewTabSidePane,
  openCodeViewerSidePane,
  openCodeViewerSidePanes,
  activateGitSidePane,
  getActiveSidePaneTab,
  getVisibleSidePaneTabs,
  reorderSidePaneTab,
  resolveSidePaneScopeState,
  adoptDraftSidePaneTabs,
  restoreSidePaneTab,
  setActiveSidePaneTab,
  syncSubagentSessionSidePaneTabs,
  toggleGitSidePane,
  stampSidePaneTabsOwnership,
  type OpenScopedSubagentSideTabRequest,
  type OpenBackgroundBashSideTabRequest,
  openBackgroundBashSidePane,
  type OpenScopedSubagentDirectorySideTabRequest,
  type OpenSelectionSideChatRequest,
  type OpenScopedPlanDetailSideTabRequest,
  type OpenScopedWorkflowRunSideTabRequest,
  type OpenScopedWorkflowRunDirectorySideTabRequest,
  type OpenScopedWorkflowActorSessionSideTabRequest,
  type OpenScopedWorkflowArtifactSideTabRequest,
  type OpenScopedWorkflowWorkspaceSideTabRequest,
  type WorkspaceSidePaneState,
  type WorkspaceSidePaneTab,
} from "@/lib/workspaceSidePane.js";
import {
  buildPluginUiSidePaneTabId,
  openPluginUiSidePane,
  usePluginUiPaneTarget,
} from "@/plugin-ui/index.js";
import type { OpenPluginUiSideTabRequest } from "@/plugin-ui/contract.js";
import type { ExtensionViewSidePaneTab } from "@/extension-slots/contract.js";
import { buildFileViewerTab, useFileViewerRouter } from "@/extension-slots/index.js";
import {
  matchOfficeViewerSurfaceRoute,
  queueOfficeViewerPendingOpen,
  resolveOfficeViewerDocumentPath,
} from "@/plugin-ui/officeViewerOpen.js";
import { isRemoteWorkspaceIdentity } from "@zcode/shared";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { areWorkspaceFilePathsEqual } from "@/workspace-file-tree/model.js";
import { logger } from "@/logger.js";
import { getPathLeaf } from "@/lib/path.js";
import { useServices } from "@/hooks/useServices.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import { clearSelectionSideChat } from "@/lib/selectionSideChatRuntime.js";
import { clearConversationSelectionReferenceScope } from "@/lib/conversationSelectionReference.js";
import {
  resolveWorkspaceServicesForTarget,
  useBaseWorkspaceServices,
} from "@/hooks/useWorkspaceServices.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";

/**
 * 任务归档或删除后的实时信号。桌面由 Window Host Controller 给出覆盖所有工作区的准确 taskIds；
 * Web 没有 Controller，退回当前工作区的 `task_archived` / `task_deleted` 事件。
 * 永久删除凭据会在监听注册后补发，不能依赖它与列表快照的先后顺序。
 */
function subscribeTasksRemoved(
  params: {
    windowControllerService?: IWindowControllerService;
    zcodeTaskService?: IZCodeTaskService;
    workspacePath: string;
    workspaceIdentity?: string;
  },
  listener: (signal: WindowHostTasksRemovedSignal) => void,
): IDisposable | undefined {
  if (params.windowControllerService) {
    return params.windowControllerService.onDynamicTasksRemovedSignal()(listener);
  }
  return params.zcodeTaskService?.onDynamicWorkspaceEvent({
    workspacePath: params.workspacePath,
    ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
  })((event) => {
    if (
      event.type !== "workspace_task_list_changed" ||
      (event.reason !== "task_archived" && event.reason !== "task_deleted") ||
      !event.taskId
    ) {
      return;
    }
    listener({
      workspacePath: event.workspacePath,
      ...(event.workspaceIdentity ? { workspaceIdentity: event.workspaceIdentity } : {}),
      taskIds: [event.taskId],
    });
  });
}

export interface RecentClosedSidePaneTab {
  tab: WorkspaceSidePaneTab;
  closedAt: number;
}

const RECENT_CLOSED_SIDE_PANE_TAB_LIMIT = 8;

export function useAppPanels(options: {
  workspaceAbsPath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string | null;
  activeTaskId: string | null;
  /** 草稿态与正式任务共用稳定 id，作为侧栏对话隔离边界。 */
  sidePaneOwnerId: string | null;
  /** 展示语义：视图当前是否呈现给用户（设置页覆盖时为 false）；本 hook 不消费它。 */
  isWorkspaceVisible?: boolean;
}) {
  const {
    workspaceAbsPath,
    workspaceIdentity,
    workspaceRemoteSessionId,
    activeTaskId,
    sidePaneOwnerId,
  } = options;
  const activeWorkspaceKey = workspaceIdentity?.trim() || workspaceAbsPath;
  const pluginUiTarget = usePluginUiPaneTarget({
    workspacePath: workspaceAbsPath,
    workspaceIdentity,
    remoteSessionId: workspaceRemoteSessionId ?? undefined,
    sessionId: activeTaskId,
  });
  const pluginUiWorkspaceKey =
    pluginUiTarget.workspaceIdentity?.trim() || pluginUiTarget.workspacePath;
  const pluginUiScopeRef = useRef({
    pluginUiSessionId: pluginUiTarget.sessionId,
    pluginUiWorkspaceKey,
  });
  pluginUiScopeRef.current = { pluginUiSessionId: pluginUiTarget.sessionId, pluginUiWorkspaceKey };
  const services = useServices();
  const { zcodeSessionService } = services;
  // 插件声明的文件查看器（file.viewer）：只在调用时读静态表，不随贡献表增量重渲染。
  const routeFileViewer = useFileViewerRouter({
    workspacePath: workspaceAbsPath,
    ...(workspaceIdentity ? { workspaceIdentity } : {}),
  });
  const optionalPlatform = useOptionalPlatform();
  const { windowControllerService, zcodeTaskService } = useBaseWorkspaceServices();
  const isOfficeMode = useIsOfficeMode();
  const sidePaneMemoryKey = useMemo(
    () =>
      buildTaskSidePaneMemoryKey({
        workspacePath: workspaceAbsPath,
        workspaceIdentity,
        taskId: activeTaskId,
      }),
    [activeTaskId, workspaceAbsPath, workspaceIdentity],
  );
  const initialSidePaneMemoryState = readTaskSidePaneMemoryState(sidePaneMemoryKey);

  // 修复说明：右侧共享面板（code-viewer）需要默认关闭。
  // 否则一进工作区就会先占住主会话空间，和"只在用户主动查看时再展开"的预期相反。
  const [sidePaneState, setSidePaneState] = useState<WorkspaceSidePaneState | null>(
    initialSidePaneMemoryState.sidePaneState,
  );
  const [isSidePaneCollapsed, setIsSidePaneCollapsedState] = useState(
    getSidePaneCollapsedPreference(initialSidePaneMemoryState, sidePaneOwnerId) ??
      initialSidePaneMemoryState.isSidePaneCollapsed,
  );
  // 交互说明：侧栏显隐按钮放在 App 外层，而不是 Sidebar 内部。
  // 这样即使侧栏被隐藏，入口也仍然留在左上角，不会出现"收起后没有地方再展开"的问题；
  // 同时这里统一处理 macOS 红绿灯安全区，避免按钮和系统窗口控件重叠。
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [allRecentClosedSidePaneTabs, setAllRecentClosedSidePaneTabs] = useState<
    RecentClosedSidePaneTab[]
  >([]);
  const lastActiveSubagentTabByRootRef = useRef<Map<string, string>>(new Map());
  const sidePaneOwnerIdRef = useRef(sidePaneOwnerId);
  sidePaneOwnerIdRef.current = sidePaneOwnerId;
  const activeWorkspaceKeyRef = useRef(activeWorkspaceKey);
  activeWorkspaceKeyRef.current = activeWorkspaceKey;
  const activeTabByOwnerRef = useRef<Map<string, string>>(new Map());
  const pendingDraftPromotionRef = useRef<string | null>(null);
  const hasSyncedSidePaneScopeRef = useRef(false);
  const previousSidePaneScopeRef = useRef({
    workspaceKey: activeWorkspaceKey,
    ownerTaskId: sidePaneOwnerId,
  });
  const activeSidePaneMemoryKeyRef = useRef<string | null>(sidePaneMemoryKey);
  const latestSidePaneMemoryRef = useRef({
    sidePaneState,
    isSidePaneCollapsed,
  });
  latestSidePaneMemoryRef.current = {
    sidePaneState,
    isSidePaneCollapsed,
  };

  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    mountedRef.current = true;
    // 关闭等异步操作可能晚于 App 重挂；同步撤销旧实例，避免旧快照覆盖新实例的标签和折叠态。
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 折叠态参与同一批事件的后续决策，统一同步 ref，避免 React 提交前读到旧值。
  const setIsSidePaneCollapsed = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    if (!mountedRef.current) return;
    const next =
      typeof value === "function"
        ? value(latestSidePaneMemoryRef.current.isSidePaneCollapsed)
        : value;
    latestSidePaneMemoryRef.current.isSidePaneCollapsed = next;
    saveTaskSidePaneMemoryState(activeSidePaneMemoryKeyRef.current, {
      isSidePaneCollapsed: next,
    });
    setIsSidePaneCollapsedState(next);
  }, []);

  const currentSidePaneScope = useCallback(
    () => ({
      workspaceKey: activeWorkspaceKeyRef.current,
      ownerTaskId: sidePaneOwnerIdRef.current,
      ...pluginUiScopeRef.current,
    }),
    [],
  );

  const revealSidePaneForCurrentOwner = useCallback(() => {
    setIsSidePaneCollapsed(false);
    saveTaskSidePaneCollapsedPreference(
      activeSidePaneMemoryKeyRef.current,
      sidePaneOwnerIdRef.current,
      false,
    );
  }, []);

  const commitSidePaneState = useCallback(
    (updater: (current: WorkspaceSidePaneState | null) => WorkspaceSidePaneState | null) => {
      if (!mountedRef.current) return latestSidePaneMemoryRef.current.sidePaneState;
      const next = updater(latestSidePaneMemoryRef.current.sidePaneState);
      // 关闭末标签必须收敛到收起态；在此补建入口会让 Cmd/Ctrl+W 永远关闭不完。
      // 仅显式展开空面板时创建 new-tab，后台关闭也不能重新展开面板。
      if (getVisibleSidePaneTabs(next?.tabs ?? [], currentSidePaneScope()).length === 0) {
        setIsSidePaneCollapsed(true);
      }
      // 同一 React batch 内可能相邻到达多次侧栏更新，后到的具体值会覆盖尚未提交的打开、激活或排序。
      // 所有侧栏写入口统一先提交 canonical ref，保证严格按接收顺序合并。
      latestSidePaneMemoryRef.current = {
        ...latestSidePaneMemoryRef.current,
        sidePaneState: next,
      };
      // bridge 换代时，新组件先 render，旧组件后 cleanup；等卸载才保存会让新实例读到旧标签，
      // 留下仍存活却失去入口的 PTY。状态提交时同步写入既有 memory，使重挂读取同一份已提交状态。
      saveTaskSidePaneMemoryState(
        activeSidePaneMemoryKeyRef.current,
        latestSidePaneMemoryRef.current,
      );
      setSidePaneState(next);
      return next;
    },
    [currentSidePaneScope],
  );

  const commitOpenedSidePaneState = useCallback(
    (updater: (current: WorkspaceSidePaneState | null) => WorkspaceSidePaneState | null) => {
      commitSidePaneState((current) => {
        const next = stampSidePaneTabsOwnership(updater(current), {
          ownerTaskId: sidePaneOwnerIdRef.current,
          workspaceKey: activeWorkspaceKeyRef.current,
          remoteSessionId: workspaceRemoteSessionId ?? null,
        });
        const launcher = getActiveSidePaneTab(current);
        const opened = getActiveSidePaneTab(next);
        const scope = currentSidePaneScope();
        // 新标签页被内容替换，保留原位置；后台或其他对话的打开事件不能消费当前入口。
        // 插件市场保留返回入口，不属于在新标签页内启动的工具。
        if (
          !next ||
          launcher?.type !== "new-tab" ||
          !opened ||
          opened.type === "new-tab" ||
          opened.type === "plugin-market" ||
          !isSidePaneTabVisibleInScope(launcher, scope) ||
          !isSidePaneTabVisibleInScope(opened, scope)
        )
          return next;
        const alreadyOpen = current?.tabs.some((tab) => tab.id === opened.id);
        return {
          ...next,
          tabs: alreadyOpen
            ? next.tabs.filter((tab) => tab.id !== launcher.id)
            : next.tabs.flatMap((tab) =>
                tab.id === launcher.id ? [opened] : tab.id === opened.id ? [] : [tab],
              ),
        };
      });
    },
    [commitSidePaneState, currentSidePaneScope, workspaceRemoteSessionId],
  );

  useEffect(() => {
    const previousKey = activeSidePaneMemoryKeyRef.current;
    if (previousKey === sidePaneMemoryKey) {
      return;
    }

    // tabs/折叠态已在提交时保存，切换只恢复目标 workspace，不再用旧组件快照覆盖 memory。
    // 同一 workspace 内切换 task 不应该影响 side pane，所以 key 已经不再按 task 维度切分。
    const restored = readTaskSidePaneMemoryState(sidePaneMemoryKey);
    // app 作用域的扩展视图标签（docs/plugins/extension-host.md §18.1 H5）跟着当前工作区走：
    // 从旧工作区的记录移走、接到新工作区，标签 id 不变，内容不卸载，实例不重建。
    const moved = moveAppScopedExtensionViewTabs(
      latestSidePaneMemoryRef.current.sidePaneState,
      restored.sidePaneState,
      activeWorkspaceKeyRef.current,
    );
    if (moved) {
      saveTaskSidePaneMemoryState(previousKey, { sidePaneState: moved.previous });
      logger.info(
        `[App] 右侧面板 app 视图标签随工作区移动 count=${(moved.next?.tabs.length ?? 0) - (restored.sidePaneState?.tabs.length ?? 0)}`,
      );
    }
    activeSidePaneMemoryKeyRef.current = sidePaneMemoryKey;
    const collapsed =
      getSidePaneCollapsedPreference(restored, sidePaneOwnerIdRef.current) ??
      restored.isSidePaneCollapsed;
    setIsSidePaneCollapsed(collapsed);
    commitSidePaneState(() => (moved ? moved.next : restored.sidePaneState));
  }, [commitSidePaneState, sidePaneMemoryKey]);

  const markSidePaneDraftPromotion = useCallback((sessionId: string) => {
    pendingDraftPromotionRef.current = sessionId;
  }, []);

  useEffect(() => {
    const previousScope = previousSidePaneScopeRef.current;
    previousSidePaneScopeRef.current = {
      workspaceKey: activeWorkspaceKey,
      ownerTaskId: sidePaneOwnerId,
    };
    // Bug 根因（MPS01）：草稿 runtime 的插件 session id 在草稿创建后约 1s 才到达，
    // 本 effect 因 pluginUiTarget 变化重跑时把它当成“重新进入草稿”，按默认规则收起了用户
    // 刚在草稿里打开的文件树。只有首次同步或 workspace/owner 变化才算进入 scope；
    // 草稿内仅插件 scope 变化时只重选活动 tab，展开/收起保持当前值。
    const enteredScope =
      !hasSyncedSidePaneScopeRef.current ||
      previousScope.ownerTaskId !== sidePaneOwnerId ||
      previousScope.workspaceKey !== activeWorkspaceKey;
    hasSyncedSidePaneScopeRef.current = true;
    const promotedSessionId = pendingDraftPromotionRef.current;
    if (previousScope.ownerTaskId !== sidePaneOwnerId) {
      pendingDraftPromotionRef.current = null;
    }
    // Bug 根因：草稿里打开的 tab 归属冻结为草稿，首发后 owner 切到新任务，这些 tab 不可见、
    // 侧栏随之收起，用户看到“发送就关掉浏览器”。只在草稿首发提交标记的那次 owner 变化里迁移。
    const adoptionSessionId =
      promotedSessionId !== null &&
      sidePaneOwnerId === promotedSessionId &&
      previousScope.ownerTaskId === null &&
      previousScope.workspaceKey === activeWorkspaceKey
        ? promotedSessionId
        : null;
    let adoptedTabs: WorkspaceSidePaneTab[] = [];
    const draftCollapsed = latestSidePaneMemoryRef.current.isSidePaneCollapsed;
    commitSidePaneState((current) => {
      let next = current;
      let draftPreferredTabId: string | undefined;
      if (adoptionSessionId) {
        const adopted = adoptDraftSidePaneTabs(current, {
          workspaceKey: activeWorkspaceKey,
          ownerTaskId: adoptionSessionId,
        });
        next = adopted.sidePaneState;
        adoptedTabs = adopted.adoptedTabs;
        draftPreferredTabId = activeTabByOwnerRef.current.get(`${activeWorkspaceKey}::__draft__`);
      }
      const scopeKey = `${activeWorkspaceKey}::${sidePaneOwnerId ?? "__draft__"}`;
      const preferredTabId =
        draftPreferredTabId ??
        activeTabByOwnerRef.current.get(scopeKey) ??
        (activeTaskId ? lastActiveSubagentTabByRootRef.current.get(activeTaskId) : undefined);
      // Bug 根因：首发迁移后固定写入“展开”偏好，新任务又没有自己的偏好，草稿里收起的 tab
      // 一发送就弹开。首发时新任务改为继承草稿当时的折叠态，有可见 tab 才写成新任务的偏好。
      const collapsedPreference = adoptionSessionId
        ? draftCollapsed
        : getSidePaneCollapsedPreference(
            readTaskSidePaneMemoryState(activeSidePaneMemoryKeyRef.current),
            sidePaneOwnerId,
          );
      const resolved = resolveSidePaneScopeState(
        next,
        {
          workspaceKey: activeWorkspaceKey,
          ownerTaskId: sidePaneOwnerId,
          ...pluginUiScopeRef.current,
        },
        preferredTabId,
        collapsedPreference,
      );
      if (adoptionSessionId && resolved.sidePaneState?.activeTabId) {
        saveTaskSidePaneCollapsedPreference(
          activeSidePaneMemoryKeyRef.current,
          sidePaneOwnerId,
          draftCollapsed,
        );
      }
      // 只豁免“草稿默认收起”这一条：其余情况（无可见 tab、插件面板、已有任务）仍按 resolved。
      const activeTab = getActiveSidePaneTab(resolved.sidePaneState);
      const keepDraftCollapsed =
        !enteredScope &&
        sidePaneOwnerId === null &&
        Boolean(resolved.sidePaneState?.activeTabId) &&
        activeTab?.type !== "plugin-ui";
      const isSidePaneCollapsed = keepDraftCollapsed
        ? latestSidePaneMemoryRef.current.isSidePaneCollapsed
        : resolved.isSidePaneCollapsed;
      setIsSidePaneCollapsed(isSidePaneCollapsed);
      logger.debug("[App] 同步对话右侧面板 scope", {
        activeTabId: resolved.sidePaneState?.activeTabId ?? null,
        activeTaskId,
        adoptedDraftTabIds: adoptedTabs.map((tab) => tab.id),
        enteredScope,
        isSidePaneCollapsed,
        ownerTaskId: sidePaneOwnerId,
        preferredTabId: preferredTabId ?? null,
        workspaceKey: activeWorkspaceKey,
      });
      return resolved.sidePaneState;
    });
  }, [
    activeTaskId,
    activeWorkspaceKey,
    commitSidePaneState,
    sidePaneOwnerId,
    pluginUiTarget.sessionId,
    pluginUiWorkspaceKey,
  ]);

  const pendingFileManagerTarget = useOptionalTabStore((state) => state.pendingFileManagerTarget);
  const requestFileManager = useOptionalTabStore((state) => state.requestFileManager);
  const consumeFileManager = useOptionalTabStore((state) => state.consumeFileManager);
  const handleOpenFileManager = useCallback(
    (target?: FileManagerTarget) => {
      if (
        target &&
        !target.temporaryExternalDirectory &&
        (target.workspaceIdentity?.trim() || target.workspacePath) !== activeWorkspaceKeyRef.current
      ) {
        requestFileManager(target);
        return;
      }
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) =>
        openFileManagerSidePane(
          current,
          target ?? {
            workspacePath: workspaceAbsPath,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
            ...(workspaceRemoteSessionId ? { workspaceRemoteSessionId } : {}),
          },
        ),
      );
    },
    [
      requestFileManager,
      commitOpenedSidePaneState,
      revealSidePaneForCurrentOwner,
      workspaceAbsPath,
      workspaceIdentity,
      workspaceRemoteSessionId,
    ],
  );

  useEffect(() => {
    if (!pendingFileManagerTarget) return;
    const targetKey =
      pendingFileManagerTarget.workspaceIdentity?.trim() || pendingFileManagerTarget.workspacePath;
    if (targetKey !== activeWorkspaceKey) return;
    // 必须在本 hook 恢复目标 workspace 的 pane memory 和 owner 之后消费，不能由子 Shell effect 抢先写入旧桶。
    if (!consumeFileManager(pendingFileManagerTarget)) return;
    logger.debug("[FileManager] 在目标工作区打开目录", {
      workspaceKey: targetKey,
      ownerTaskId: sidePaneOwnerIdRef.current,
    });
    handleOpenFileManager(pendingFileManagerTarget);
  }, [pendingFileManagerTarget, activeWorkspaceKey, consumeFileManager, handleOpenFileManager]);

  // 扩展视图标签（docs/plugins/extension-host.md §8、§16.5）：启动页条目、能力 views.open 与
  // file.viewer 的 view 查看器共用这一个入口。
  const handleOpenExtensionView = useCallback(
    (tab: ExtensionViewSidePaneTab) => {
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) => activateExtensionViewSidePane(current, tab));
      logger.info(`[App] 打开右侧面板 mode=extension-view view=${tab.viewId}`);
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  // 扩展日志标签（docs/plugins/extension-host.md §16.8）：启动页「扩展日志」一行与命令中心共用。
  const handleOpenExtensionLogs = useCallback(() => {
    revealSidePaneForCurrentOwner();
    commitOpenedSidePaneState(activateExtensionLogsSidePane);
    logger.info("[App] 打开右侧面板 mode=extension-logs");
  }, [commitOpenedSidePaneState, revealSidePaneForCurrentOwner]);

  /**
   * `.xlsx` 分流：内置查看面板可用时改开 spreadsheets 面板 tab 并注入待开文档，
   * 能力门不过或后续失败时经 fallback 回到 Preview Pane 旧链路（docs/ui/office-file-preview.md 入口路由）。
   * 插件查看器（file.viewer，docs/plugins/extension-host.md §16.5）排在 `.xlsx` 常量之后、内置预览之前：
   * view 打开每个文件一个扩展视图标签；surface 沿用下面同一个面板流程（open_document）。
   * 返回 true 表示本次打开已被接管；同步门通过即接管，异步失败才调 fallback。
   */
  const routeOfficeViewerFile = useCallback(
    (source: CodeViewerSource, fallback: () => void): boolean => {
      if (source.type !== "file" || !source.path) return false;
      // 1. 内置 `.xlsx` 常量先查，行为不变；2. 再查插件声明。
      const officeRoute = matchOfficeViewerSurfaceRoute(source.path);
      const pluginRoute = officeRoute ? null : routeFileViewer(source.path);
      if (!officeRoute && !pluginRoute) return false;
      const sessionId = pluginUiTarget.sessionId;
      const bridge = services.pluginUiBridgeService;
      // source 自带归属优先：文件链接可指向其他 workspace，旧链路按 source 归属读取文件；
      // 面板与其 MCP server、pane session 都绑定当前工作区，source 属于其他 workspace
      // （哪怕本地）时无法正确寻址，必须回退旧链路，不能把外部路径映射进当前工作区。
      // 身份继承语义对齐旧链路（AnimatedSidePanePanel 的 code-viewer services 解析）：
      // source 显式带工作区根时身份不继承当前工作区——身份可选，缺失时以根路径为身份；
      // 否则身份缺失的跨工作区 source 会通过归属检查，把别的根下的同名文件映射进当前工作区。
      const sourceHasOwnWorkspace = source.workspacePath !== undefined;
      const sourceWorkspaceIdentity = sourceHasOwnWorkspace
        ? source.workspaceIdentity
        : (source.workspaceIdentity ?? workspaceIdentity);
      const sourceRemoteSessionId = source.workspaceRemoteSessionId ?? workspaceRemoteSessionId;
      const sourceWorkspaceKey =
        sourceWorkspaceIdentity?.trim() || (source.workspacePath ?? workspaceAbsPath);
      const shellWorkspaceKey = workspaceIdentity?.trim() || workspaceAbsPath;
      const sourceInLocalShellWorkspace =
        (!source.workspacePath ||
          areWorkspaceFilePathsEqual(source.workspacePath, workspaceAbsPath)) &&
        sourceWorkspaceKey === shellWorkspaceKey &&
        !sourceRemoteSessionId &&
        !workspaceRemoteSessionId &&
        !isRemoteWorkspaceIdentity(sourceWorkspaceIdentity ?? "");
      // 插件查看器只对本机工作区的文件生效（§16.5）；view 查看器不需要会话。
      if (!sourceInLocalShellWorkspace || !optionalPlatform?.pluginSandbox) return false;
      // 严格相对化：工作区外 / 越界路径返回 null 并回退，绝不退化成文件名
      //（open_document 以当前工作区为根解析，文件名会静默打开同名的另一份文件）。
      const relativePath = resolveOfficeViewerDocumentPath({
        workspacePath: source.workspacePath ?? workspaceAbsPath,
        filePath: source.path,
      });
      if (!relativePath) return false;
      if (pluginRoute?.target.kind === "view") {
        if (!pluginRoute.view) return false;
        logger.lifecycle.info("[extension-slots] file viewer routed", {
          itemId: pluginRoute.itemId,
          target: "view",
          path: relativePath,
        });
        handleOpenExtensionView(
          buildFileViewerTab(pluginRoute.view, {
            path: relativePath,
            workspace: {
              workspacePath: workspaceAbsPath,
              ...(workspaceIdentity ? { workspaceIdentity } : {}),
            },
          }),
        );
        return true;
      }
      const route = officeRoute ?? {
        pluginId: pluginRoute!.pluginId,
        surfaceId: pluginRoute!.target.id,
      };
      if (!sessionId || !bridge) return false;
      if (pluginRoute) {
        logger.lifecycle.info("[extension-slots] file viewer routed", {
          itemId: pluginRoute.itemId,
          target: "surface",
          path: relativePath,
        });
      }
      void (async () => {
        try {
          const surfaces = await bridge.listSurfaces({
            workspacePath: workspaceAbsPath,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
          });
          const surface =
            surfaces.find(
              (item) => item.pluginId === route.pluginId && item.id === route.surfaceId,
            ) ?? null;
          if (!surface) throw new Error(`office viewer surface not found: ${route.surfaceId}`);
          const request: OpenPluginUiSideTabRequest = {
            parentSessionId: sessionId,
            surfaceId: surface.id,
            serverName: surface.server,
            pluginId: surface.pluginId,
            resourceUri: surface.resourceUri,
            instanceId: `file:${relativePath}`,
            title: source.title || getPathLeaf(source.path),
            workspacePath: workspaceAbsPath,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
            remoteSessionId: workspaceRemoteSessionId ?? null,
          };
          // 每个文件一个实例 tab：不同文件并存互不覆盖，同一文件按确定的 tab id 去重聚焦。
          revealSidePaneForCurrentOwner();
          commitOpenedSidePaneState((current) =>
            openPluginUiSidePane(current, {
              ...request,
              workspaceKey: workspaceIdentity?.trim() || workspaceAbsPath,
            }),
          );
          logger.debug("[App] 打开 office 查看面板并加载文件", {
            surfaceId: surface.id,
            path: source.path,
            workspaceKey: workspaceIdentity?.trim() || workspaceAbsPath,
          });
          queueOfficeViewerPendingOpen({
            tabId: buildPluginUiSidePaneTabId(request),
            relativePath,
            source,
            onFallback: fallback,
          });
        } catch (error) {
          logger.warn("[office-viewer] 分流到查看面板失败，回退 Preview Pane 预览", {
            path: source.path,
            message: error instanceof Error ? error.message : String(error),
          });
          fallback();
        }
      })();
      return true;
    },
    [
      commitOpenedSidePaneState,
      handleOpenExtensionView,
      optionalPlatform,
      pluginUiTarget.sessionId,
      revealSidePaneForCurrentOwner,
      routeFileViewer,
      services,
      workspaceAbsPath,
      workspaceIdentity,
      workspaceRemoteSessionId,
    ],
  );

  const handleNavigateFileManager = useCallback(
    (tabId: string, source: CodeViewerSource) => {
      // 文件树在 file-manager tab 内点击 .xlsx 时改开查看面板 tab，本 tab 的预览区不动。
      const fallback = () =>
        commitSidePaneState((current) => navigateFileManagerSidePane(current, tabId, source));
      if (routeOfficeViewerFile(source, fallback)) return;
      fallback();
    },
    [commitSidePaneState, routeOfficeViewerFile],
  );

  const handleOpenCodeViewer = useCallback(
    (source: CodeViewerSource) => {
      const fallback = () => {
        revealSidePaneForCurrentOwner();
        commitOpenedSidePaneState((current) => {
          const next = openCodeViewerSidePane(current, source, sidePaneOwnerIdRef.current);
          const activeTab = getActiveSidePaneTab(next);
          const activePath =
            activeTab?.type === "code-viewer" ? (activeTab.source.path ?? "none") : "none";
          logger.info(
            `[App] 切换右侧面板 mode=code-viewer workspace=${workspaceAbsPath} title=${source.title} path=${activePath} tabs=${next.tabs.length}`,
          );
          return next;
        });
      };
      if (routeOfficeViewerFile(source, fallback)) return;
      fallback();
    },
    [
      commitOpenedSidePaneState,
      revealSidePaneForCurrentOwner,
      routeOfficeViewerFile,
      workspaceAbsPath,
    ],
  );

  const handleOpenCodeViewers = useCallback(
    (sources: readonly CodeViewerSource[]) => {
      if (sources.length === 0) return;
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) => {
        const next = openCodeViewerSidePanes(current, sources, sidePaneOwnerIdRef.current, 0);
        logger.info(
          `[App] 批量打开右侧预览 workspace=${workspaceAbsPath} sources=${sources.length} tabs=${next.tabs.length}`,
        );
        return next;
      });
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner, workspaceAbsPath],
  );

  const handleOpenBrowserUrl = useCallback((url: string) => {
    // 人工内嵌浏览器已移除；外链与本地 HTML 产物统一交给系统浏览器。
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleToggleGit = useCallback(() => {
    commitOpenedSidePaneState((current) => {
      if (isOfficeMode && !current?.tabs.some((tab) => tab.type === "git")) return current;
      const closingActiveGit = getActiveSidePaneTab(current)?.type === "git";
      const next = toggleGitSidePane(current);
      if (!closingActiveGit) {
        revealSidePaneForCurrentOwner();
      }
      const activeTab = getActiveSidePaneTab(next);
      logger.info(
        `[App] 切换右侧面板 mode=${activeTab?.type ?? "none"} workspace=${workspaceAbsPath} tabs=${next?.tabs.length ?? 0}`,
      );
      return next;
    });
  }, [isOfficeMode, commitOpenedSidePaneState, revealSidePaneForCurrentOwner, workspaceAbsPath]);

  const handleOpenGit = useCallback(() => {
    commitOpenedSidePaneState((current) => {
      if (isOfficeMode && !current?.tabs.some((tab) => tab.type === "git")) return current;
      const next = activateGitSidePane(current);
      // 文件变更查找只需要“确保 Git 面板打开”，不能复用 toggle。
      // 如果当前已经在 Git tab 上，toggle 会把它关掉，导致切到文件变更范围反而看不到内容。
      revealSidePaneForCurrentOwner();
      logger.info(
        `[App] 打开右侧面板 mode=git workspace=${workspaceAbsPath} tabs=${next.tabs.length}`,
      );
      return next;
    });
  }, [isOfficeMode, commitOpenedSidePaneState, revealSidePaneForCurrentOwner, workspaceAbsPath]);

  const handleOpenNewSidePaneTab = useCallback(() => {
    revealSidePaneForCurrentOwner();
    commitOpenedSidePaneState(activateNewTabSidePane);
  }, [commitOpenedSidePaneState, revealSidePaneForCurrentOwner]);

  const handleOpenPluginMarket = useCallback(() => {
    revealSidePaneForCurrentOwner();
    commitOpenedSidePaneState(activatePluginMarketSidePane);
  }, [commitOpenedSidePaneState, revealSidePaneForCurrentOwner]);

  const handleOpenDeveloperTools = useCallback(() => {
    revealSidePaneForCurrentOwner();
    commitOpenedSidePaneState((current) => {
      const next = activateDeveloperToolsSidePane(current);
      logger.info(
        `[App] 打开右侧面板 mode=developer-tools workspace=${workspaceAbsPath} tabs=${next.tabs.length}`,
      );
      return next;
    });
  }, [commitOpenedSidePaneState, revealSidePaneForCurrentOwner, workspaceAbsPath]);

  const handleOpenBackgroundBash = useCallback(
    (request: OpenBackgroundBashSideTabRequest) => {
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) => openBackgroundBashSidePane(current, request));
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  const handleOpenSubagentSession = useCallback(
    (request: OpenScopedSubagentSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      const rootSessionId = request.rootSessionId ?? request.parentSessionId;
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) => {
        const next = openSubagentSessionSidePane(current, {
          workspaceKey,
          workspacePath: request.workspacePath,
          ...(request.workspaceIdentity ? { workspaceIdentity: request.workspaceIdentity } : {}),
          ...(request.remoteSessionId ? { remoteSessionId: request.remoteSessionId } : {}),
          rootSessionId,
          parentSessionId: request.parentSessionId,
          childSessionId: request.childSessionId,
          subagentType: request.subagentType,
          title: request.title,
        });
        lastActiveSubagentTabByRootRef.current.set(rootSessionId, next.activeTabId);
        logger.debug(
          `[App] 打开子智能体右侧 tab parent=${request.parentSessionId} child=${request.childSessionId} workspace=${workspaceKey}`,
        );
        return next;
      });
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  const handleOpenSubagentDirectory = useCallback(
    (request: OpenScopedSubagentDirectorySideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      const rootSessionId = request.rootSessionId ?? request.parentSessionId;
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) => {
        const next = openSubagentDirectorySidePane(current, {
          workspaceKey,
          workspacePath: request.workspacePath,
          ...(request.workspaceIdentity ? { workspaceIdentity: request.workspaceIdentity } : {}),
          ...(request.remoteSessionId ? { remoteSessionId: request.remoteSessionId } : {}),
          rootSessionId,
          parentSessionId: request.parentSessionId,
        });
        lastActiveSubagentTabByRootRef.current.set(rootSessionId, next.activeTabId);
        return next;
      });
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  const handleSyncSubagentSessionTabs = useCallback(
    (request: import("@/lib/workspaceSidePane.js").SyncSubagentSessionTabsRequest) => {
      // 分支 edit/retry 的失效 tab 属于投影清理，不进入“最近关闭”。
      commitSidePaneState((current) => syncSubagentSessionSidePaneTabs(current, request));
    },
    [commitSidePaneState],
  );

  const handleOpenSelectionSideChat = useCallback(
    (request: OpenSelectionSideChatRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) => {
        const staleTab = request.replacesChildSessionId
          ? current?.tabs.find(
              (tab) =>
                tab.type === "selection-side-chat" &&
                tab.workspaceKey === workspaceKey &&
                tab.parentSessionId === request.parentSessionId &&
                tab.childSessionId === request.replacesChildSessionId,
            )
          : undefined;
        const withoutStale = staleTab ? closeSidePaneTab(current, staleTab.id) : current;
        return openSelectionSideChatPane(withoutStale, {
          ...request,
          workspaceKey,
        });
      });
      logger.debug("[App] 打开框选副屏会话", {
        childSessionId: request.childSessionId,
        parentSessionId: request.parentSessionId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  const handleOpenPlanDetail = useCallback(
    (request: OpenScopedPlanDetailSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) =>
        openPlanDetailSidePane(current, {
          ...request,
          workspaceKey,
        }),
      );
      logger.debug("[App] 打开计划详情右侧 tab", {
        parentSessionId: request.parentSessionId,
        toolCallId: request.toolCallId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  const handleOpenPluginUi = useCallback(
    (request: OpenPluginUiSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      revealSidePaneForCurrentOwner();
      commitOpenedSidePaneState((current) =>
        openPluginUiSidePane(current, { ...request, workspaceKey }),
      );
      logger.debug("[App] 打开插件 UI 右侧 tab", {
        parentSessionId: request.parentSessionId,
        toolCallId: request.toolCallId,
        pluginId: request.pluginId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState, revealSidePaneForCurrentOwner],
  );

  const handleOpenWorkflowRun = useCallback(
    (request: OpenScopedWorkflowRunSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      // 「配置」之后的原地替换不是一次打开：收起的侧栏保持收起。
      const replaceRunId = request.replaceRunId;
      if (replaceRunId === undefined) setIsSidePaneCollapsed(false);
      commitOpenedSidePaneState((current) =>
        replaceRunId === undefined
          ? openWorkflowRunSidePane(current, { ...request, workspaceKey })
          : replaceWorkflowRunSidePane(current, { ...request, workspaceKey, replaceRunId }),
      );
      logger.debug("[App] 打开工作流运行详情右侧 tab", {
        parentSessionId: request.parentSessionId,
        runId: request.runId,
        toolCallId: request.toolCallId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState],
  );

  const handleOpenWorkflowRunDirectory = useCallback(
    (request: OpenScopedWorkflowRunDirectorySideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      setIsSidePaneCollapsed(false);
      commitOpenedSidePaneState((current) =>
        openWorkflowRunDirectorySidePane(current, {
          ...request,
          workspaceKey,
        }),
      );
      logger.debug("[App] 打开工作流运行目录右侧 tab", {
        parentSessionId: request.parentSessionId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState],
  );

  const handleOpenWorkflowActorSession = useCallback(
    (request: OpenScopedWorkflowActorSessionSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      setIsSidePaneCollapsed(false);
      commitOpenedSidePaneState((current) =>
        openWorkflowActorSessionSidePane(current, {
          ...request,
          workspaceKey,
        }),
      );
      logger.debug("[App] 打开工作流 actor 会话右侧 tab", {
        actorSessionId: request.actorSessionId,
        parentSessionId: request.parentSessionId,
        runId: request.runId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState],
  );

  const handleOpenWorkflowWorkspace = useCallback(
    (request: OpenScopedWorkflowWorkspaceSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      setIsSidePaneCollapsed(false);
      commitOpenedSidePaneState((current) =>
        openWorkflowWorkspaceSidePane(current, {
          ...request,
          workspaceKey,
        }),
      );
      logger.debug("[App] 打开工作流工作区右侧 tab", {
        parentSessionId: request.parentSessionId,
        phaseId: request.phaseId,
        runId: request.runId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState],
  );

  // 内嵌浏览器已移除，html 产物同样落产物 tab；产物卡只提供「在工作区显示」。
  const handleOpenWorkflowArtifact = useCallback(
    (request: OpenScopedWorkflowArtifactSideTabRequest) => {
      const workspaceKey = request.workspaceIdentity?.trim() || request.workspacePath;
      setIsSidePaneCollapsed(false);
      commitOpenedSidePaneState((current) =>
        openWorkflowArtifactSidePane(current, {
          ...request,
          workspaceKey,
        }),
      );
      logger.debug("[App] 打开工作流产物右侧 tab", {
        artifactId: request.artifactId,
        parentSessionId: request.parentSessionId,
        runId: request.runId,
        workspaceKey,
      });
    },
    [commitOpenedSidePaneState],
  );

  const closeSelectionSideChatRuntime = useCallback(
    (
      tab: Extract<WorkspaceSidePaneTab, { type: "selection-side-chat" }>,
      sessionService = zcodeSessionService,
    ) => {
      clearSelectionSideChat(tab.childSessionId);
      clearConversationSelectionReferenceScope(tab.childSessionId, tab.workspaceKey);
      void sessionService
        .closeSession({
          workspacePath: tab.workspacePath,
          ...(tab.workspaceIdentity ? { workspaceIdentity: tab.workspaceIdentity } : {}),
          sessionId: tab.childSessionId,
        })
        .catch((error) => {
          if (String(error).includes("sessionNotFound")) return;
          logger.warn("[App] 关闭框选副屏 runtime 失败", {
            childSessionId: tab.childSessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [zcodeSessionService],
  );

  useEffect(() => {
    const subscription = subscribeTasksRemoved(
      {
        windowControllerService,
        zcodeTaskService,
        workspacePath: workspaceAbsPath,
        workspaceIdentity,
      },
      (signal) => {
        if (signal.permanentlyDeleted) {
          logger.debug("[archive-management] 同步永久删除清理", {
            count: signal.taskIds.length,
            workspaceIdentity: signal.workspaceIdentity,
          });
          for (const taskId of signal.taskIds) {
            useZCodeSessionStore
              .getState()
              .removeTaskState(signal.workspacePath, taskId, signal.workspaceIdentity);
            forgetWorkspaceConversation(signal, taskId);
          }
        }
        // 归档 / 删除后任务离开列表，它名下的 tab 再没有 scope 能显示，残留后无法从 UI 关闭。
        const workspaceKey = signal.workspaceIdentity?.trim() || signal.workspacePath;
        const isClosing = (tab: WorkspaceSidePaneTab) =>
          signal.taskIds.some((taskId) => isSidePaneTabOwnedByTask(tab, workspaceKey, taskId));
        // Bug 根因：信号覆盖窗口内所有工作区，当前 Provider 的 session service 属于正在显示的工作区；
        // 用它关闭其他工作区（可能在远端 Host）的侧边聊天子 session 会发错 Host，runtime 泄漏。按信号的工作区解析。
        const { baseServices, sessionsById } = useRemoteWorkspaceSessionStore.getState();
        const signalSessionService = resolveWorkspaceServicesForTarget({
          currentContextServices: services,
          resolvedRemoteSessionId: signal.remoteSessionId ?? null,
          baseServices,
          sessionsById,
          isRemoteTarget: Boolean(signal.remoteSessionId),
        }).zcodeSessionService;
        const releaseRuntimes = (tabs: WorkspaceSidePaneTab[]) => {
          for (const tab of tabs) {
            if (tab.type === "selection-side-chat") {
              closeSelectionSideChatRuntime(tab, signalSessionService);
            }
          }
        };
        for (const taskId of signal.taskIds) {
          clearConversationSelectionReferenceScope(taskId, workspaceKey);
        }

        if (workspaceKey !== activeSidePaneMemoryKeyRef.current) {
          const stored = readTaskSidePaneMemoryState(workspaceKey);
          const closingTabs = stored.sidePaneState?.tabs.filter(isClosing) ?? [];
          if (closingTabs.length === 0) return;
          releaseRuntimes(closingTabs);
          saveTaskSidePaneMemoryState(workspaceKey, {
            sidePaneState: closingTabs.reduce<WorkspaceSidePaneState | null>(
              (state, tab) => closeSidePaneTab(state, tab.id),
              stored.sidePaneState,
            ),
            isSidePaneCollapsed: stored.isSidePaneCollapsed,
          });
        } else {
          const closingTabs =
            latestSidePaneMemoryRef.current.sidePaneState?.tabs.filter(isClosing) ?? [];
          if (closingTabs.length === 0) return;
          releaseRuntimes(closingTabs);
          const closingIds = closingTabs.map((tab) => tab.id);
          commitSidePaneState((current) =>
            closeSidePaneTabs(current, closingIds, currentSidePaneScope()),
          );
        }
        logger.info("[App] 任务归档或删除，关闭其右侧面板标签", {
          taskIds: signal.taskIds,
          workspaceKey,
        });
      },
    );
    return () => subscription?.dispose();
  }, [
    closeSelectionSideChatRuntime,
    commitSidePaneState,
    currentSidePaneScope,
    services,
    windowControllerService,
    workspaceAbsPath,
    workspaceIdentity,
    zcodeTaskService,
  ]);

  // 订阅“打开模型调用轨迹”请求：菜单深处通过单例 store 发起，这里按 workspaceKey 匹配后消费。
  const handleToggleSidebar = useCallback(() => {
    setIsSidebarVisible((visible) => !visible);
  }, []);

  const handleToggleSidePaneCollapse = useCallback(() => {
    const nextCollapsed = !latestSidePaneMemoryRef.current.isSidePaneCollapsed;
    setIsSidePaneCollapsed(nextCollapsed);
    saveTaskSidePaneCollapsedPreference(
      activeSidePaneMemoryKeyRef.current,
      sidePaneOwnerIdRef.current,
      nextCollapsed,
    );
    // 与显隐在同一交互内提交，避免先显示特殊空态再由 effect 补建标签。
    if (!nextCollapsed)
      commitSidePaneState((current) => ensureSidePaneTab(current, currentSidePaneScope()));
    logger.info(
      `[App] ${nextCollapsed ? "收起" : "展开"}右侧面板 workspace=${workspaceAbsPath} tabs=${latestSidePaneMemoryRef.current.sidePaneState?.tabs.length ?? 0}`,
    );
  }, [commitSidePaneState, currentSidePaneScope, setIsSidePaneCollapsed, workspaceAbsPath]);

  const handleCloseCodeViewer = useCallback(() => {
    logger.info(`[App] 关闭右侧面板 mode=code-viewer workspace=${workspaceAbsPath}`);
    commitSidePaneState((current) => {
      const next = closeCodeViewerSidePane(current);
      return next;
    });
  }, [commitSidePaneState, currentSidePaneScope, setIsSidePaneCollapsed, workspaceAbsPath]);

  const handleCloseGit = useCallback(() => {
    logger.info(`[App] 关闭右侧面板 mode=git workspace=${workspaceAbsPath}`);
    commitSidePaneState((current) => {
      const next = closeGitSidePane(current);
      return next;
    });
  }, [commitSidePaneState, currentSidePaneScope, setIsSidePaneCollapsed, workspaceAbsPath]);

  const handleActivateSidePaneTab = useCallback(
    (tabId: string) => {
      commitSidePaneState((current) => {
        const target = current?.tabs.find((candidate) => candidate.id === tabId);
        if (target?.type === "subagent-session" || target?.type === "subagent-directory") {
          lastActiveSubagentTabByRootRef.current.set(target.rootSessionId, target.id);
        }
        return setActiveSidePaneTab(current, tabId);
      });
    },
    [commitSidePaneState],
  );

  const handleReorderSidePaneTab = useCallback(
    (activeTabId: string, overTabId: string) => {
      commitSidePaneState((current) => reorderSidePaneTab(current, activeTabId, overTabId));
    },
    [commitSidePaneState],
  );

  const rememberClosedSidePaneTabs = useCallback((tabs: WorkspaceSidePaneTab[]) => {
    const restorableTabs = tabs.filter(
      (tab) => tab.type !== "selection-side-chat" && tab.type !== "new-tab",
    );
    if (restorableTabs.length === 0) {
      return;
    }

    const closedAt = Date.now();
    setAllRecentClosedSidePaneTabs((current) => {
      const closingIds = new Set(restorableTabs.map((tab) => tab.id));
      return [
        ...restorableTabs.map((tab) => ({ tab, closedAt })),
        ...current.filter((item) => !closingIds.has(item.tab.id)),
      ].slice(0, RECENT_CLOSED_SIDE_PANE_TAB_LIMIT);
    });
  }, []);

  const closeSelectedSidePaneTabs = useCallback(
    async (closingTabs: WorkspaceSidePaneTab[], preferredTabId?: string) => {
      if (closingTabs.length === 0) return;
      const scope = currentSidePaneScope();
      for (const tab of closingTabs) {
        if (tab.type === "selection-side-chat") closeSelectionSideChatRuntime(tab);
      }
      rememberClosedSidePaneTabs(closingTabs);
      const closingIds = closingTabs.map((tab) => tab.id);
      // 归属与关闭目标在点击时冻结，完成后写回原 registry；当前可见范围与活动标签按完成时的 scope 解析。
      // 原实例卸载后 ref 不再代表当前标签；仍完成关闭，但只在最新 memory 中删除原选定标签。
      if (!mountedRef.current || scope.workspaceKey !== activeWorkspaceKeyRef.current) {
        const stored = readTaskSidePaneMemoryState(scope.workspaceKey);
        const next = closeSidePaneTabs(stored.sidePaneState, closingIds, scope, preferredTabId);
        saveTaskSidePaneMemoryState(scope.workspaceKey, {
          sidePaneState: next,
          isSidePaneCollapsed: stored.isSidePaneCollapsed,
        });
      } else {
        const liveScope = currentSidePaneScope();
        commitSidePaneState((current) =>
          closeSidePaneTabs(
            current,
            closingIds,
            liveScope,
            liveScope.ownerTaskId === scope.ownerTaskId
              ? (preferredTabId ??
                  (liveScope.ownerTaskId
                    ? lastActiveSubagentTabByRootRef.current.get(liveScope.ownerTaskId)
                    : null))
              : undefined,
          ),
        );
      }
      logger.info("[App] 关闭右侧面板标签", { tabIds: closingIds, ...scope });
    },
    [
      closeSelectionSideChatRuntime,
      commitSidePaneState,
      currentSidePaneScope,
      rememberClosedSidePaneTabs,
    ],
  );

  const visibleSidePaneTabs = useCallback(
    () =>
      getVisibleSidePaneTabs(
        latestSidePaneMemoryRef.current.sidePaneState?.tabs ?? [],
        currentSidePaneScope(),
      ),
    [currentSidePaneScope],
  );

  const handleCloseSidePaneTab = useCallback(
    (tabId: string) => {
      void closeSelectedSidePaneTabs(visibleSidePaneTabs().filter((tab) => tab.id === tabId));
    },
    [closeSelectedSidePaneTabs, visibleSidePaneTabs],
  );

  const handleCloseOtherSidePaneTabs = useCallback(
    (tabId: string) => {
      const tabs = visibleSidePaneTabs();
      if (!tabs.some((tab) => tab.id === tabId)) return;
      void closeSelectedSidePaneTabs(
        tabs.filter((tab) => tab.id !== tabId),
        tabId,
      );
    },
    [closeSelectedSidePaneTabs, visibleSidePaneTabs],
  );

  const handleCloseAllSidePaneTabs = useCallback(() => {
    void closeSelectedSidePaneTabs(visibleSidePaneTabs());
  }, [closeSelectedSidePaneTabs, visibleSidePaneTabs]);

  const handleReopenClosedSidePaneTab = useCallback(
    (tabId: string) => {
      const item = allRecentClosedSidePaneTabs.find((entry) => entry.tab.id === tabId);
      if (
        !item ||
        !isSidePaneTabVisibleInScope(item.tab, currentSidePaneScope()) ||
        (isOfficeMode && item.tab.type === "git")
      )
        return;

      // 交互说明：最近关闭列表里的 tab 被点回打开时，需要同步展开右侧面板。
      // 否则 tab 状态已经恢复，但用户看到的还是折叠态，会误以为点击没有生效。
      revealSidePaneForCurrentOwner();
      commitSidePaneState((sidePaneCurrent) => {
        const next = restoreSidePaneTab(sidePaneCurrent, item.tab);
        if (item.tab.type === "subagent-session" || item.tab.type === "subagent-directory") {
          lastActiveSubagentTabByRootRef.current.set(item.tab.rootSessionId, item.tab.id);
        }
        return next;
      });
      setAllRecentClosedSidePaneTabs((current) =>
        current.filter((entry) => entry.tab.id !== tabId),
      );
      logger.info(`[App] 重新打开最近关闭右侧面板 tab=${tabId} workspace=${workspaceAbsPath}`);
    },
    [
      isOfficeMode,
      allRecentClosedSidePaneTabs,
      currentSidePaneScope,
      commitSidePaneState,
      revealSidePaneForCurrentOwner,
      workspaceAbsPath,
    ],
  );

  const recentClosedSidePaneTabs = useMemo(
    () =>
      allRecentClosedSidePaneTabs.filter(
        (item) =>
          isSidePaneTabVisibleInScope(item.tab, {
            workspaceKey: activeWorkspaceKey,
            ownerTaskId: sidePaneOwnerId,
          }) &&
          (!isOfficeMode || item.tab.type !== "git"),
      ),
    [activeWorkspaceKey, sidePaneOwnerId, allRecentClosedSidePaneTabs, isOfficeMode],
  );

  return {
    // 办公模式只隐藏新建入口；过滤面板状态会让已打开的终端和审查在切换时消失。
    markSidePaneDraftPromotion,
    sidePaneState,
    recentClosedSidePaneTabs,
    isSidePaneCollapsed,
    setIsSidePaneCollapsed,
    isSidebarVisible,
    handleOpenFileManager,
    handleNavigateFileManager,
    // 回调
    handleOpenCodeViewer,
    handleOpenCodeViewers,
    handleOpenBrowserUrl,
    handleToggleGit,
    handleOpenGit,
    handleOpenDeveloperTools,
    handleOpenExtensionView,
    handleOpenExtensionLogs,
    handleOpenPluginMarket,
    handleOpenNewSidePaneTab,
    handleOpenSubagentSession,
    handleOpenBackgroundBash,
    handleOpenSubagentDirectory,
    handleSyncSubagentSessionTabs,
    handleOpenSelectionSideChat,
    handleOpenPlanDetail,
    handleOpenPluginUi,
    handleOpenWorkflowRun,
    handleOpenWorkflowRunDirectory,
    handleOpenWorkflowActorSession,
    handleOpenWorkflowWorkspace,
    handleOpenWorkflowArtifact,
    handleToggleSidebar,
    handleToggleSidePaneCollapse,
    handleCloseCodeViewer,
    handleCloseGit,
    handleActivateSidePaneTab,
    handleReorderSidePaneTab,
    handleCloseSidePaneTab,
    handleCloseOtherSidePaneTabs,
    handleCloseAllSidePaneTabs,
    handleReopenClosedSidePaneTab,
  };
}
