// 按 Web 连接身份与 workspaceKey 复用 conversation 连接（引用计数 + keep-warm）。
// 同一 Web 连接的同一工作区共享 transport 和 SessionDataLayer
// （同 session 多 pane 由 layer 内 per-topic refCount 单订阅收口，不触发 CLI
// (connectionId, topic) 重订阅替换）。连接层还负责：
// - 30s keep-warm：refCount 归零不立即 dispose（防 pane 关/开、布局调整抖动）；
// - 同一 Web 连接身份下，重连保留 layer/transport 并单向激活最新 accessor；
//   无连接身份时，service 换代重建条目。
import {
  createAgentConversationTransport,
  type ConversationV4AgentService,
} from "@/v4/agentConversationTransport.js";
import { remoteAgentServiceGeneration } from "@/lib/remoteAgentServiceGeneration.js";
import { ReplaceableConversationTransport } from "@/v4/replaceableConversationTransport.js";
import { SessionDataLayer } from "@/v4/sessionDataLayer.js";
import type { ConversationTransport } from "@/v4/transport.js";
import { logger } from "@/logger.js";

/** 注册表需要的 agentService 窄面（= conversation transport 的依赖面，便于测试注入）。 */
export type WorkspaceConnectionAgentService = ConversationV4AgentService;

export interface WorkspaceConnectionScope {
  /** = pane 绑定的 primary workspace（连接路由键）。 */
  workspacePath: string;
  workspaceIdentity?: string;
  /** Browser base connection survives accessor replacement only for the same operator. */
  baseConnectionId?: string;
}

/** pane 持有的连接租约；release 幂等。 */
/**
 * useSavedWorkflowLauncher 的推断返回类型包含 lease，声明生成要求保留可命名的导出。
 * @lintignore
 */
export interface WorkspaceConnectionLease {
  readonly layer: SessionDataLayer;
  readonly transport: ConversationTransport;
  /** React commit 后激活本租约携带的新 service；无连接身份时不换代。 */
  activateServiceReplacement(): void;
  release(): void;
}

interface RegistryEntry {
  key: string;
  agentService: WorkspaceConnectionAgentService;
  agentServiceGeneration: number;
  transport: ConversationTransport;
  replaceableTransport: ReplaceableConversationTransport | null;
  layer: SessionDataLayer;
  refCount: number;
  keepWarmTimer: ReturnType<typeof setTimeout> | null;
  /** 无连接身份的旧条目被换代移出注册表后，最后一个租约释放时立即 dispose。 */
  stale: boolean;
}

const registry = new Map<string, RegistryEntry>();

/** 引用归零后延迟释放窗口（ms）；与 SessionDataLayer keep-warm 同标度。 */
export const WORKSPACE_CONNECTION_KEEP_WARM_MS = 30_000;

/** 同一操作者的 Web 连接换代复用相同的工作区条目。 */
export function buildWorkspaceConnectionKey(scope: WorkspaceConnectionScope): string {
  const workspaceKey = scope.workspaceIdentity?.trim() || scope.workspacePath;
  return scope.baseConnectionId
    ? JSON.stringify([scope.baseConnectionId, workspaceKey])
    : `__base__ ${workspaceKey}`;
}

function disposeEntry(entry: RegistryEntry): void {
  if (entry.keepWarmTimer !== null) {
    clearTimeout(entry.keepWarmTimer);
    entry.keepWarmTimer = null;
  }
  entry.layer.dispose();
}

function releaseEntry(entry: RegistryEntry): void {
  entry.refCount -= 1;
  if (entry.refCount > 0) {
    logger.lifecycle.info("v4 workspace connection lease released", {
      event: "v4.workspace_connection.release",
      key: entry.key,
      module: "ui.v4.workspace_connection_registry",
      refCount: entry.refCount,
      status: "completed",
    });
    return;
  }
  if (entry.stale) {
    // 已被换代移出注册表：没有新消费者会再命中它，立即清场。
    disposeEntry(entry);
    logger.lifecycle.info("v4 stale workspace connection disposed", {
      event: "v4.workspace_connection.stale_disposed",
      key: entry.key,
      module: "ui.v4.workspace_connection_registry",
      refCount: 0,
      status: "completed",
    });
    return;
  }
  // 关 pane ≠ 停 session：延迟退订，防布局抖动期间反复建连/退订。
  entry.keepWarmTimer = setTimeout(() => {
    if (registry.get(entry.key) === entry) {
      registry.delete(entry.key);
    }
    entry.layer.dispose();
    logger.lifecycle.info("v4 workspace connection keep-warm expired", {
      event: "v4.workspace_connection.keep_warm_expired",
      key: entry.key,
      module: "ui.v4.workspace_connection_registry",
      refCount: 0,
      status: "completed",
    });
  }, WORKSPACE_CONNECTION_KEEP_WARM_MS);
  logger.lifecycle.info("v4 workspace connection lease released", {
    event: "v4.workspace_connection.release",
    keepWarmMs: WORKSPACE_CONNECTION_KEEP_WARM_MS,
    key: entry.key,
    module: "ui.v4.workspace_connection_registry",
    refCount: 0,
    status: "keep_warm",
  });
}

/** 租用已接纳工作区的共享连接；拒绝目标不创建连接条目。 */
export function acquireWorkspaceConnection(
  scope: WorkspaceConnectionScope,
  agentService: WorkspaceConnectionAgentService,
): WorkspaceConnectionLease {
  const key = buildWorkspaceConnectionKey(scope);
  const existing = registry.get(key);
  const incomingServiceGeneration = remoteAgentServiceGeneration(agentService);
  const replaceable = Boolean(scope.baseConnectionId);
  let entry: RegistryEntry;
  if (existing && (existing.agentService === agentService || replaceable)) {
    existing.refCount += 1;
    if (existing.keepWarmTimer !== null) {
      clearTimeout(existing.keepWarmTimer);
      existing.keepWarmTimer = null;
    }
    entry = existing;
    logger.lifecycle.info("v4 workspace connection reused", {
      event: "v4.workspace_connection.reused",
      isRemote: replaceable,
      key,
      module: "ui.v4.workspace_connection_registry",
      refCount: entry.refCount,
      serviceGeneration: incomingServiceGeneration,
      status: "completed",
    });
  } else {
    if (existing) {
      // 本地 __base__ service 换代：旧条目失效移出；
      // 无人持有则立即清场，有人持有则由其末位 release 清场。
      registry.delete(key);
      existing.stale = true;
      if (existing.refCount <= 0) {
        disposeEntry(existing);
      }
    }
    const initialTransport = createAgentConversationTransport(agentService, {
      workspacePath: scope.workspacePath,
      ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
    });
    const replaceableTransport = replaceable
      ? new ReplaceableConversationTransport(initialTransport)
      : null;
    const transport = replaceableTransport ?? initialTransport;
    entry = {
      key,
      agentService,
      agentServiceGeneration: incomingServiceGeneration,
      transport,
      replaceableTransport,
      layer: new SessionDataLayer({ transport }),
      refCount: 1,
      keepWarmTimer: null,
      stale: false,
    };
    registry.set(key, entry);
    logger.lifecycle.info("v4 workspace connection created", {
      event: "v4.workspace_connection.created",
      isRemote: replaceable,
      key,
      module: "ui.v4.workspace_connection_registry",
      refCount: 1,
      serviceGeneration: incomingServiceGeneration,
      status: "completed",
    });
  }

  let released = false;
  return {
    layer: entry.layer,
    transport: entry.transport,
    activateServiceReplacement: () => {
      if (
        released ||
        !replaceable ||
        entry.stale ||
        entry.agentService === agentService ||
        incomingServiceGeneration <= entry.agentServiceGeneration
      ) {
        return;
      }
      // acquire 会在 React render 中执行；若此处同步 replace，会经
      // runtimeRestart listener 更新外部 store 并发起 RPC。租约只捕获候选 service，
      // 由 Provider 在 commit 阶段显式激活，同时保持 generation 单向切换。
      if (!entry.replaceableTransport) {
        throw new Error("会话连接缺少可换代 transport");
      }
      entry.agentService = agentService;
      entry.agentServiceGeneration = incomingServiceGeneration;
      entry.replaceableTransport.replace(
        createAgentConversationTransport(agentService, {
          workspacePath: scope.workspacePath,
          ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
        }),
      );
    },
    release: () => {
      if (released) return;
      released = true;
      releaseEntry(entry);
    },
  };
}

/** 仅测试/诊断用：当前注册的连接条目数（不含已换代失效、待存量租约释放的旧条目）。 */
export function workspaceConnectionRegistrySize(): number {
  return registry.size;
}

/** 永久删除不能等待 keep-warm；只清同一 endpoint + workspace 的对应会话。 */
export function forgetWorkspaceConversation(
  scope: WorkspaceConnectionScope,
  sessionId: string,
): void {
  registry.get(buildWorkspaceConnectionKey(scope))?.layer.forget(sessionId);
}
