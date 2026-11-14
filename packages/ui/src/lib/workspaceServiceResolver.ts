import type { IServiceAccessor } from "@zcode/services";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";

interface WorkspaceServiceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  remoteTarget?: unknown;
}

export interface WorkspaceServiceResolverState<TServices = IServiceAccessor> {
  sessionsById: Record<string, { services: TServices }>;
  sessionIdByWorkspaceIdentity: Record<string, string>;
  sessionIdByWorkspacePath: Record<string, string>;
}

interface ResolvedWorkspaceServices {
  services: IServiceAccessor;
  remoteSessionId?: string;
  isRemoteWorkspace: boolean;
}

export function resolveWorkspaceRemoteSessionId<TServices>(
  target: WorkspaceServiceTarget,
  state: WorkspaceServiceResolverState<TServices>,
): string | undefined {
  // 修复原因：identity 只区分数据；当前后端即使存在同名缓存，也不能借用旧远程 attachment。
  if (!target.remoteSessionId && !target.remoteTarget) return undefined;
  const workspaceIdentity = target.workspaceIdentity?.trim();
  const candidateSessionIds = [
    target.remoteSessionId,
    workspaceIdentity ? state.sessionIdByWorkspaceIdentity[workspaceIdentity] : undefined,
    // 同一路径可能同时存在于多个 SSH/WSL/Docker endpoint。已有 identity 时若
    // 精确绑定尚未恢复，按 path fallback 会借用另一 endpoint 的 services，导致 sessions-index、
    // provider 和 task RPC 串到错误 Host。identity 缺失时保持 remote-waiting；只有旧版无
    // identity 的 remote tab 才继续使用 path 兼容恢复。
    !workspaceIdentity && target.remoteTarget
      ? state.sessionIdByWorkspacePath[target.workspacePath]
      : undefined,
  ];

  return candidateSessionIds.find((sessionId): sessionId is string =>
    Boolean(sessionId && state.sessionsById[sessionId]),
  );
}

export function isRemoteWorkspaceTarget(
  target: WorkspaceServiceTarget,
  resolvedRemoteSessionId?: string,
): boolean {
  return Boolean(target.remoteSessionId || target.remoteTarget || resolvedRemoteSessionId);
}

export function resolveWorkspaceServices(
  target: WorkspaceServiceTarget,
  baseServices: IServiceAccessor,
  state: WorkspaceServiceResolverState,
): ResolvedWorkspaceServices | null {
  const remoteSessionId = resolveWorkspaceRemoteSessionId(target, state);
  const isRemoteWorkspace = isRemoteWorkspaceTarget(target, remoteSessionId);

  // 显式旧远程目标缺少 attachment 时仍拒绝，不把请求误投当前后端；
  // 当前后端只有 identity 的工作区则正常使用根 accessor。
  if (isRemoteWorkspace) {
    const services = remoteSessionId ? state.sessionsById[remoteSessionId]?.services : undefined;
    return services
      ? {
          services,
          remoteSessionId,
          isRemoteWorkspace,
        }
      : null;
  }

  return {
    services: baseServices,
    isRemoteWorkspace,
  };
}

export function buildWorkspaceServiceLookup(
  workspaceTabs: WorkspaceServiceTarget[],
  baseServices: IServiceAccessor,
  state: WorkspaceServiceResolverState,
): Map<string, ResolvedWorkspaceServices> {
  const lookup = new Map<string, ResolvedWorkspaceServices>();

  for (const tab of workspaceTabs) {
    const resolved = resolveWorkspaceServices(tab, baseServices, state);
    if (!resolved) {
      continue;
    }

    lookup.set(buildTaskWorkspaceKey(tab.workspacePath, tab.workspaceIdentity), resolved);
  }

  return lookup;
}
