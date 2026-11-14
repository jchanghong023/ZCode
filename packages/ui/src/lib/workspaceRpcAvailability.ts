interface WorkspaceRpcAvailabilityTarget {
  workspaceIdentity?: string | null;
  remoteSessionId?: string | null;
  remoteTarget?: unknown;
}

export function isRemoteWorkspaceRpcTarget(target: WorkspaceRpcAvailabilityTarget): boolean {
  // 修复原因：当前后端的稳定 identity 不能暂停正常的工作区 RPC。
  return Boolean(target.remoteSessionId?.trim() || target.remoteTarget);
}

export function shouldEnableWorkspaceRpc(target: WorkspaceRpcAvailabilityTarget): boolean {
  return !isRemoteWorkspaceRpcTarget(target) || Boolean(target.remoteSessionId?.trim());
}
