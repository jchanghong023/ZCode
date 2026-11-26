import type { IServiceAccessor } from "@zcode/services";
import { Event, ProxyChannel, type IChannel } from "@zcode/rpc";
import { useMemo } from "react";
import { useServices } from "@/hooks/useServices.js";
import { useRegisteredBaseWorkspaceServices } from "@/store/baseWorkspaceServices.js";
import { REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE } from "@/lib/remoteWorkspaceServiceError.js";

let disconnectedRemoteServices: IServiceAccessor | null = null;

function createDisconnectedRemoteServices(): IServiceAccessor {
  const createDisconnectedError = () => {
    const error = new Error(REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE) as Error & {
      code: string;
    };
    error.code = REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE;
    return error;
  };
  const disconnectedChannel: IChannel = {
    call: () => Promise.reject(createDisconnectedError()),
    listen: () => Event.None,
  };
  // 复用真实 RPC 代理的分类契约：命令明确拒绝，普通/动态事件返回空订阅。
  const serviceProxy = ProxyChannel.toService<object>(disconnectedChannel);

  return new Proxy(Object.create(null), {
    get() {
      return serviceProxy;
    },
  }) as IServiceAccessor;
}

export function getDisconnectedRemoteServices(): IServiceAccessor {
  if (!disconnectedRemoteServices) {
    disconnectedRemoteServices = createDisconnectedRemoteServices();
  }
  return disconnectedRemoteServices;
}

export function useBaseWorkspaceServices(): IServiceAccessor {
  const contextServices = useServices();
  return useRegisteredBaseWorkspaceServices() ?? contextServices;
}

export interface WorkspaceServicesResolution {
  services: IServiceAccessor;
  rpcReady: boolean;
}

export function useWorkspaceServicesResolution(
  _workspacePath: string | null | undefined,
  preferredRemoteSessionId?: string | null,
  _workspaceIdentity?: string | null,
  remoteTarget?: unknown,
  options?: { unscopedServices?: IServiceAccessor; forceUnscoped?: boolean },
): WorkspaceServicesResolution {
  const baseServices = useBaseWorkspaceServices();
  // 稳定工作区 identity 属于当前后端；只有显式旧远程目标才需要拒绝路由。
  const legacyRemoteTarget = Boolean(preferredRemoteSessionId?.trim() || remoteTarget);
  const rpcReady = Boolean(options?.forceUnscoped) || !legacyRemoteTarget;
  const services = rpcReady
    ? (options?.unscopedServices ?? baseServices)
    : getDisconnectedRemoteServices();
  return useMemo(() => ({ services, rpcReady }), [rpcReady, services]);
}

export function useWorkspaceServices(
  workspacePath: string | null | undefined,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
  remoteTarget?: unknown,
  options?: { unscopedServices?: IServiceAccessor; forceUnscoped?: boolean },
): IServiceAccessor {
  return useWorkspaceServicesResolution(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
    remoteTarget,
    options,
  ).services;
}
