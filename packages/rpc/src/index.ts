/**
 * IPC Framework —— 统一导出
 *
 * 公开入口：基础设施、序列化、消息传输、Channel RPC、服务代理与日志中间件。
 */

// 基础设施
export {
  type IDisposable,
  toDisposable,
  DisposableStore,
  Event,
  Emitter,
  Relay,
  EventMultiplexer,
  type CancellationToken,
  CancellationTokenSource,
} from "./foundation.js";

export { VSBuffer } from "./buffer.js";

// 序列化
export {
  type IReader,
  type IWriter,
  BufferReader,
  BufferWriter,
  serialize,
  deserialize,
} from "./serialization.js";

// 传输协议
export {
  type IMessagePassingProtocol,
  type ConnectionFlowControl,
  type MessagePortFlowControl,
  type MessagePortFlowState,
  type MessagePortPayload,
  type ISocket,
  ChunkStream,
  SocketProtocol,
  ProtocolMessageType,
  ProtocolMessage,
  MessagePortProtocol,
  type MessagePortLike,
} from "./protocol.js";

// Channel RPC
export {
  type IChannel,
  type IServerChannel,
  type IChannelServer,
  type IChannelClient,
  ChannelServer,
  ChannelClient,
} from "./channels.js";

// 服务代理
export { ProxyChannel } from "./proxy-channel.js";

// 日志中间件 —— 装饰 ChannelServer/ChannelClient，统一记录 RPC 调用
export {
  type RPCLogger,
  LoggingChannelServer,
  LoggingChannelClient,
} from "./logging-middleware.js";
