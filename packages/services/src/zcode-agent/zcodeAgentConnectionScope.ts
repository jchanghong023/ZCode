/* eslint-disable max-lines -- V4 conversation 的 connection ownership 生命周期集中在单一 facade。 */
// V4 connection-scoped service facade：每个 RPC attachment 独立持有 subscription
// ownership；base service 仍只转发 CLI 事实，不在 host/main/relay 复制业务状态。
import { z } from "zod";
import { Emitter, type Event, type IDisposable } from "@zcode/rpc";
import {
  V4_WIRE_PROTOCOL_VERSION,
  clientHelloSchema,
  clientSupportsWorkflowRunDeltas,
  conversationResyncParamsSchema,
  conversationTopic,
  projectWebCommandAck,
  webClientHelloSchema,
  type ConversationTopicWireCandidate,
  type HelloMessage,
} from "@zcode/shared/zcode-protocol-v4";
import type {
  IZCodeAgentService,
  WebAIReqAgent,
  ZCodeAgentCommandsQueryParams,
  ZCodeAgentConversationResyncParams,
  ZCodeAgentConversationUnsubscribeParams,
  ZCodeAgentRuntimePolicy,
  ZCodeAgentWorkspaceTarget,
} from "./zcodeAgent.js";

export type ZCodeAgentV4ClientMode = "desktop-continuous" | "web-remote-replayable";

export interface ZCodeAgentV4ConnectionContext {
  connectionId: string;
  clientMode: ZCodeAgentV4ClientMode;
  role?: "terminal-client" | "trusted-host-relay";
  /**
   * 这条连接的 clientHello 声明了认得 `workflowRun.*` 键级增量。与 `clientMode` 同族：
   * 由本 facade 从握手事实写出，订阅入参里的同名字段一律被清掉——一个客户端认不认得增量
   * 是**连接**的事实，不是某一次订阅可以自选的口味。缺席 = 按旧消费者处理。
   */
  workflowRunDeltas?: boolean;
  historyFirst?: boolean;
}

const TRUSTED_CONNECTION_FIELD = "__zcodeTrustedV4Connection";
const TRUSTED_UNSUBSCRIBE_ROUTE_FIELD = "__zcodeTrustedV4UnsubscribeRoute";

type TrustedConnectionCarrier = {
  [TRUSTED_CONNECTION_FIELD]?: ZCodeAgentV4ConnectionContext;
};

export interface TrustedZCodeAgentV4UnsubscribeRoute {
  topic: string;
  connectionId: string;
}

type TrustedUnsubscribeRouteCarrier = {
  [TRUSTED_UNSUBSCRIBE_ROUTE_FIELD]?: TrustedZCodeAgentV4UnsubscribeRoute;
};

export function readTrustedZCodeAgentV4UnsubscribeRoute(
  value: unknown,
): TrustedZCodeAgentV4UnsubscribeRoute | null {
  if (typeof value !== "object" || value === null) return null;
  const route = (value as TrustedUnsubscribeRouteCarrier)[TRUSTED_UNSUBSCRIBE_ROUTE_FIELD];
  if (!route || typeof route.topic !== "string" || typeof route.connectionId !== "string") {
    return null;
  }
  return route;
}

/**
 * 该字段只在 host facade → base/remote service proxy 之间传递；facade 会覆盖所有
 * UI 入参中的同名字段，因此 renderer/mobile 不能伪造可信连接模式。
 */
export function readTrustedZCodeAgentV4Connection(
  value: unknown,
): ZCodeAgentV4ConnectionContext | null {
  if (typeof value !== "object" || value === null) return null;
  const context = (value as TrustedConnectionCarrier)[TRUSTED_CONNECTION_FIELD];
  if (!context || typeof context.connectionId !== "string") return null;
  if (
    context.clientMode !== "desktop-continuous" &&
    context.clientMode !== "web-remote-replayable"
  ) {
    return null;
  }
  return {
    connectionId: context.connectionId,
    clientMode: context.clientMode,
    // 只认 true：缺席与 false 都是「旧消费者」，键在场与否是下游读端的判据。
    ...(context.workflowRunDeltas === true ? { workflowRunDeltas: true } : {}),
    ...(context.historyFirst === true ? { historyFirst: true } : {}),
  };
}

function withTrustedConnection<T extends object>(
  value: T,
  context: ZCodeAgentV4ConnectionContext,
): T {
  const forwarded: Record<string, unknown> = {
    ...(value as unknown as Record<string, unknown>),
  };
  // 共享 service 暴露在多个 RPC port 上时，调用方曾能传 profile，且所有
  // port 共用 workspace fan-out。facade 必须先清掉所有可伪造字段，再写 host 真值。
  delete forwarded[TRUSTED_CONNECTION_FIELD];
  delete forwarded["connectionId"];
  delete forwarded["clientMode"];
  delete forwarded["deliveryProfile"];
  delete forwarded["subscriberScope"];
  // 与 clientMode 同族的可信位：UI 面的 subscribe 不能自己挑增量编码。
  delete forwarded["workflowRunDeltas"];
  delete forwarded["pluginDiscoveryUi"];
  delete forwarded["historyFirst"];
  forwarded[TRUSTED_CONNECTION_FIELD] = context;
  return forwarded as T;
}

function withTrustedUnsubscribeRoute<T extends object>(
  value: T,
  route: TrustedZCodeAgentV4UnsubscribeRoute,
): T {
  const forwarded = {
    ...(value as unknown as Record<string, unknown>),
  };
  delete forwarded[TRUSTED_UNSUBSCRIBE_ROUTE_FIELD];
  forwarded[TRUSTED_UNSUBSCRIBE_ROUTE_FIELD] = route;
  return forwarded as T;
}

const webConversationFrameParamsSchema = z.strictObject({
  workspacePath: z.string(),
  workspaceIdentity: z.string().optional(),
});
const webConversationUnsubscribeParamsSchema = webConversationFrameParamsSchema.extend({
  subscriptionId: z.string(),
});
const webConversationResyncParamsSchema = conversationResyncParamsSchema.extend(
  webConversationFrameParamsSchema.shape,
);

function validateWebConversationParams(
  schema: z.ZodType,
  params: unknown,
  operation: "帧监听" | "恢复" | "退订",
): void {
  // 只校验，不使用 schema 裁剪过的 subscriptionId 或 logEpoch：归属和恢复仍使用原值。
  const result = schema.safeParse(params);
  if (result.success) return;
  const extraFields = result.error.issues.find(
    (issue) => issue.code === "unrecognized_keys" && issue.path.length === 0,
  );
  const keys = extraFields?.code === "unrecognized_keys" ? extraFields.keys : [];
  if (operation !== "帧监听" && keys.includes("runtimePolicy")) {
    throw new Error("fault.conversation.runtimePolicyUnsupported");
  }
  const message = keys.includes("remoteSessionId")
    ? `Web 会话${operation}不接收远程宿主会话 ID。`
    : `Web 会话${operation}参数无效。`;
  throw Object.assign(new Error(message), { code: "INVALID_ARGUMENT", publicMessage: true });
}

/** sendText.source 或 createSession.firstInput.source 是 extension（CLI 契约 conversation-input-source.md §2）。 */
function carriesExtensionInputSource(envelope: { type: string; payload: unknown }): boolean {
  const payload =
    envelope.payload && typeof envelope.payload === "object"
      ? (envelope.payload as {
          source?: { kind?: unknown };
          firstInput?: { source?: { kind?: unknown } } | null;
        })
      : undefined;
  if (envelope.type === "sendText") return payload?.source?.kind === "extension";
  if (envelope.type === "createSession") return payload?.firstInput?.source?.kind === "extension";
  return false;
}

function workspaceKey(target: ZCodeAgentWorkspaceTarget): string {
  return target.workspaceIdentity?.trim() || target.workspacePath;
}

function workspaceTarget(target: ZCodeAgentWorkspaceTarget): ZCodeAgentWorkspaceTarget {
  return {
    workspacePath: target.workspacePath,
    ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
  };
}

type SubscriptionKind = "conversation";

interface OwnedSubscription {
  kind: SubscriptionKind;
  ownershipKey: string;
  subscriptionId: string;
  topic: string;
  connectionId: string;
  target: ZCodeAgentWorkspaceTarget;
}

type RoutedTopicFrame = ConversationTopicWireCandidate;

interface PendingOwnership {
  kind: SubscriptionKind;
  target: ZCodeAgentWorkspaceTarget;
  topic: string;
  frames: RoutedTopicFrame[];
  stagedBytes: number;
  overflowReason: string | null;
}

interface RoutedFrameEvent {
  emitter: Emitter<RoutedTopicFrame>;
  upstream: IDisposable;
}

// ACK 窗口只覆盖控制面竞态，不替代 subscriber buffer/resync。这里按帧数和
// JSON 字节双限额暂存，避免异常 peer 在 subscribe pending 期间无限占用 host 内存。
const MAX_PENDING_OWNERSHIP_FRAMES = 1_024;
const MAX_PENDING_OWNERSHIP_BYTES = 32 * 1024 * 1024;
const MAX_DOWNSTREAM_CONNECTION_ID_LENGTH = 256;

function assertConnectionId(connectionId: string): void {
  if (
    connectionId.trim().length === 0 ||
    connectionId.length > MAX_DOWNSTREAM_CONNECTION_ID_LENGTH
  ) {
    throw new Error("fault.connection.invalidConnectionId");
  }
}

function namespaceRelayConnectionId(
  upstreamConnectionId: string,
  downstreamConnectionId: string,
): string {
  // 长度前缀消除 `a/b + c` 与 `a + b/c` 这类分隔符碰撞；connectionId 只作
  // opaque route key，不需要业务层解析。
  return `relay:${upstreamConnectionId.length}:${upstreamConnectionId}${downstreamConnectionId.length}:${downstreamConnectionId}`;
}

function frameBytes(frame: RoutedTopicFrame): number {
  return new TextEncoder().encode(JSON.stringify(frame)).byteLength;
}

function deliveryProfileFor(clientMode: ZCodeAgentV4ClientMode): HelloMessage["deliveryProfile"] {
  return clientMode === "desktop-continuous" ? "continuous" : "replayable";
}

function createHello(
  context: ZCodeAgentV4ConnectionContext,
  advertiseDesktopControls: boolean,
  advertiseWorkflowRunDeltas: boolean,
): HelloMessage {
  const continuous = context.clientMode === "desktop-continuous";
  return {
    kind: "hello",
    protocolVersion: V4_WIRE_PROTOCOL_VERSION,
    capabilities: {
      ...(advertiseDesktopControls && {
        workspaceHookReview: true,
        independentPlanState: true,
        genUiContext: true,
      }),
      ...(advertiseWorkflowRunDeltas && { workflowRunDeltas: true }),
      historyFirst: true,
      nativeDialogs: continuous,
      localTerminal: continuous,
      binaryFrames: false,
      compression: "none",
      residentRowsRange: true,
    },
    connectionId: context.connectionId,
    clientMode: context.clientMode,
    deliveryProfile: deliveryProfileFor(context.clientMode),
    serverTime: Date.now(),
    auth: {},
  };
}

type WebScopedMethods = Pick<
  WebAIReqAgent,
  | "attachmentAbortV4"
  | "attachmentBeginV4"
  | "attachmentChunkV4"
  | "attachmentCommitV4"
  | "attachmentReadV4"
  | "conversationRowsRangeV4"
  | "helloConversationV4"
  | "initializeConversationV4"
  | "onDynamicConversationFrame"
  | "queryConversationCommandsV4"
  | "resyncConversationV4"
  | "sendConversationCommandV4"
  | "subscribeConversationV4"
  | "unsubscribeConversationV4"
>;
type WebScopedAgent = Omit<IZCodeAgentService, keyof WebScopedMethods> & WebScopedMethods;

export interface ZCodeAgentConnectionScope<Agent = IZCodeAgentService> {
  readonly service: Agent;
  dispose(): Promise<void>;
}

interface ConnectionScopeOptions {
  allowCommandQueriesAcrossWorkspaces?: boolean;
  advertiseDesktopControls?: boolean;
  advertiseWorkflowRunDeltas?: boolean;
  webProtocol?: boolean;
}

/** 为单个 host/server RPC attachment 建立可信 V4 facade。 */
export function createZCodeAgentConnectionScope(
  base: IZCodeAgentService,
  context: ZCodeAgentV4ConnectionContext,
  options: ConnectionScopeOptions & { webProtocol: true },
): ZCodeAgentConnectionScope<WebScopedAgent>;
export function createZCodeAgentConnectionScope(
  base: IZCodeAgentService,
  context: ZCodeAgentV4ConnectionContext,
  options?: ConnectionScopeOptions & { webProtocol?: false },
): ZCodeAgentConnectionScope;
export function createZCodeAgentConnectionScope(
  base: IZCodeAgentService,
  context: ZCodeAgentV4ConnectionContext,
  options?: ConnectionScopeOptions,
): ZCodeAgentConnectionScope<WebScopedAgent> {
  assertConnectionId(context.connectionId);
  const role = context.role ?? "terminal-client";
  const webProtocol = options?.webProtocol === true;
  const advertiseWorkflowRunDeltas = !webProtocol && options?.advertiseWorkflowRunDeltas !== false;
  const handshakeSchema = webProtocol ? webClientHelloSchema : clientHelloSchema;
  const owned = new Map<string, OwnedSubscription>();
  const routeKeyByOwnership = new Map<string, string>();
  const pendingByOwnership = new Map<string, Set<PendingOwnership>>();
  const routedFrameEvents = new Map<string, RoutedFrameEvent>();
  let disposed = false;
  // trusted relay 已在外层 transport（stdio / Node-only WS role header）完成身份
  // 选择；终端 UI 仍必须走 hello → clientHello。
  let handshakeComplete = role === "trusted-host-relay";
  let helloIssued = role === "trusted-host-relay";
  let boundClientId: string | null = null;
  /** clientHello 里的增量声明；trusted relay 没有自己的 clientHello，只搬运下游的。 */
  let clientWorkflowRunDeltas = false;
  let clientHistoryFirst = false;
  let commandQueryWorkspaceKey: string | null = null;

  const forwardedConnection = (params: unknown): ZCodeAgentV4ConnectionContext => {
    const downstream = readTrustedZCodeAgentV4Connection(params);
    if (role === "trusted-host-relay" && downstream) {
      assertConnectionId(downstream.connectionId);
      return {
        connectionId: namespaceRelayConnectionId(context.connectionId, downstream.connectionId),
        clientMode: downstream.clientMode,
        // 增量位属于**下游那一端**：relay 自己不消费帧，只把下游 clientHello 的声明带上去。
        ...(downstream.workflowRunDeltas === true ? { workflowRunDeltas: true } : {}),
        ...(downstream.historyFirst === true ? { historyFirst: true } : {}),
      };
    }
    return {
      connectionId: context.connectionId,
      clientMode: context.clientMode,
      ...(clientWorkflowRunDeltas ? { workflowRunDeltas: true } : {}),
      ...(clientHistoryFirst ? { historyFirst: true } : {}),
    };
  };

  const assertOpen = () => {
    if (disposed) throw new Error("fault.connection.closed");
  };
  const assertReady = () => {
    assertOpen();
    if (!handshakeComplete) throw new Error("fault.connection.handshakeRequired");
  };
  const routeKey = (
    kind: SubscriptionKind,
    target: ZCodeAgentWorkspaceTarget,
    topic: string,
    subscriptionId: string,
    connectionId: string,
  ) => `${kind}\0${workspaceKey(target)}\0${topic}\0${subscriptionId}\0${connectionId}`;
  const ownershipKey = (kind: SubscriptionKind, target: ZCodeAgentWorkspaceTarget, topic: string) =>
    `${kind}\0${workspaceKey(target)}\0${topic}`;
  const routedEventKey = (kind: SubscriptionKind, target: ZCodeAgentWorkspaceTarget) =>
    `${kind}\0${workspaceKey(target)}`;
  const remember = (subscriptionId: string, entry: OwnedSubscription): void => {
    const key = routeKey(entry.kind, entry.target, entry.topic, subscriptionId, entry.connectionId);
    const previous = routeKeyByOwnership.get(entry.ownershipKey);
    if (previous) owned.delete(previous);
    routeKeyByOwnership.set(entry.ownershipKey, key);
    owned.set(key, entry);
  };
  const findBySubscription = (
    kind: SubscriptionKind,
    target: ZCodeAgentWorkspaceTarget,
    subscriptionId: string,
    expectedRoute: TrustedZCodeAgentV4UnsubscribeRoute | null,
  ): OwnedSubscription | null => {
    const expectedWorkspaceKey = workspaceKey(target);
    const matches = [...owned.values()].filter(
      (entry) =>
        entry.kind === kind &&
        entry.subscriptionId === subscriptionId &&
        workspaceKey(entry.target) === expectedWorkspaceKey &&
        (!expectedRoute ||
          (entry.topic === expectedRoute.topic &&
            entry.connectionId === expectedRoute.connectionId)),
    );
    // terminal UI 只传 subId；若它在同 method/workspace 内碰撞，宁可拒绝猜测。
    // trusted relay 则使用下游 facade 写入的 topic/connection 精确命中。
    return matches.length === 1 ? matches[0]! : null;
  };
  const ownsFrame = (
    kind: SubscriptionKind,
    target: ZCodeAgentWorkspaceTarget,
    frame: { subscriptionId: string; topic: string },
  ) => {
    const expectedWorkspaceKey = workspaceKey(target);
    return [...owned.values()].some(
      (entry) =>
        entry.kind === kind &&
        entry.subscriptionId === frame.subscriptionId &&
        entry.topic === frame.topic &&
        workspaceKey(entry.target) === expectedWorkspaceKey,
    );
  };
  const forwardedUnsubscribeRoute = (
    params: unknown,
  ): TrustedZCodeAgentV4UnsubscribeRoute | null => {
    if (webProtocol || role !== "trusted-host-relay") return null;
    const downstream = readTrustedZCodeAgentV4UnsubscribeRoute(params);
    if (!downstream) return null;
    assertConnectionId(downstream.connectionId);
    return {
      topic: downstream.topic,
      connectionId: namespaceRelayConnectionId(context.connectionId, downstream.connectionId),
    };
  };
  const beginPendingOwnership = (
    kind: SubscriptionKind,
    target: ZCodeAgentWorkspaceTarget,
    topic: string,
  ): PendingOwnership => {
    const pending: PendingOwnership = {
      kind,
      target: workspaceTarget(target),
      topic,
      frames: [],
      stagedBytes: 0,
      overflowReason: null,
    };
    const key = ownershipKey(kind, target, topic);
    const group = pendingByOwnership.get(key) ?? new Set<PendingOwnership>();
    group.add(pending);
    pendingByOwnership.set(key, group);
    return pending;
  };
  const removePendingOwnership = (pending: PendingOwnership): void => {
    const key = ownershipKey(pending.kind, pending.target, pending.topic);
    const group = pendingByOwnership.get(key);
    group?.delete(pending);
    if (group?.size === 0) pendingByOwnership.delete(key);
  };
  const discardPendingOwnership = (pending: PendingOwnership): void => {
    removePendingOwnership(pending);
    pending.frames.length = 0;
    pending.stagedBytes = 0;
    pending.overflowReason = null;
  };
  const stageFrame = (pending: PendingOwnership, frame: RoutedTopicFrame): void => {
    if (pending.overflowReason) return;
    const bytes = frameBytes(frame);
    if (
      pending.frames.length + 1 > MAX_PENDING_OWNERSHIP_FRAMES ||
      pending.stagedBytes + bytes > MAX_PENDING_OWNERSHIP_BYTES
    ) {
      // 旧 ACK staging 超限时 shift 最旧帧，会把一个
      // logical frame 变成永久缺片。溢出必须清空整批并显式失败。
      pending.frames.length = 0;
      pending.stagedBytes = 0;
      pending.overflowReason = "fault.subscription.initialFrameStagingOverflow";
      return;
    }
    pending.frames.push(frame);
    pending.stagedBytes += bytes;
  };
  const routeIncomingFrame = (
    kind: SubscriptionKind,
    target: ZCodeAgentWorkspaceTarget,
    frame: RoutedTopicFrame,
    emitter: Emitter<RoutedTopicFrame>,
  ): void => {
    if (ownsFrame(kind, target, frame)) {
      emitter.fire(frame);
      return;
    }
    const group = pendingByOwnership.get(ownershipKey(kind, target, frame.topic));
    if (!group) return;
    for (const pending of group) stageFrame(pending, frame);
  };
  const routedEvent = <T extends RoutedTopicFrame>(
    kind: SubscriptionKind,
    target: ZCodeAgentWorkspaceTarget,
    source: Event<T>,
  ): Event<T> => {
    const key = routedEventKey(kind, target);
    let route = routedFrameEvents.get(key);
    if (!route) {
      const emitter = new Emitter<RoutedTopicFrame>();
      route = {
        emitter,
        upstream: source((frame) => routeIncomingFrame(kind, target, frame, emitter)),
      };
      routedFrameEvents.set(key, route);
    }
    return route.emitter.event as Event<T>;
  };
  const forget = (entry: OwnedSubscription): void => {
    const key = routeKey(
      entry.kind,
      entry.target,
      entry.topic,
      entry.subscriptionId,
      entry.connectionId,
    );
    owned.delete(key);
    if (routeKeyByOwnership.get(entry.ownershipKey) === key) {
      routeKeyByOwnership.delete(entry.ownershipKey);
    }
  };
  const unsubscribeBase = (
    entry: OwnedSubscription,
    runtimePolicy?: ZCodeAgentRuntimePolicy,
  ): Promise<void> => {
    const params: ZCodeAgentConversationUnsubscribeParams = {
      ...entry.target,
      subscriptionId: entry.subscriptionId,
      ...(runtimePolicy ? { runtimePolicy } : {}),
    };
    const forwarded = withTrustedUnsubscribeRoute(params, {
      topic: entry.topic,
      connectionId: entry.connectionId,
    });
    return base.unsubscribeConversationV4(forwarded);
  };
  const resyncBase = (entry: OwnedSubscription, params: ZCodeAgentConversationResyncParams) => {
    const forwarded = withTrustedUnsubscribeRoute(params, {
      topic: entry.topic,
      connectionId: entry.connectionId,
    });
    return base.resyncConversationV4(forwarded);
  };
  const resyncOwned = (kind: SubscriptionKind, params: ZCodeAgentConversationResyncParams) => {
    assertReady();
    const entry = findBySubscription(
      kind,
      params,
      params.subscriptionId,
      forwardedUnsubscribeRoute(params),
    );
    if (!entry) return Promise.reject(new Error("fault.subscription.notOwned"));
    return resyncBase(entry, params);
  };
  const rememberAfterSubscribe = async (
    subscriptionId: string,
    entry: Omit<OwnedSubscription, "subscriptionId">,
    pending: PendingOwnership,
  ): Promise<void> => {
    removePendingOwnership(pending);
    const complete = { ...entry, subscriptionId };
    if (disposed) {
      // port close 与 subscribe ACK 可并发；迟到 ACK 不能在已关闭 facade
      // 重新登记 owner，必须立即反向 unsubscribe。
      discardPendingOwnership(pending);
      await unsubscribeBase(complete).catch(() => {});
      throw new Error("fault.connection.closed");
    }
    if (pending.overflowReason) {
      const reason = pending.overflowReason;
      discardPendingOwnership(pending);
      await unsubscribeBase(complete).catch(() => {});
      throw new Error(reason);
    }
    remember(subscriptionId, complete);
    const route = routedFrameEvents.get(routedEventKey(entry.kind, entry.target));
    if (!route) return;
    // CLI notification 可能先于 RPC subscribe response 抵达 host。旧实现
    // 直到 await 返回才登记 owner，早帧会被永久丢弃；同 topic 双端 pending 时也不能
    // 猜 owner。ACK 后只释放 ACK subscriptionId 对应帧，保留原到达顺序。
    for (const frame of pending.frames) {
      if (frame.subscriptionId === subscriptionId && ownsFrame(entry.kind, entry.target, frame)) {
        route.emitter.fire(frame);
      }
    }
    pending.frames.length = 0;
    pending.stagedBytes = 0;
  };

  const listRecentChatSessions = base.listRecentChatSessions?.bind(base);
  const overrides: Partial<WebScopedAgent> = {
    async helloConversationV4() {
      assertOpen();
      helloIssued = true;
      if (webProtocol) {
        return {
          kind: "hello",
          protocolVersion: V4_WIRE_PROTOCOL_VERSION,
          capabilities: { historyFirst: true },
        };
      }
      return createHello(
        context,
        options?.advertiseDesktopControls !== false,
        advertiseWorkflowRunDeltas,
      );
    },
    async initializeConversationV4(clientHello) {
      assertOpen();
      if (!helloIssued) throw new Error("fault.connection.helloRequired");
      const parsed = handshakeSchema.parse(clientHello);
      if (boundClientId !== null && boundClientId !== parsed.clientId) {
        throw new Error("fault.connection.clientChanged");
      }
      boundClientId = parsed.clientId;
      clientWorkflowRunDeltas =
        advertiseWorkflowRunDeltas && clientSupportsWorkflowRunDeltas(parsed);
      clientHistoryFirst = parsed.capabilities?.historyFirst === true;
      handshakeComplete = true;
    },
    ...(listRecentChatSessions && {
      async listRecentChatSessions(...args: unknown[]) {
        assertReady();
        if (webProtocol && args.length !== 0) {
          throw Object.assign(new Error("Web 最近会话列表不接收参数。"), {
            code: "INVALID_ARGUMENT",
            publicMessage: true,
          });
        }
        return listRecentChatSessions();
      },
    }),
    async sendConversationCommandV4(params) {
      assertOpen();
      // extension 来源只由扩展网关经 app-control 注入；app-control 直接调
      // 基础 agent 服务，不经任何连接作用域。渲染进程、手机与 relay 的命令都从这里进入，带这个来源就是伪造。
      if (carriesExtensionInputSource(params.envelope)) {
        throw new Error("fault.command.extensionSourceUntrusted");
      }
      if (role === "terminal-client") {
        assertReady();
        if (params.envelope.clientId !== boundClientId) {
          // 旧 facade 未覆盖 command 入口，未握手调用与伪造 clientId 都会
          // 直达 CLI；静默覆盖又会破坏 command 幂等归属，因此明确拒绝不一致。
          throw new Error("fault.command.clientMismatch");
        }
      }
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 会话命令不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      if (webProtocol && "projectId" in params) {
        throw Object.assign(new Error("Web 会话命令不接收项目 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      if (webProtocol && "clientMode" in params) {
        throw Object.assign(new Error("Web 会话命令不接收客户端运行模式。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      if (webProtocol && "workspace" in params.envelope) {
        throw Object.assign(new Error("Web 会话命令只在请求外层接收工作区。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      if (webProtocol && ("inputOrigin" in params.envelope || "ttft" in params.envelope)) {
        throw Object.assign(new Error("Web 会话命令不接收宿主输入来源或本机首字耗时遥测。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      if (webProtocol && "baseLogEpoch" in params.envelope) {
        throw Object.assign(new Error("Web 会话命令不接收定位行命令的日志代次。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      // command 过去只校验 envelope.clientId，却没有像订阅、附件一样注入
      // host 真值，导致 mobile 可伪造顶层 clientMode，且 relay 下游身份在 command 链路丢失。
      // envelope 仍原样透传；可信连接上下文只通过 host 内部 carrier 传给 base service。
      const pending = base.sendConversationCommandV4(
        withTrustedConnection(params, forwardedConnection(params)),
      );
      return webProtocol ? projectWebCommandAck(await pending) : pending;
    },
    async queryConversationCommandsV4(params: ZCodeAgentCommandsQueryParams) {
      assertReady();
      if (webProtocol && "clock" in params) {
        throw Object.assign(new Error("Web 命令回执查询不接收校时字段。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 命令回执查询不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      // 仅目录聊天连接由服务端开启多目录查询；其 owner 逐条校验 actor + workspace。
      // 时钟探测也不改变默认连接的 workspace 绑定。
      if (!params.clock && !options?.allowCommandQueriesAcrossWorkspaces) {
        const requestedWorkspaceKey = workspaceKey(params);
        if (
          commandQueryWorkspaceKey !== null &&
          commandQueryWorkspaceKey !== requestedWorkspaceKey
        ) {
          throw new Error("fault.command.queryForeignWorkspace");
        }
        commandQueryWorkspaceKey = requestedWorkspaceKey;
      }
      const pending = base.queryConversationCommandsV4(
        withTrustedConnection(params, forwardedConnection(params)),
      );
      if (!webProtocol) return pending;
      const { results } = await pending;
      return {
        results: results.map(({ key, result }) => ({
          key,
          result: result === "unknown" ? result : projectWebCommandAck(result),
        })),
      };
    },
    async conversationRowsRangeV4(params) {
      assertReady();
      return base.conversationRowsRangeV4(
        withTrustedConnection(params, forwardedConnection(params)),
      );
    },
    async attachmentBeginV4(params) {
      assertReady();
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 附件初始化不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      const forwarded = forwardedConnection(params);
      const result = await base.attachmentBeginV4(withTrustedConnection(params, forwarded));
      if (result.state === "staging" && disposed) {
        // begin ACK 可能晚于连接关闭；用原连接身份取消迟到的暂存上传。
        await base.attachmentAbortV4(withTrustedConnection(params, forwarded)).catch(() => {});
        throw new Error("fault.connection.closed");
      }
      return result;
    },
    async attachmentReadV4(params) {
      assertReady();
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 附件读取不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      return base.attachmentReadV4(withTrustedConnection(params, forwardedConnection(params)));
    },
    async attachmentChunkV4(params) {
      assertReady();
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 附件分片上传不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      return base.attachmentChunkV4(withTrustedConnection(params, forwardedConnection(params)));
    },
    async attachmentCommitV4(params) {
      assertReady();
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 附件提交不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      const forwarded = forwardedConnection(params);
      return base.attachmentCommitV4(withTrustedConnection(params, forwarded));
    },
    async attachmentAbortV4(params) {
      assertReady();
      if (webProtocol && "remoteSessionId" in params) {
        throw Object.assign(new Error("Web 附件取消不接收远程宿主会话 ID。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      const forwarded = forwardedConnection(params);
      await base.attachmentAbortV4(withTrustedConnection(params, forwarded));
    },
    async subscribeConversationV4(params) {
      assertReady();
      const forwarded = forwardedConnection(params);
      const topic = conversationTopic(params.sessionId);
      const pending = beginPendingOwnership("conversation", params, topic);
      try {
        const result = await base.subscribeConversationV4(withTrustedConnection(params, forwarded));
        await rememberAfterSubscribe(
          result.ack.subscriptionId,
          {
            kind: "conversation",
            ownershipKey: `conversation\0${workspaceKey(params)}\0${topic}\0${forwarded.connectionId}`,
            topic,
            connectionId: forwarded.connectionId,
            target: workspaceTarget(params),
          },
          pending,
        );
        if (!webProtocol) return result;
        const { subscriptionId, mode, logEpoch } = result.ack;
        return { ack: { subscriptionId, mode, logEpoch } };
      } catch (error) {
        discardPendingOwnership(pending);
        throw error;
      }
    },
    async unsubscribeConversationV4(params: ZCodeAgentConversationUnsubscribeParams) {
      if (webProtocol) {
        validateWebConversationParams(webConversationUnsubscribeParamsSchema, params, "退订");
      }
      const entry = findBySubscription(
        "conversation",
        params,
        params.subscriptionId,
        forwardedUnsubscribeRoute(params),
      );
      if (!entry) return;
      forget(entry);
      await unsubscribeBase(entry, params.runtimePolicy);
    },
    async resyncConversationV4(params) {
      if (webProtocol) {
        validateWebConversationParams(webConversationResyncParamsSchema, params, "恢复");
      }
      const result = resyncOwned("conversation", params);
      if (!webProtocol) return result;
      const { ack } = await result;
      return { ack: { subscriptionId: ack.subscriptionId, mode: ack.mode } };
    },
    onDynamicConversationFrame(params) {
      if (webProtocol) {
        validateWebConversationParams(webConversationFrameParamsSchema, params, "帧监听");
      }
      return routedEvent<ConversationTopicWireCandidate>(
        "conversation",
        params,
        base.onDynamicConversationFrame(params),
      );
    },
  };

  const service = new Proxy<WebScopedAgent>(base, {
    get(target, property, receiver) {
      const override = Reflect.get(overrides, property, receiver);
      if (override !== undefined) return override;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return {
    service,
    async dispose() {
      if (disposed) return;
      disposed = true;
      handshakeComplete = false;
      helloIssued = false;
      boundClientId = null;
      clientWorkflowRunDeltas = false;
      const entries = Array.from(owned.values());
      owned.clear();
      routeKeyByOwnership.clear();
      for (const group of pendingByOwnership.values()) {
        for (const pending of group) {
          pending.frames.length = 0;
          pending.stagedBytes = 0;
          pending.overflowReason = null;
        }
      }
      pendingByOwnership.clear();
      for (const route of routedFrameEvents.values()) {
        route.upstream.dispose();
        route.emitter.dispose();
      }
      routedFrameEvents.clear();
      await Promise.allSettled(entries.map((entry) => unsubscribeBase(entry)));
    },
  };
}

// Share RPC 复用同一内部 carrier 写入规则，不能复制一套连接身份拼装。
export { withTrustedConnection as withTrustedZCodeAgentV4Connection };
