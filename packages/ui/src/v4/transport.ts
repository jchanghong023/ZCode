import type { ZCodeAgentConversationRowsRangeResult } from "@zcode/services/zcode-agent";
// V4 会话数据层的传输接缝（依赖注入）。
// desktop 走 preload/MessagePort，web 走 ws relay——数据层对两者零感知，
// 这是「依赖注入解决 desktop/web 兼容」原则在 v4 数据层的落点。
import type {
  CommandAck,
  CommandEnvelope,
  CommandsQueryParams,
  CommandsQueryResult,
  ConversationRowTarget,
  ConversationTopicFrame,
  TopicFrameDeliveryKind,
  SubscribeParams,
  V4AttachmentPutParams,
  V4AttachmentPutResult,
  V4ConversationRowsRangeParams,
  ConversationResyncParams,
  V4ConversationSubscribeResult,
  WebConversationResyncResult,
} from "@zcode/shared/zcode-protocol-v4";
import type { AttachmentUploadOptions } from "@/v4/attachmentUploadTransaction.js";

/**
 * 一条连接上的 v4 conversation 传输面，每条连接各配一个 SessionDataLayer。
 * 工作区身份与位置分别由 workspaceIdentity 与 workspacePath 表达，不能用 cwd 替代身份；
 * 见 docs/specs/aireq/connection-identity.md「工作区与会话」。
 */
export interface ConversationTransport {
  /** v4/conversation/subscribe。connectionId 由传输实现补齐，不进 UI 层。 */
  subscribe(params: SubscribeParams): Promise<V4ConversationSubscribeResult>;
  /** store 写入 ACK subscriptionId 后激活，并按原序释放 ACK 前 notification。 */
  activate(subscriptionId: string): void;
  /** 活跃订阅 same-sub recovery；topic/connection/profile 由 host owned registry 反查。 */
  resync(params: ConversationResyncParams): Promise<WebConversationResyncResult>;
  /** v4/conversation/unsubscribe。 */
  unsubscribe(subscriptionId: string): Promise<void>;
  /** v4/command；项目归属不随原生命令发送。 */
  sendCommand(envelope: CommandEnvelope): Promise<CommandAck>;
  /** v4/commands/query：重连后按 commandId 与 CLI 权威事实对账。 */
  queryCommands(params: CommandsQueryParams): Promise<CommandsQueryResult>;
  /** v4/conversation/rowsRange（loadOlder）：按游标向上取一窗历史行。 */
  rowsRange(params: V4ConversationRowsRangeParams): Promise<ZCodeAgentConversationRowsRangeResult>;
  /** UI 高层附件上传；production wire 为 begin/chunk/commit/abort。 */
  attachmentPut(
    params: V4AttachmentPutParams,
    options?: AttachmentUploadOptions,
  ): Promise<V4AttachmentPutResult>;
  /** 已发送 image/video 高层读取；Desktop 本地视频可返回已授权 URL，其余循环小块。 */
  attachmentRead(
    params: ConversationAttachmentReadParams,
  ): Promise<{ bytes: Uint8Array; mediaType: string } | { url: string; mediaType: string }>;
  /** 已发送 PDF 的授权 range 读取；不会把完整文件先读入 renderer。 */
  attachmentReadRange(
    params: ConversationAttachmentReadParams & { offset: number; limit: number },
  ): Promise<{
    bytes: Uint8Array;
    mediaType: string;
    totalBytes: number;
    nextOffset: number | null;
  }>;
  /** 注册下行帧监听（v4/conversation/frame），返回解除函数。 */
  onFrame(
    listener: (
      frame: ConversationTopicFrame,
      context?: { deliveryKind: TopicFrameDeliveryKind },
    ) => void,
  ): () => void;
  /** physical assembly 原子失败；projection 保持不变，由 store 发起 single-flight resync。 */
  onAssemblyFault(
    listener: (fault: {
      topic: string;
      subscriptionId: string;
      reasonCode?: string;
      deliveryKind?: TopicFrameDeliveryKind;
    }) => void,
  ): () => void;
  /** 承载连接已替换；旧订阅已解绑，可在新连接上重订阅。 */
  onConnectionReplaced?(listener: () => void): () => void;
}

export interface ConversationAttachmentReadParams {
  sessionId: string;
  ref: string;
  /** 仅用于决定是否查询 Desktop local video source；最终 MIME 仍由 CLI 权威返回。 */
  mediaType?: string;
  /** 新 row 有稳定 identity；旧 snapshot 缺失时保持 ref-only 兼容。 */
  target?: ConversationRowTarget;
  attachmentIndex?: number;
  /** Dialog 关闭、切换或卸载时停止后续分块请求。 */
  signal?: AbortSignal;
}

/** conversation topic key（与 CLI 侧 parseConversationTopic 对偶），从协议包再导出。 */
export { conversationTopic } from "@zcode/shared/zcode-protocol-v4";
