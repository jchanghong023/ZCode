interface WorkspaceTabIdentityLike {
  workspacePath: string;
  remoteSessionId?: string;
  workspaceIdentity?: string;
  remoteTarget?: unknown;
}

interface WorkspaceTabMatchOptions {
  remoteSessionId?: string;
  workspaceIdentity?: string;
  previousWorkspaceIdentity?: string;
}

function isLocalWorkspaceTab(tab: WorkspaceTabIdentityLike): boolean {
  // 修复原因：path-only 导航仍应复用当前后端带稳定 identity 的 tab，不能创建重复入口。
  return !tab.remoteSessionId && !tab.remoteTarget;
}

export function isSameWorkspaceTab(
  tab: WorkspaceTabIdentityLike,
  workspacePath: string,
  options?: WorkspaceTabMatchOptions,
): boolean {
  if (tab.workspacePath !== workspacePath) {
    return false;
  }

  if (options?.workspaceIdentity) {
    return (
      tab.workspaceIdentity === options.workspaceIdentity ||
      (Boolean(options.previousWorkspaceIdentity) &&
        tab.workspaceIdentity === options.previousWorkspaceIdentity)
    );
  }

  if (options?.remoteSessionId) {
    return tab.remoteSessionId === options.remoteSessionId;
  }

  return isLocalWorkspaceTab(tab);
}
