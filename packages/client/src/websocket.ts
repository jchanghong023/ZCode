import { ChannelClient, type IMessagePassingProtocol } from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import { RemoteServiceAccess } from "./remoteServiceAccess.js";
import { connectWebSocketChannel, type WebSocketConnectionOptions } from "./channelWebSocket.js";

export type { WebSocketConnectionCloseEvent } from "./channelWebSocket.js";

export async function connectViaWebSocket(
  wsUrl: string,
  options?: WebSocketConnectionOptions,
): Promise<RemoteServiceAccess> {
  return new RemoteServiceAccess(await connectWebSocketChannel(wsUrl, options));
}

export function connectViaProtocol(
  protocol: IMessagePassingProtocol,
  options: { signal?: AbortSignal } = {},
): IServiceAccessor {
  const client = new ChannelClient(protocol);
  // bridge 只释放传输时，旧 RPC 会永久等待，发送前已 claim 的草稿也无法进入失败恢复。
  // 生命周期由调用方持有；终结时复用 ChannelClient 的统一拒绝，包括等待 Initialize 的请求。
  const dispose = () => client.dispose();
  if (options.signal?.aborted) dispose();
  else options.signal?.addEventListener("abort", dispose, { once: true });
  return new RemoteServiceAccess(client);
}
