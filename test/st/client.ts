import { connectViaWebSocket, type RemoteServiceAccess } from "@zcode/client";
import { connectWebChatAgent } from "@zcode/client/agent";
import {
  BufferReader,
  BufferWriter,
  Emitter,
  Event,
  SocketProtocol,
  VSBuffer,
  deserialize,
  serialize,
} from "@zcode/rpc";
import { ISubagentsService, IZCodeAgentService } from "@zcode/services";
import type {
  AIReqAction,
  AIReqIdentity,
  AIReqRemoteArgs,
  AIReqRemotePath,
  AIReqRemoteResult,
  AIReqWorkflowTarget,
} from "@zcode/services/aireq";
import { config, requireConfig } from "./config.js";

export function unique(label = "st"): string {
  return `${label}-${crypto.randomUUID()}`;
}
function safeError(error: unknown, stage = "request"): Error {
  // SDK 错误可能携带含 token 的完整 URL；只保留阶段，不传播原始 stack/cause。
  const kind = error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed";
  return new Error(`ST ${stage} ${kind} (${unique("trace")})`);
}
async function bounded<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = config.timeoutMs,
  cancel?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try {
            cancel?.();
          } catch {
            /* 取消失败仍由清理验收报告，不抛出未捕获异常。 */
          } finally {
            reject(new Error(`ST 超时：${label}`));
          }
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function wsUrl(identity: AIReqIdentity, token = config.token, pageId?: string): string {
  const url = new URL("/ws", config.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("employeeId", identity.employeeId);
  url.searchParams.set("clientId", identity.clientId);
  if (token) url.searchParams.set("token", token);
  if (pageId !== undefined) url.searchParams.set("pageId", pageId);
  return url.toString();
}
export async function stFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(path, config.baseUrl);
  if (target.origin !== config.baseUrl) throw new Error("ST 配置错误：请求不得离开配置 origin");
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization") && config.token)
    headers.set("Authorization", `Bearer ${config.token}`);
  if (headers.get("Authorization") === "") headers.delete("Authorization");
  try {
    return await fetch(target, {
      ...init,
      headers,
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(config.timeoutMs),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
  } catch (error) {
    throw safeError(error, "HTTP");
  }
}
// ChannelClient logs EventError instead of returning it to the subscriber.
// Probe the raw response on the same transport, without involving SDK member lookup.
const rpcWire = { call: 100, listen: 102, callError: 202, eventError: 205 } as const;
type RpcProbe = (
  kind: "call" | "listen",
  channel: string,
  member: string,
  arg?: unknown,
) => Promise<{ type: number; code?: unknown }>;

export interface STClient {
  services: RemoteServiceAccess;
  identity: AIReqIdentity;
  pageId: string;
  probeRpc: RpcProbe;
  bootstrap(): ReturnType<RemoteServiceAccess["aiReqService"]["bootstrap"]>;
  read(target?: AIReqWorkflowTarget): Promise<AIReqRemoteResult<"readWorkflow">>;
  call<P extends AIReqRemotePath>(path: P, args: AIReqRemoteArgs<P>): Promise<AIReqRemoteResult<P>>;
  command(action: AIReqAction, target?: AIReqWorkflowTarget): Promise<AIReqRemoteResult<"command">>;
  close(): Promise<void>;
}
async function connectSTTransport<T extends object>(
  url: string,
  connect: (url: string) => Promise<T>,
) {
  const sockets: WebSocket[] = [];
  const NativeSocket = globalThis.WebSocket;
  let closing = false;
  const closeSockets = () => {
    closing = true;
    for (const socket of sockets) {
      if (socket.readyState < 2) socket.close();
    }
  };
  // 透传真实构造器，在 CONNECTING 阶段即取得生命周期所有权，不模拟网络数据。
  class TrackedSocket extends NativeSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      sockets.push(this);
      this.addEventListener("open", () => {
        if (closing) this.close();
      });
    }
  }
  let connecting: Promise<T>;
  try {
    globalThis.WebSocket = TrackedSocket;
    connecting = connect(url);
  } catch (error) {
    closeSockets();
    throw safeError(error, "WS construction");
  } finally {
    globalThis.WebSocket = NativeSocket;
  }
  let services: T;
  try {
    services = await bounded(connecting, "WS/RPC initialization", config.timeoutMs, closeSockets);
  } catch (error) {
    closeSockets();
    void connecting.catch(() => {});
    throw safeError(error, "WS/RPC initialization");
  }
  const rpc = async <T>(operation: Promise<T>): Promise<T> => {
    if (closing) throw new Error("ST 客户端已关闭");
    // RPC 业务拒绝的安全 message 是正式可观察面；只清除可能含凭据的内容。
    try {
      return await bounded(operation, "RPC request", config.timeoutMs, closeSockets);
    } catch (error) {
      const message = error instanceof Error ? error.message : "RPC rejected";
      if ((config.token && message.includes(config.token)) || /Bearer\s|[?&]token=/i.test(message))
        throw safeError(error, "RPC");
      throw new Error(message);
    }
  };
  const guardedServices = new Proxy(services, {
    get(target, key, receiver) {
      const service = Reflect.get(target, key, receiver);
      if (!service || typeof service !== "object") return service;
      return new Proxy(service, {
        get(owner, member, nestedReceiver) {
          const method = Reflect.get(owner, member, nestedReceiver);
          if (typeof method !== "function" || String(member).startsWith("on")) return method;
          return (...args: unknown[]) =>
            rpc(Promise.resolve().then(() => Reflect.apply(method, owner, args)));
        },
      });
    },
  });
  let nextProbeId = 1_000_000; // Keep raw correlation IDs clear of this SDK connection's requests.
  const probeRpc: RpcProbe = async (kind, channel, member, arg) => {
    const socket = sockets.at(-1);
    if (socket?.readyState !== NativeSocket.OPEN) throw new Error("ST socket is not open");
    const chunks = new Emitter<VSBuffer>();
    const onMessage = (event: MessageEvent<ArrayBuffer>) =>
      chunks.fire(VSBuffer.wrap(new Uint8Array(event.data)));
    socket.addEventListener("message", onMessage);
    const protocol = new SocketProtocol({
      onData: chunks.event,
      onClose: Event.None,
      onEnd: Event.None,
      write: (data) => socket.send(data.buffer as Uint8Array<ArrayBuffer>),
      end: () => socket.close(),
      drain: () => Promise.resolve(),
      dispose: () => {},
    });
    const id = nextProbeId++;
    try {
      const response = new Promise<{ type: number; code?: unknown }>((resolve) => {
        protocol.onMessage((message) => {
          const reader = new BufferReader(message);
          const [type, responseId] = deserialize(reader) as [number, number?];
          if (responseId !== id) return;
          const body = deserialize(reader) as { code?: unknown } | undefined;
          resolve({ type, code: body?.code });
        });
        const request = new BufferWriter();
        serialize(request, [rpcWire[kind], id, channel, member]);
        serialize(request, arg);
        protocol.send(request.buffer);
      });
      return await bounded(
        response,
        `raw RPC ${channel}.${member}`,
        config.timeoutMs,
        closeSockets,
      );
    } finally {
      socket.removeEventListener("message", onMessage);
      protocol.dispose();
      chunks.dispose();
    }
  };
  async function close() {
    const waits = sockets
      .filter((socket) => socket.readyState !== NativeSocket.CLOSED)
      .map(
        (socket) =>
          new Promise<void>((resolve) =>
            socket.addEventListener("close", () => resolve(), { once: true }),
          ),
      );
    closeSockets();
    await bounded(
      Promise.all(waits).then(() => {}),
      "client socket cleanup",
      Math.min(config.timeoutMs, 3000),
    );
  }
  return { guardedServices, services, close, rpc, probeRpc, isClosing: () => closing };
}

export function connectChatST(clientId = crypto.randomUUID()) {
  const url = new URL("/ws/chat", config.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("clientId", clientId);
  if (config.token) url.searchParams.set("token", config.token);
  return connectSTTransport(url.toString(), async (target) => {
    const { agent, getModelCatalog } = await connectWebChatAgent(target);
    return { zcodeAgentService: agent, modelSelectionService: { getView: getModelCatalog } };
  }).then(({ guardedServices, close, probeRpc }) => ({
    services: guardedServices,
    close,
    clientId,
    probeRpc,
  }));
}

export async function connectST(
  employeeId = config.employeeId,
  clientId = unique("client"),
  // 独立连接默认读取独立页面快照；重连用例显式复用同一 pageId。
  pageId = crypto.randomUUID(),
): Promise<STClient> {
  const identity = {
    employeeId: requireConfig(employeeId, "ST_EMPLOYEE_ID"),
    clientId,
  };
  const { guardedServices, services, close, rpc, probeRpc, isClosing } = await connectSTTransport(
    wsUrl(identity, config.token, pageId),
    connectViaWebSocket,
  );
  const client: STClient = {
    services: guardedServices,
    identity,
    pageId,
    probeRpc,
    bootstrap: () => rpc(services.aiReqService.bootstrap(identity)),
    read: (selection = {}) =>
      rpc(services.aiReqService.call(identity, "readWorkflow", [selection])),
    call: (path, args) => {
      if (isClosing()) throw new Error("ST 客户端已关闭");
      if (path === "command") {
        const action = args[0] as AIReqAction;
        return rpc(services.aiReqService.call(identity, path, args)).catch((error) => {
          throw new Error(`ST command ${action.type}: ${error.message}`, { cause: error });
        });
      }
      return rpc(services.aiReqService.call(identity, path, args));
    },
    async command(action, selection = {}) {
      const { expectedRevision, operationId, ...intent } = action;
      const revision = expectedRevision ?? (await client.read(selection)).view.revision;
      const { projectId, irId } = selection;
      return client.call("command", [
        { ...intent, operationId: operationId ?? unique("operation") },
        {
          ...(projectId !== undefined ? { projectId } : {}),
          ...(irId !== undefined ? { irId } : {}),
        },
        revision,
      ]);
    },
    close,
  };
  return client;
}

export function expectRpcUnavailable(
  probeRpc: RpcProbe,
  kind: "call" | "listen",
  channel: string,
  member: string,
  arg?: unknown,
  missingChannel = false,
) {
  return probeRpc(kind, channel, member, arg).then((reply) => {
    const expected = {
      type: kind === "call" ? rpcWire.callError : rpcWire.eventError,
      code: missingChannel ? "SERVICE_UNAVAILABLE" : "UNSUPPORTED_OPERATION",
    };
    if (reply.type !== expected.type || reply.code !== expected.code)
      throw new Error(`ST expected ${expected.code} from ${kind} ${channel}.${member}`);
  });
}

export async function expectRetiredAgentRpc(
  probeRpc: RpcProbe,
  target: { workspacePath: string; workspaceIdentity?: string; sessionId: string },
) {
  const channel = IZCodeAgentService.channelName;
  const methods = [
    ["syncAppRuntimePreferences", [{ askUserQuestionAutoResolutionEnabled: false }]],
    ["listSessionSubagents", [target]],
    ["supportsConversationQuoteComment", [target]],
    ["conversationPlansV4", [target]],
    ["getSessionLifecycle", [target]],
    ["setConnectionFlowStateV4", [{ workspacePath: target.workspacePath, state: "saturated" }]],
    ["disposeWorkspace", [{ workspacePath: target.workspacePath }]],
    ["disposeAll", []],
  ] as const;
  await Promise.all([
    ...methods.map(([method, args]) =>
      expectRpcUnavailable(probeRpc, "call", channel, method, args),
    ),
    expectRpcUnavailable(probeRpc, "listen", channel, "onDynamicSessionLifecycle", target),
    expectRpcUnavailable(probeRpc, "listen", channel, "onAgentRuntimeRestarted"),
    expectRpcUnavailable(probeRpc, "listen", channel, "onAgentRuntimeLifecycle"),
    expectRpcUnavailable(probeRpc, "call", ISubagentsService.channelName, "list", [target], true),
  ]);
}

export async function waitUntil<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = config.timeoutMs,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await bounded(read(), label, Math.max(1, end - Date.now()));
    if (accept(value)) return value;
    if (Date.now() >= end) throw new Error(`ST 超时：${label}`);
    // 轮询间隔不构成成功证据，只有公开事实满足 accept 才完成。
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, end - Date.now())));
  }
}
