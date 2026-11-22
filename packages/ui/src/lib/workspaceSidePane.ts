export interface OpenBackgroundBashSideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  rootSessionId: string;
  sessionId: string;
  workId: string;
  title: string;
}

export interface OpenWorkflowRunSideTabRequest {
  parentSessionId: string;
  toolCallId: string;
  runId: string;
  workflowName?: string;
  /** 落点：详情页展开这一站、列出全部、滚到节头。缺席即停在原处。 */
  phaseId?: string;
  /**
   * 「配置」之后面板跟着工作流走：
   * 把显示这个 run 的 tab **原地**换成新 run 的 tab——同一个位置、沿用它的名字与归属。没有这样的
   * tab（已关掉）就什么都不做：面板不会为此重新打开。
   */
  replaceRunId?: string;
}

export interface OpenWorkflowRunDirectorySideTabRequest {
  parentSessionId: string;
}

export interface OpenWorkflowActorSessionSideTabRequest {
  parentSessionId: string;
  runId: string;
  /** 打开时已知的会话 id；未启动的槽位缺席。 */
  actorSessionId?: string;
  siteId: string;
  ordinal: number;
  actorName?: string;
}

export interface OpenScopedWorkflowActorSessionSideTabRequest extends OpenWorkflowActorSessionSideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface OpenWorkflowWorkspaceSideTabRequest {
  parentSessionId: string;
  toolCallId: string;
  runId: string;
  workflowName?: string;
  phaseId?: string;
}

export interface OpenScopedWorkflowWorkspaceSideTabRequest extends OpenWorkflowWorkspaceSideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface OpenWorkflowArtifactSideTabRequest {
  parentSessionId: string;
  runId: string;
  artifactId: string;
  version?: number;
  title?: string;
  /**
   * 最新版的 contentType（表面上的摘要带得到就带）。
   * 由 `useAppPanels.handleOpenWorkflowArtifact` 消费。
   */
  contentType?: string;
  /**
   * 工作区相对的原路径。只有已经合并过 journal 的表面（run 侧板）带得到；缺席时由
   * `handleOpenWorkflowArtifact` 自己查 journal 补齐——摘要刻意不带它（状态帧体积）。
   */
  sourcePath?: string;
}

export interface OpenScopedWorkflowArtifactSideTabRequest extends OpenWorkflowArtifactSideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface OpenScopedWorkflowRunSideTabRequest extends OpenWorkflowRunSideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface OpenScopedWorkflowRunDirectorySideTabRequest extends OpenWorkflowRunDirectorySideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export interface OpenSubagentSideTabRequest {
  rootSessionId?: string;
  parentSessionId: string;
  childSessionId: string;
  subagentType: string;
  title: string;
}

export interface OpenScopedSubagentSideTabRequest extends OpenSubagentSideTabRequest {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

/** 原生与业务 Side Pane 共用标签集合算法，展示目标与业务数据由各自 owner 持有。 */
export interface PaneTabsState<T extends { id: string }> {
  tabs: T[];
  activeTabId: string;
}
export function activatePaneTab<T extends { id: string }>(
  state: PaneTabsState<T> | null,
  tab: T,
): PaneTabsState<T> {
  if (!state) return { tabs: [tab], activeTabId: tab.id };
  const index = state.tabs.findIndex((item) => item.id === tab.id);
  const tabs = [...state.tabs];
  if (index < 0) tabs.push(tab);
  else tabs[index] = tab;
  return { tabs, activeTabId: tab.id };
}
export function closePaneTab<T extends { id: string }>(
  state: PaneTabsState<T> | null,
  id: string,
): PaneTabsState<T> | null {
  if (!state) return state;
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (!tabs.length) return null;
  return {
    tabs,
    activeTabId:
      state.activeTabId === id ? tabs[Math.min(index, tabs.length - 1)]!.id : state.activeTabId,
  };
}
export function selectPaneTab<T extends { id: string }>(
  state: PaneTabsState<T> | null,
  id: string,
): PaneTabsState<T> | null {
  return state?.tabs.some((tab) => tab.id === id) ? { ...state, activeTabId: id } : state;
}
export function reorderPaneTab<T extends { id: string }>(
  state: PaneTabsState<T> | null,
  from: string,
  to: string,
): PaneTabsState<T> | null {
  if (!state || from === to) return state;
  const start = state.tabs.findIndex((tab) => tab.id === from),
    end = state.tabs.findIndex((tab) => tab.id === to);
  if (start < 0 || end < 0) return state;
  const tabs = [...state.tabs];
  const [moved] = tabs.splice(start, 1);
  if (!moved) return state;
  tabs.splice(end, 0, moved);
  return { ...state, tabs };
}
