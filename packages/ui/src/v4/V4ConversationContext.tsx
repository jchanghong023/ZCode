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
import type { ConversationAttachmentReadParams, ConversationTransport } from "@/v4/transport.js";
import type { SessionDataLayer } from "@/v4/sessionDataLayer.js";
import { acquireWorkspaceConnection } from "@/v4/workspaceConnectionRegistry.js";
import type { AttachmentUploadOptions } from "@/v4/attachmentUploadTransaction.js";

export interface V4ConversationContextValue {
  layer: SessionDataLayer;
  sendCommand(envelope: CommandEnvelope): Promise<CommandAck>;
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
  onConnectionReplaced?(listener: () => void): () => void;
}

export const V4ConversationContext = createContext<V4ConversationContextValue | null>(null);

/** A browser-owned base accessor can be replaced without changing session authority. */
export const V4BaseConnectionContext = createContext<{
  key: string;
  available: boolean;
} | null>(null);

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
      retained.resolution.services !== resolution.services)
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

export function useV4Conversation(): V4ConversationContextValue {
  const ctx = useContext(V4ConversationContext);
  if (!ctx) {
    throw new Error("useV4Conversation 必须在 V4PaneConversationProvider 内使用");
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
  /** 会话归属的工作区；非空 workspaceIdentity 优先用于隔离。 */
  scope: {
    readonly workspacePath: string;
    readonly workspaceIdentity?: string;
    /** 只用于拒绝旧远程目标，不能作为 Web 连接键。 */
    readonly remoteSessionId?: string;
  };
  children: ReactNode;
  /** 显式传入才保留当前会话；未传的侧面板仍在断线时卸载。null 表示草稿。 */
  sessionId?: string | null;
  unavailableFallback?: ReactNode;
  disconnectedBanner?: ReactNode;
}

/**
 * per-pane 数据面：连接从 workspaceConnectionRegistry 租用
 * （同 Web 连接与 workspaceKey 的 pane 共享一条 transport + SessionDataLayer，
 * refCount + 30s keep-warm），并把当前 services 注入子树——附件上传、
 * sessions-index 守卫等 hook 用 pane 的 accessor，不误用 shell 当前 workspace 的。
 *
 * 当前后端的稳定 workspaceIdentity 只区分数据，直接使用根 services 挂载数据层；
 * 显式旧远程元数据不会回落到根 services。
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
  if (!ready) {
    return unavailableFallback ?? null;
  }

  return (
    <ReadyV4PaneConversationProvider
      scope={scope}
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

  // 依赖变更时先建新租约，再在 effect cleanup 释放旧租约，避免同 key 的 refCount 落零。
  const bundle = useMemo(() => {
    const lease = acquireWorkspaceConnection(
      {
        workspacePath: scope.workspacePath,
        ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
        baseConnectionId,
      },
      agentService,
    );
    return {
      lease,
      value: {
        layer: lease.layer,
        sendCommand: (envelope: CommandEnvelope) => lease.transport.sendCommand(envelope),
        attachmentPut: (params: V4AttachmentPutParams, options?: AttachmentUploadOptions) =>
          lease.transport.attachmentPut(params, options),
        attachmentRead: (params) => lease.transport.attachmentRead(params),
        attachmentReadRange: (params) => lease.transport.attachmentReadRange(params),
        onConnectionReplaced: lease.transport.onConnectionReplaced?.bind(lease.transport),
      } satisfies V4ConversationContextValue,
    };
  }, [agentService, baseConnectionId, scope.workspacePath, scope.workspaceIdentity]);

  useLayoutEffect(() => {
    // acquire 发生在 render，只负责稳定租约；WebSocket 重连后的 accessor 换代会
    // 更新 store 并触发重订阅，必须等到 commit。
    bundle.lease.activateServiceReplacement();
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
