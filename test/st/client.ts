import { connectViaWebSocket } from "@zcode/client";
import type { IServiceAccessor } from "@zcode/services";
import type {
  AIReqAction,
  AIReqIdentity,
  AIReqRemoteArgs,
  AIReqRemotePath,
  AIReqRemoteResult,
  AIReqSelection,
} from "@zcode/services/aireq";
import { config, requireConfig } from "./config.js";
import { requireCreatedThisRun } from "./resources.js";

export function unique(label = "st"): string {
  return `${label}-${crypto.randomUUID()}`;
}
export function safeError(error: unknown, stage = "request"): Error {
  // SDK 错误可能携带含 token 的完整 URL；只保留阶段，不传播原始 stack/cause。
  const kind = error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed";
  return new Error(`ST ${stage} ${kind} (${unique("trace")})`);
}
export async function bounded<T>(
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
export function wsUrl(identity: AIReqIdentity, token = config.token): string {
  const url = new URL("/ws", config.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("employeeId", identity.employeeId);
  url.searchParams.set("clientId", identity.clientId);
  if (token) url.searchParams.set("token", token);
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
export interface STClient {
  services: IServiceAccessor;
  identity: AIReqIdentity;
  bootstrap(): ReturnType<IServiceAccessor["aiReqService"]["bootstrap"]>;
  read(selection?: AIReqSelection): Promise<AIReqRemoteResult<"readWorkflow">>;
  call<P extends AIReqRemotePath>(
    path: P,
    args: AIReqRemoteArgs<P>,
    selection?: AIReqSelection,
  ): Promise<AIReqRemoteResult<P>>;
  command(action: AIReqAction, selection?: AIReqSelection): Promise<AIReqRemoteResult<"command">>;
  close(): Promise<void>;
}
export async function connectST(employeeId = config.employeeId): Promise<STClient> {
  const identity = {
    employeeId: requireConfig(employeeId, "ST_EMPLOYEE_ID"),
    clientId: unique("client"),
  };
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
  let connecting: Promise<IServiceAccessor>;
  try {
    globalThis.WebSocket = TrackedSocket;
    connecting = connectViaWebSocket(wsUrl(identity));
  } catch (error) {
    closeSockets();
    throw safeError(error, "WS construction");
  } finally {
    globalThis.WebSocket = NativeSocket;
  }
  let services: IServiceAccessor;
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
  const client: STClient = {
    services: guardedServices,
    identity,
    bootstrap: () => rpc(services.aiReqService.bootstrap(identity)),
    read: (selection = {}) =>
      rpc(services.aiReqService.call(identity, "readWorkflow", [selection], selection)),
    call: (path, args, selection) => {
      if (closing) throw new Error("ST 客户端已关闭");
      if (path === "progress.cleanupBranches")
        requireCreatedThisRun(String(args[0]), String(args[1]));
      if (path === "command") {
        const action = args[0] as AIReqAction;
        if (action.type === "deleteRequirement")
          requireCreatedThisRun(action.projectId, action.irId);
      }
      return rpc(services.aiReqService.call(identity, path, args, selection));
    },
    async command(action, selection = {}) {
      const revision = action.expectedRevision ?? (await client.read(selection)).view.revision;
      const command = {
        ...action,
        operationId: action.operationId ?? unique("operation"),
        expectedRevision: revision,
      };
      return client.call("command", [command, selection, revision], selection);
    },
    async close() {
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
    },
  };
  return client;
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
