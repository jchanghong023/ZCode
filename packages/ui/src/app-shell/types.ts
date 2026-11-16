import type { FileManagerTarget } from "@/lib/workspaceSidePane.js";
import type { ComposerDraftHandoff } from "@/v4/composer/composerDraftWorkspaceTransfer.js";
import type { RefObject } from "react";
import type {
  ZCodeProvider,
  SessionCreateSource,
  ZCodeTaskRuntimeStatus,
  ZCodeTaskMeta,
  GitChangeSourceId,
  DesktopWindowChromeState,
  IPlatformService,
  UserInfo,
} from "@zcode/shared";
import type { IServiceAccessor } from "@zcode/services";
import type { SavedWorkflowHubTarget } from "@/v4/savedWorkflowHubContext.js";
import type { RecentClosedSidePaneTab } from "@/lib/workspaceSidePane.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import type { AssistantPreviewCardsAutoOpenRequest } from "@/lib/assistantPreviewCards.js";
import type {
  OpenScopedSubagentSideTabRequest,
  OpenBackgroundBashSideTabRequest,
  OpenSelectionSideChatRequest,
  OpenScopedPlanDetailSideTabRequest,
  OpenScopedWorkflowRunSideTabRequest,
  OpenScopedWorkflowActorSessionSideTabRequest,
  OpenScopedWorkflowArtifactSideTabRequest,
  OpenScopedWorkflowWorkspaceSideTabRequest,
  WorkspaceSidePaneState,
} from "@/lib/workspaceSidePane.js";
import type { WorkspaceZCodeUIState } from "@/store/zcodeSessionStore.js";
import type { Theme } from "@/useTheme.js";
import type {
  ChatSearchResultHighlightRequest,
  ChatViewSummaryPanelVariant,
  ConversationFindMatchState,
} from "@/v4/legacyChatViewTypes.js";
import type { ComposerMentionPrefill } from "@/store/zcodeSessionStoreTypes.js";
import type { TaskFindDialogProps } from "@/quickpick/TaskFindDialog.js";
import type { AutomationsNavigationTab, OpenAutomationsMain } from "@/lib/taskNavigationHistory.js";
import type { SidePaneFullViewController } from "@/side-pane-full-view/contract.js";

export interface WorkspaceShellZCodeState {
  activeTaskId: WorkspaceZCodeUIState["activeTaskId"];
  draftFocusVersion: WorkspaceZCodeUIState["draftFocusVersion"];
  modelSwitchPending: WorkspaceZCodeUIState["modelSwitchPending"];
  modelSwitchStage: WorkspaceZCodeUIState["modelSwitchStage"];
  selectedProvider: WorkspaceZCodeUIState["selectedProvider"];
  optimisticTaskListByTaskId: WorkspaceZCodeUIState["optimisticTaskListByTaskId"];
  workspaceInit: WorkspaceZCodeUIState["workspaceInit"];
  taskStatus: ZCodeTaskRuntimeStatus;
  taskError: string | null;
}

export interface CreateTaskOptions {
  /** Renderer 发起方租约；异步准备期间取消或换草稿后不得导航。 */
  isCurrent?: () => boolean;
  /** 只在目标准备和新草稿导航完成后通知发起界面；不自动发送。 */
  onComplete?: () => void;
  onError?: (error: unknown) => void;
  /** 异步预填只能提交到解析 Skill 时的同一新任务目标。 */
  expectedWorkspaceKey?: string;
  provider?: ZCodeProvider;
  projectId?: string | null;
  /** 未归类任务目录准备的幂等身份，不作为 session 身份。 */
  draftId?: string;
  /** 仅分组组织意图，不决定执行项目或 cwd。 */
  taskGroupId?: string | null;
  hostId?: string;
  createSource?: SessionCreateSource;
  /** 新草稿输入框预填文本；只写草稿，不自动发送。 */
  initialPrompt?: string;
  /** 创建项目后的当前草稿交接，仅在 renderer 内存中传递。 */
  initialComposerDraft?: ComposerDraftHandoff;
  /** 与 initialPrompt canonical 前缀对应的结构化 mention；仅用于编辑器展示。 */
  initialPromptMention?: ComposerMentionPrefill;
  /** 新任务落在哪个 workspace；缺省取活动 workspace。 */
  targetWorkspace?: {
    projectId?: string | null;
    hostId?: string;
    workspacePath: string;
    workspaceIdentity?: string;
  };
}

export type CreateTaskRequest = ZCodeProvider | CreateTaskOptions;

export interface AppProps {
  services: IServiceAccessor;
  onLogout?: () => void;
  onLogin?: () => void;
  user?: UserInfo | null;
  onCreateTask: (request?: CreateTaskRequest) => void;
  onCreateConversationTask?: () => void;
  onCreateConversationTaskOnSource?: (sourceServerId: string) => void;
  /** 解析“在项目外工作”的目标；identity 由 Root 按 Source 归属给出，Shell 不得按路径反查。 */
  onResolveConversationWorkspace?: () => Promise<{
    workspacePath: string;
    workspaceIdentity?: string;
  }>;
  onOpenWorkspace: () => void;
  onOpenFolderFromWorkspaceMenu: () => void;
  onReturnToWorkspace?: () => void;
  allowOpenWorkspace?: boolean;
  initialSidebarFileTreeOpen?: boolean;
  workspaceAbsPath: string;
  workspaceRemoteSessionId?: string;
  workspaceIdentity?: string;
  isWorkspaceVisible?: boolean;
  isDesktop?: boolean;
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
}

export interface GitChangeSummary {
  added: number;
  removed: number;
}

export type WorkspaceMainView = "chat" | "automations" | "plugin-store";

export interface WorkspaceShellLayoutProps extends AppProps {
  workspaceReadOnlyReason?: string;
  workspaceMainView: WorkspaceMainView;
  pluginStoreOpenVersion: number;
  openAutomationId: string | null;
  openAutomationTab: AutomationsNavigationTab | null;
  /**
   * 完成卡「已保存」芯片 → 中枢那一页（docs/dynamic-workflow/transcript-and-notifications.md
   * 「Saving the run, and running it again」）：切到自动化主视图的「工作流」标签并设深链。
   */
  onOpenSavedWorkflowInHub: (target: SavedWorkflowHubTarget) => void;
  onWorkspaceMainViewChange: (view: WorkspaceMainView) => void;
  onOpenAutomationConsumed: () => void;
  handleOpenAutomations: OpenAutomationsMain;
  handleOpenPluginStore: () => void;
  workspaceShellZCodeState: WorkspaceShellZCodeState;
  theme: Theme;
  isMacFullscreen: boolean;
  desktopWindowChromeState: DesktopWindowChromeState | null;
  macWindowControlsLeftPaddingPx: number;
  windowsWindowControlsRightPaddingPx: number;
  sidebarContainerRef: RefObject<HTMLElement | null>;
  toggleSidebarShortcutLabel: string;
  newTaskShortcutLabel: string;
  goBackShortcutLabel: string;
  goForwardShortcutLabel: string;
  toggleSidePaneShortcutLabel: string;
  /** 「进入 / 退出完整视图」快捷键标签（仅桌面）。 */
  toggleSidePaneFullViewShortcutLabel?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  canTaskNavBack: boolean;
  canTaskNavForward: boolean;
  isSidebarVisible: boolean;
  isGitOpen: boolean;
  isSidePaneOpen: boolean;
  /** Side Pane 完整视图控制器（仅桌面；spec：docs/ui/side-pane-full-view.md）。 */
  sidePaneFullView?: SidePaneFullViewController;
  summaryPanelVariantOverride: ChatViewSummaryPanelVariant | null;
  onSummaryPanelVariantOverrideChange: (variant: ChatViewSummaryPanelVariant | null) => void;
  sidePaneState: WorkspaceSidePaneState | null;
  recentClosedSidePaneTabs: RecentClosedSidePaneTab[];
  shellPanelIds: string[];
  projectName: string;
  workspaceTabs: Array<{
    workspacePath: string;
    label: string;
    remoteSessionId?: string;
    remoteTarget?: import("@zcode/shared").RemoteTarget;
    workspaceIdentity?: string;
    workspacePurpose?: import("@zcode/shared").WorkspacePurpose;
    localWorkspacePath?: string;
    availability?: import("@/store/tabStore.js").WorkspaceAvailability;
  }>;
  activeTaskId: string | null;
  /** 右侧栏的正式会话归属 ID；草稿为空，不复制 pane 内部预热 session。 */
  sidePaneOwnerId: string | null;
  handleSidePaneDraftPromotion: (sessionId: string) => void;
  activeTraceId: string | null;
  activeSessionId: string | null;
  activeTaskProvider: ZCodeProvider | null;
  resolvedActiveTaskMeta?: ZCodeTaskMeta | null;
  activeTaskTitle: string;
  activeTaskChangeSummary: ReturnType<
    typeof import("@/lib/taskChangeSummary.js").getTaskChangeSummary
  >;
  gitWorktreeReviewSourceId: GitChangeSourceId | null;
  gitWorktreeChangeSummary: GitChangeSummary;
  activeGitSourceId: GitChangeSourceId;
  gitState: ReturnType<typeof import("@/hooks/useGitRepository.js").useGitRepository>;
  conversationFindActiveIndex: number;
  conversationFindNavigationRequestId: number;
  conversationFindQuery: string;
  onConversationFindMatchStateChange: (state: ConversationFindMatchState) => void;
  searchResultHighlightRequest?: ChatSearchResultHighlightRequest | null;
  onSearchResultHighlightDone?: (requestId: number) => void;
  fileChangeFindActiveIndex: number;
  fileChangeFindNavigationRequestId: number;
  fileChangeFindQuery: string;
  onFileChangeFindMatchCountChange: (count: number) => void;
  appLogoUrl: string;
  platform: IPlatformService;
  reloadSessionDisabled: boolean;
  reloadSessionPending: boolean;
  handleReloadSession: (options?: {
    resumeTaskId?: string | null;
    provider?: ZCodeProvider | null;
  }) => Promise<void>;
  handleSelectTask: (
    targetWorkspacePath: string,
    taskId: string,
    targetWorkspaceIdentity?: string,
    expectedUnreadAt?: number,
  ) => void;
  handleTaskNavBack: () => void;
  handleTaskNavForward: () => void;
  handleStartDraftInWorkspace: (
    targetWorkspacePath: string,
    targetWorkspaceIdentity?: string,
    targetWorkspacePurpose?: import("@zcode/shared").WorkspacePurpose,
    createSource?: SessionCreateSource,
  ) => void;
  handleOpenCommandCenter: () => void;
  handleRefreshGit: () => void;
  handleToggleSidebar: () => void;
  handleOpenDeveloperTools: () => void;
  handleOpenFileManager: (target?: FileManagerTarget) => void;
  handleNavigateFileManager: (tabId: string, source: CodeViewerSource) => void;
  handleOpenPluginMarket: () => void;
  handleToggleGit: () => void;
  handleOpenGitReview: (sourceId?: GitChangeSourceId) => void;
  handleToggleSidePane: () => void;
  handleOpenBrowserUrl: (url: string) => void;
  handleOpenCodeViewer: (source: CodeViewerSource) => void;
  handleAutoOpenAssistantPptx: (request: AssistantPreviewCardsAutoOpenRequest) => void;
  handleOpenBackgroundBash: (request: OpenBackgroundBashSideTabRequest) => void;
  handleOpenSubagentSession: (request: OpenScopedSubagentSideTabRequest) => void;
  handleOpenSubagentDirectory: (
    request: import("@/lib/workspaceSidePane.js").OpenScopedSubagentDirectorySideTabRequest,
  ) => void;
  handleSyncSubagentSessionTabs: (
    request: import("@/lib/workspaceSidePane.js").SyncSubagentSessionTabsRequest,
  ) => void;
  handleOpenSelectionSideChat: (request: OpenSelectionSideChatRequest) => void;
  handleOpenPlanDetail: (request: OpenScopedPlanDetailSideTabRequest) => void;
  handleOpenWorkflowRun: (request: OpenScopedWorkflowRunSideTabRequest) => void;
  handleOpenWorkflowRunDirectory: (
    request: import("@/lib/workspaceSidePane.js").OpenScopedWorkflowRunDirectorySideTabRequest,
  ) => void;
  handleOpenWorkflowActorSession: (request: OpenScopedWorkflowActorSessionSideTabRequest) => void;
  handleOpenWorkflowWorkspace: (request: OpenScopedWorkflowWorkspaceSideTabRequest) => void;
  handleOpenWorkflowArtifact: (request: OpenScopedWorkflowArtifactSideTabRequest) => void;
  handleCloseCodeViewer: () => void;
  handleCloseGit: () => void;
  handleOpenNewSidePaneTab: () => void;
  handleActivateSidePaneTab: (tabId: string) => void;
  handleReorderSidePaneTab: (activeTabId: string, overTabId: string) => void;
  handleCloseSidePaneTab: (tabId: string) => void;
  handleCloseOtherSidePaneTabs: (tabId: string) => void;
  handleCloseAllSidePaneTabs: () => void;
  handleReopenClosedSidePaneTab: (tabId: string) => void;
  setGitSelectedSourceId: (value: GitChangeSourceId) => void;
  taskFindDialogProps: TaskFindDialogProps;
}
