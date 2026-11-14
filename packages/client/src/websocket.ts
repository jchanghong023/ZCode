import {
  Emitter,
  VSBuffer,
  SocketProtocol,
  ChannelClient,
  type IMessagePassingProtocol,
  type ISocket,
} from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import { RemoteServiceAccess } from "./remoteServiceAccess.js";

export interface WebSocketConnectionCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

interface WebSocketConnectionOptions {
  onClose?: (event: WebSocketConnectionCloseEvent) => void;
  onOpenSocket?: (socket: WebSocket) => void;
}

function wrapBrowserWebSocket(ws: WebSocket): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();

  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", (e) => {
    onData.fire(VSBuffer.wrap(new Uint8Array(e.data as ArrayBuffer)));
  });
  ws.addEventListener("close", () => {
    onClose.fire();
    onEnd.fire();
  });
  ws.addEventListener("error", () => {
    onClose.fire();
    onEnd.fire();
  });

  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write(buffer: VSBuffer) {
      // 修复原因（P0-1）：非 OPEN 状态静默丢弃会让断线后的请求永久挂起；
      // 抛错沿 ChannelClient.sendRequest 的失败路径变成请求 rejection。
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not open");
      }
      ws.send(buffer.buffer as Uint8Array<ArrayBuffer>);
    },
    end() {
      ws.close();
    },
    drain() {
      return Promise.resolve();
    },
    dispose() {
      ws.close();
    },
  };
}

export function connectViaWebSocket(
  wsUrl: string,
  options?: WebSocketConnectionOptions,
): Promise<IServiceAccessor> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;

    ws.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        reject(new Error(`WebSocket connection failed: ${wsUrl}`));
      }
    });
    ws.addEventListener("close", (event) => {
      options?.onClose?.({
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });

      if (!settled) {
        settled = true;
        reject(
          new Error(
            event.reason
              ? `WebSocket closed before ready: ${event.reason}`
              : `WebSocket closed before ready (${event.code})`,
          ),
        );
      }
    });

    ws.addEventListener("open", () => {
      options?.onOpenSocket?.(ws);
      const socket = wrapBrowserWebSocket(ws);
      const protocol = new SocketProtocol(socket);
      const client = new ChannelClient(protocol);
      // 修复原因（P0-1）：Initialize 超时/半开连接时 client 自行 dispose，但 ws 可能
      // 仍是 OPEN，close 事件不会到来。终结必须关闭底层 socket，让调用方的 onClose
      // 生命周期（重连管理器）可达。
      client.onDidClose(() => {
        ws.close();
      });
      client.onDidInitialize(() => {
        if (!settled) {
          settled = true;
          resolve(new RemoteServiceAccess(client));
        }
      });
    });
  });
}

export function connectViaProtocol(
  protocol: IMessagePassingProtocol,
  options: { windowProjectDirectory?: boolean; signal?: AbortSignal } = {},
): IServiceAccessor {
  const client = new ChannelClient(protocol);
  // bridge 只释放传输时，旧 RPC 会永久等待，发送前已 claim 的草稿也无法进入失败恢复。
  // 生命周期由调用方持有；终结时复用 ChannelClient 的统一拒绝，包括等待 Initialize 的请求。
  const dispose = () => client.dispose();
  if (options.signal?.aborted) dispose();
  else options.signal?.addEventListener("abort", dispose, { once: true });
  return new RemoteServiceAccess(client, options);
}
