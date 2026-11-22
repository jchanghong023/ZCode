import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CommandAck,
  CommandEnvelope,
  V4AttachmentPutParams,
  V4AttachmentPutResult,
} from "@zcode/shared/zcode-protocol-v4";
import type { IServiceAccessor } from "@zcode/services";
import { ServiceProvider } from "@/hooks/useServices.js";
import {
  useWorkspaceServicesResolution,
  type WorkspaceServicesResolution,
} from "@/hooks/useWorkspaceServices.js";
import { RemoteConversationAvailability } from "@/v4/RemoteConversationAvailability.js";
import { createAgentConversationTransport } from "@/v4/agentConversationTransport.js";
import type { ConversationAttachmentReadParams, ConversationTransport } from "@/v4/transport.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutStore.js";
import { SessionDataLayer } from "@/v4/sessionDataLayer.js";
import { acquireWorkspaceConnection } from "@/v4/workspaceConnectionRegistry.js";
import type { AttachmentUploadOptions } from "@/v4/attachmentUploadTransaction.js";

export interface V4ConversationContextValue {
  layer: SessionDataLayer;
  sendCommand(
    envelope: CommandEnvelope,
    context?: { projectId?: string | null },
  ): Promise<CommandAck>;
  /** UI 高层 put 语义；transport 内部只走 begin/chunk/commit/abort。 */
  attachmentPut(
    params: V4AttachmentPutParams,
    options?: AttachmentUploadOptions,
  ): Promise<V4AttachmentPutResult>;
  attachmentRead(
    params: ConversationAttachmentReadParams,
  ): ReturnType<ConversationTransport["attachmentRead"]>;
  attachmentReadRange(
    params: Parameters<ConversationTransport["attachmentReadRange"]>[0],
  ): ReturnType<ConversationTransport["attachmentReadRange"]>;
  onRuntimeRestart?(listener: () => void): () => void;
  /**
   * 承载 transport 暴露 runtime 存活态时才存在（见 ConversationTransport.onRuntimeLifecycle）。
   * unavailable 在 workspace-dispose 当场到达，是草稿预热重建唯一可依赖的换代信号。
   */
  onRuntimeLifecycle?(listener: (state: "available" | "unavailable") => void): () => void;
}

// 导出 context 本体：静态回放视图用静态 transport 自己
// 装配 value 后直接 Provider 注入，不经 V4ConversationProvider 的 workspace 解析链路。
export const V4ConversationContext = createContext<V4ConversationContextValue | null>(null);

/** A browser-owned base accessor can be replaced without changing session authority. */
export const V4BaseConnectionContext = createContext<{
  key: string;
  available: boolean;
} | null>(null);

export interface V4ConversationProviderProps {
  workspacePath: string;
  workspaceIdentity?: string;
  children: ReactNode;
  /** 显式传入才保留当前会话；未传的侧面板仍在断线时卸载。null 表示草稿。 */
  sessionId?: string | null;
  unavailableFallback?: ReactNode;
  disconnectedBanner?: ReactNode;
}

function useRetainedReadyResolution(
  workspaceKey: string,
  resolution: WorkspaceServicesResolution,
  retain: boolean,
) {
  const [retained, setRetained] = useState<{
    key: string;
    resolution: WorkspaceServicesResolution;
  } | null>(null);
  // 已挂载的数据层本身就是内容 owner。只保留其服务引用，不复制 snapshot；换项目或首次
  // 挂回前没有 ready 引用，仍由原 rpcReady 门禁阻止远端订阅和本地 fallback。
  // 未声明会话身份的侧面板不留存，避免其 debounce 查询在断线后继续调用旧服务。
  if (
    retain &&
    resolution.rpcReady &&
    (retained?.key !== workspaceKey ||
      retained.resolution.services !== resolution.services ||
      retained.resolution.remoteSessionId !== resolution.remoteSessionId)
  ) {
    setRetained({ key: workspaceKey, resolution });
  } else if (retained && (!retain || (!resolution.rpcReady && retained.key !== workspaceKey))) {
    setRetained(null);
  }
  return resolution.rpcReady
    ? resolution
    : retain && retained?.key === workspaceKey
      ? retained.resolution
      : null;
}

function ReadyV4ConversationProvider({
  workspacePath,
  workspaceIdentity,
  children,
  services,
}: V4ConversationProviderProps & {
  services: IServiceAccessor;
}) {
  const { zcodeAgentService } = services;
  const bundle = useMemo(() => {
    const transport = createAgentConversationTransport(zcodeAgentService, {
      workspacePath,
      workspaceIdentity,
    });
    const layer = new SessionDataLayer({ transport });
    return {
      layer,
      sendCommand: (envelope: CommandEnvelope, context?: { projectId?: string | null }) =>
        transport.sendCommand(envelope, context),
      attachmentPut: (params: V4AttachmentPutParams, options?: AttachmentUploadOptions) =>
        transport.attachmentPut(params, options),
      attachmentRead: (params) => transport.attachmentRead(params),
      attachmentReadRange: (params) => transport.attachmentReadRange(params),
      onRuntimeRestart: transport.onRuntimeRestart?.bind(transport),
      onRuntimeLifecycle: transport.onRuntimeLifecycle?.bind(transport),
    } satisfies V4ConversationContextValue;
  }, [workspacePath, workspaceIdentity, zcodeAgentService]);

  useEffect(() => {
    return () => {
      bundle.layer.dispose();
    };
  }, [bundle]);

  return (
    <ServiceProvider services={services}>
      <V4ConversationContext.Provider value={bundle}>{children}</V4ConversationContext.Provider>
    </ServiceProvider>
  );
}

/** 每个 workspace 一条 host 连接 + 一个 SessionDataLayer。 */
export function V4ConversationProvider({
  workspacePath,
  workspaceIdentity,
  children,
  sessionId,
  unavailableFallback,
  disconnectedBanner,
}: V4ConversationProviderProps) {
  const resolution = useWorkspaceServicesResolution(workspacePath, undefined, workspaceIdentity);
  const ready = useRetainedReadyResolution(
    `${workspaceIdentity?.trim() || workspacePath}\0${sessionId ?? "__draft__"}`,
    resolution,
    sessionId !== undefined,
  );
  if (!ready) {
    return unavailableFallback ?? null;
  }

  return (
    <ReadyV4ConversationProvider
      workspacePath={workspacePath}
      workspaceIdentity={workspaceIdentity}
      services={ready.services}
    >
      <RemoteConversationAvailability available={resolution.rpcReady} banner={disconnectedBanner}>
        {children}
      </RemoteConversationAvailability>
    </ReadyV4ConversationProvider>
  );
}

export function useV4Conversation(): V4ConversationContextValue {
  const ctx = useContext(V4ConversationContext);
  if (!ctx) {
    throw new Error("useV4Conversation 必须在 V4ConversationProvider 内使用");
  }
  return ctx;
}

/**
 * 有没有会话上下文可用。给那些**可以**在没有会话的宿主里渲染的组件（静态渲染、回放、
 * 转录里的完成卡）决定要不要挂上取数的那一层——挂了就得有上下文，没有就画冷态。
 */
export function useHasV4Conversation(): boolean {
  return useContext(V4ConversationContext) !== null;
}

export interface V4PaneConversationProviderProps {
  /** pane 绑定的 primary workspace。 */
  scope: PaneWorkspaceScope;
  children: ReactNode;
  /** 显式传入才保留当前会话；未传的侧面板仍在断线时卸载。null 表示草稿。 */
  sessionId?: string | null;
  unavailableFallback?: ReactNode;
  disconnectedBanner?: ReactNode;
}

/**
 * per-pane 数据面：连接从 workspaceConnectionRegistry 租用
 * （同 endpoint+workspaceKey 的 pane 共享一条 transport + SessionDataLayer，
 * refCount + 30s keep-warm），并把 pane 自己的 services 注入子树——附件上传、
 * sessions-index 守卫等 hook 用 pane 的 accessor，不误用 shell 当前 workspace 的。
 *
 * 当前后端的稳定 workspaceIdentity 只区分数据，直接使用根 services 挂载数据层；
 * 仅显式旧远程元数据在 attachment 尚未注册时保持 remote-waiting，避免误投当前后端。
 * 重连 ready 后 services 换新引用 → 注册表保持原 layer/transport 身份，
 * 并在 commit 阶段单向激活最新 proxy，不为 pane 另起独立 runtime。
 */
export function V4PaneConversationProvider({
  scope,
  children,
  sessionId,
  unavailableFallback,
  disconnectedBanner,
}: V4PaneConversationProviderProps) {
  const baseConnection = useContext(V4BaseConnectionContext);
  const targetResolution = useWorkspaceServicesResolution(
    scope.workspacePath,
    scope.remoteSessionId ?? null,
    scope.workspaceIdentity ?? null,
  );
  const ready = useRetainedReadyResolution(
    `${scope.workspaceIdentity?.trim() || scope.workspacePath}\0${sessionId ?? "__draft__"}`,
    targetResolution,
    sessionId !== undefined,
  );
  const resolvedScope = useMemo<PaneWorkspaceScope>(
    () => ({
      workspacePath: scope.workspacePath,
      ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
      ...(ready?.remoteSessionId ? { remoteSessionId: ready.remoteSessionId } : {}),
    }),
    [scope.workspaceIdentity, scope.workspacePath, ready?.remoteSessionId],
  );
  if (!ready) {
    return unavailableFallback ?? null;
  }

  // 恢复中的远端 pane 可能只有 workspaceIdentity。resolver 已解析出真实
  // remoteSessionId 后若仍把原 scope 传给 registry，会以 __base__ 和远端 endpoint
  // 各建一份数据层，终态可能落到非可见 store。ready 后统一使用解析后的 scope。
  return (
    <ReadyV4PaneConversationProvider
      scope={resolvedScope}
      services={ready.services}
      baseConnectionId={baseConnection?.key}
    >
      <RemoteConversationAvailability
        available={targetResolution.rpcReady && (baseConnection?.available ?? true)}
        banner={disconnectedBanner}
      >
        {children}
      </RemoteConversationAvailability>
    </ReadyV4PaneConversationProvider>
  );
}

function ReadyV4PaneConversationProvider({
  scope,
  services,
  baseConnectionId,
  children,
}: Pick<V4PaneConversationProviderProps, "scope" | "children"> & {
  services: IServiceAccessor;
  baseConnectionId?: string;
}) {
  const agentService = services.zcodeAgentService;

  // 与 V4ConversationProvider 相同的 useMemo 同步建连模式（renderer 无 StrictMode，
  // memo 双调不存在）；dep 变化时先建新租约再在 effect cleanup 释放旧租约——
  // 同 key 时 refCount 不落零，keep-warm 兜住跨 key 抖动。
  const bundle = useMemo(() => {
    const lease = acquireWorkspaceConnection(
      {
        workspacePath: scope.workspacePath,
        ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
        ...(scope.remoteSessionId ? { remoteSessionId: scope.remoteSessionId } : {}),
        baseConnectionId,
      },
      agentService,
    );
    return {
      lease,
      value: {
        layer: lease.layer,
        sendCommand: (envelope: CommandEnvelope, context?: { projectId?: string | null }) =>
          lease.transport.sendCommand(envelope, context),
        attachmentPut: (params: V4AttachmentPutParams, options?: AttachmentUploadOptions) =>
          lease.transport.attachmentPut(params, options),
        attachmentRead: (params) => lease.transport.attachmentRead(params),
        attachmentReadRange: (params) => lease.transport.attachmentReadRange(params),
        onRuntimeRestart: lease.transport.onRuntimeRestart?.bind(lease.transport),
        onRuntimeLifecycle: lease.transport.onRuntimeLifecycle?.bind(lease.transport),
      } satisfies V4ConversationContextValue,
    };
  }, [
    agentService,
    baseConnectionId,
    scope.workspacePath,
    scope.workspaceIdentity,
    scope.remoteSessionId,
  ]);

  useLayoutEffect(() => {
    // acquire 发生在 render，只负责稳定租约；远端 proxy 换代引发的 store 更新和
    // 重订阅必须等到 commit，避免在渲染阶段同步更新现有 pane。
    bundle.lease.activateRemoteService();
  }, [bundle]);

  useEffect(() => {
    return () => {
      bundle.lease.release();
    };
  }, [bundle]);

  return (
    <ServiceProvider services={services}>
      <V4ConversationContext.Provider value={bundle.value}>
        {children}
      </V4ConversationContext.Provider>
    </ServiceProvider>
  );
}
