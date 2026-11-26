/* oxlint-disable eslint(max-lines) -- transport 集中处理 v4 帧、上传和分块读取。 */
// ConversationTransport 桥接渲染服务访问器中的 v4 RPC；数据层不感知连接细节。
import type { IServiceAccessor } from "@zcode/services";
import {
  conversationTopicFrameSchema,
  PROTOCOL_V4_LIMITS,
  parseConversationTopic,
  TopicWireFrameAssembler,
  type CommandAck,
  type CommandEnvelope,
  type ConversationTopicFrame,
  type ConversationTopicWireCandidate,
  type ConversationResyncParams,
  type SubscribeParams,
  type TopicFrameDeliveryKind,
  type V4AttachmentPutParams,
  type V4AttachmentPutResult,
  type V4ConversationRowsRangeParams,
  type V4ConversationSubscribeResult,
  type WebConversationResyncResult,
} from "@zcode/shared/zcode-protocol-v4";
import type { ConversationTransport } from "@/v4/transport.js";
import { ensureAgentV4ConnectionHandshake } from "@/v4/agentV4ConnectionHandshake.js";
import { createAckActivationBarrier } from "@/v4/ackActivationBarrier.js";
import { createTopicWireDecoder } from "@/v4/topicWireDecoder.js";
import { logger } from "@/logger.js";
import {
  uploadAttachmentTransaction,
  type AttachmentUploadOptions,
} from "@/v4/attachmentUploadTransaction.js";

export interface AgentConversationTransportTarget {
  workspacePath: string;
  workspaceIdentity?: string;
}

export type ConversationV4AgentService = Pick<
  IServiceAccessor["zcodeAgentService"],
  | "subscribeConversationV4"
  | "resyncConversationV4"
  | "helloConversationV4"
  | "initializeConversationV4"
  | "unsubscribeConversationV4"
  | "sendConversationCommandV4"
  | "queryConversationCommandsV4"
  | "conversationRowsRangeV4"
  | "attachmentBeginV4"
  | "attachmentChunkV4"
  | "attachmentCommitV4"
  | "attachmentAbortV4"
  | "attachmentReadV4"
  | "onDynamicConversationFrame"
>;

/**
 * 一条 host 连接（= 一个 workspace）上的 v4 conversation 传输面。
 * connectionId 由 host 侧补齐；这里只负责 workspace 定位与帧监听生命周期。
 */
export function createAgentConversationTransport(
  agentService: ConversationV4AgentService,
  target: AgentConversationTransportTarget,
): ConversationTransport {
  const workspace = {
    workspacePath: target.workspacePath,
    ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
  };
  const ensureHandshake = () => ensureAgentV4ConnectionHandshake(agentService);
  const listeners = new Set<
    (frame: ConversationTopicFrame, context?: { deliveryKind: TopicFrameDeliveryKind }) => void
  >();
  const faultListeners = new Set<
    (fault: {
      topic: string;
      subscriptionId: string;
      reasonCode?: string;
      deliveryKind?: TopicFrameDeliveryKind;
    }) => void
  >();
  const decoder = createTopicWireDecoder(
    new TopicWireFrameAssembler(conversationTopicFrameSchema),
    (frame: ConversationTopicFrame, deliveryKind) => {
      for (const listener of listeners) listener(frame, { deliveryKind });
    },
    (fault) => {
      for (const listener of faultListeners) listener(fault);
    },
  );
  const barrier = createAckActivationBarrier<ConversationTopicWireCandidate>((wire) => {
    decoder.accept(wire);
  });
  const topicBySubscriptionId = new Map<string, string>();
  let upstream: { dispose(): void } | null = null;
  const targetWorkspaceKey = target.workspaceIdentity?.trim() || target.workspacePath;
  const lifecycleContext = {
    workspaceKey: targetWorkspaceKey,
    workspacePath: target.workspacePath,
    ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
  };

  // Bug 原因：上游回调若创建在 onX(listener) 内，会与退订闭包共享作用域，
  // Set.delete 后仍保留首个 listener 及其已关闭 store。上游创建只捕获 transport 本身。
  const attachFrameUpstream = () => {
    if (!upstream) {
      upstream = agentService.onDynamicConversationFrame(workspace)((frame) =>
        barrier.accept(frame),
      );
      logger.lifecycle.info("v4 conversation frame upstream attached", {
        ...lifecycleContext,
        event: "v4.conversation.frames.upstream_attached",
        listenerCount: listeners.size,
        module: "ui.v4.conversation_transport",
        status: "completed",
      });
    }
  };
  const decodeBase64Chunk = (value: string): Uint8Array => {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  };
  return {
    async subscribe(params: SubscribeParams): Promise<V4ConversationSubscribeResult> {
      const sessionId = parseConversationTopic(params.topic);
      if (!sessionId) {
        return Promise.reject(new Error(`Unsupported v4 topic: ${params.topic}`));
      }
      const startedAt = Date.now();
      logger.lifecycle.info("v4 conversation subscription started", {
        ...lifecycleContext,
        event: "v4.conversation.subscribe.started",
        module: "ui.v4.conversation_transport",
        sessionId,
        status: "started",
        topic: params.topic,
      });
      let pending: ReturnType<typeof barrier.begin> | undefined;
      try {
        await ensureHandshake();
        pending = barrier.begin(params.topic);
        const result = await agentService.subscribeConversationV4({
          ...workspace,
          sessionId,
          ...(params.base ? { base: params.base } : {}),
          ...(params.visibility ? { visibility: params.visibility } : {}),
        });
        try {
          barrier.bind(pending, result.ack.subscriptionId);
        } catch (error) {
          // ACK 前 physical batch 一旦越界就已经不完整，必须撤销 host
          // subscription 并把明确 fault 交给调用方，不能返回一个可 activate 的 ACK。
          try {
            await agentService.unsubscribeConversationV4({
              ...workspace,
              subscriptionId: result.ack.subscriptionId,
            });
          } catch (cleanupError) {
            logger.warn("[v4-conversation] failed to undo rejected subscription", cleanupError);
          }
          throw error;
        }
        topicBySubscriptionId.set(result.ack.subscriptionId, params.topic);
        logger.lifecycle.info("v4 conversation subscription acknowledged", {
          ...lifecycleContext,
          durationMs: Date.now() - startedAt,
          event: "v4.conversation.subscribe.acknowledged",
          module: "ui.v4.conversation_transport",
          sessionId,
          status: "completed",
          subscriptionId: result.ack.subscriptionId,
          topic: params.topic,
        });
        return result;
      } catch (error) {
        if (pending) barrier.cancel(pending);
        logger.lifecycle.warn("v4 conversation subscription failed", {
          ...lifecycleContext,
          durationMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
          event: "v4.conversation.subscribe.failed",
          module: "ui.v4.conversation_transport",
          sessionId,
          status: "failed",
          topic: params.topic,
        });
        throw error;
      }
    },
    activate(subscriptionId: string): void {
      const activation = barrier.activate(subscriptionId);
      if (activation?.previousSubscriptionId) {
        decoder.discard(activation.topic, activation.previousSubscriptionId);
        topicBySubscriptionId.delete(activation.previousSubscriptionId);
      }
      logger.lifecycle.info("v4 conversation subscription activated", {
        ...lifecycleContext,
        event: "v4.conversation.subscribe.activated",
        module: "ui.v4.conversation_transport",
        status: "completed",
        subscriptionId,
        ...(activation?.topic ? { topic: activation.topic } : {}),
      });
    },
    async resync(params: ConversationResyncParams): Promise<WebConversationResyncResult> {
      await ensureHandshake();
      const topic = topicBySubscriptionId.get(params.subscriptionId);
      if (!topic) throw new Error("fault.subscription.notOwned");
      // 必须在 RPC 前解开 decoder fail-closed 门；assembler ordinal tombstone 仍保留，
      // 因此同 read 中早于 Promise continuation 到达的 K+1 recovery 可进入，<=K 仍丢。
      decoder.recover(topic, params.subscriptionId);
      return agentService.resyncConversationV4({
        ...workspace,
        subscriptionId: params.subscriptionId,
        base: params.base,
        ...(params.forceSnapshot !== undefined ? { forceSnapshot: params.forceSnapshot } : {}),
      });
    },
    async unsubscribe(subscriptionId: string): Promise<void> {
      // 本地 ownership 先释放；旧 service proxy 的 handshake/RPC 已失败时也不能继续投帧。
      const startedAt = Date.now();
      barrier.forget(subscriptionId);
      const subscriptionTopic = topicBySubscriptionId.get(subscriptionId);
      topicBySubscriptionId.delete(subscriptionId);
      if (subscriptionTopic) decoder.discard(subscriptionTopic, subscriptionId);
      logger.lifecycle.info("v4 conversation unsubscription started", {
        ...lifecycleContext,
        event: "v4.conversation.unsubscribe.started",
        module: "ui.v4.conversation_transport",
        status: "started",
        subscriptionId,
        ...(subscriptionTopic ? { topic: subscriptionTopic } : {}),
      });
      try {
        await ensureHandshake();
        await agentService.unsubscribeConversationV4({
          ...workspace,
          subscriptionId,
        });
        logger.lifecycle.info("v4 conversation unsubscription completed", {
          ...lifecycleContext,
          durationMs: Date.now() - startedAt,
          event: "v4.conversation.unsubscribe.completed",
          module: "ui.v4.conversation_transport",
          status: "completed",
          subscriptionId,
          ...(subscriptionTopic ? { topic: subscriptionTopic } : {}),
        });
      } catch (error) {
        logger.lifecycle.warn("v4 conversation unsubscription failed", {
          ...lifecycleContext,
          durationMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
          event: "v4.conversation.unsubscribe.failed",
          module: "ui.v4.conversation_transport",
          status: "failed",
          subscriptionId,
          ...(subscriptionTopic ? { topic: subscriptionTopic } : {}),
        });
        throw error;
      }
    },
    async sendCommand(envelope: CommandEnvelope): Promise<CommandAck> {
      await ensureHandshake();
      const payload = envelope.payload as {
        planEnabled?: boolean;
        config?: { planEnabled?: boolean };
        firstInput?: { planEnabled?: boolean };
        genUiContext?: unknown[];
      };
      // Web 不支持旧 Plan；不能剥掉请求后把 Plan 错发成普通执行。
      if (payload.planEnabled || payload.config?.planEnabled || payload.firstInput?.planEnabled) {
        throw new Error("proto.independentPlanUnsupported");
      }
      // Web 不接纳 GenUI 输入；保留明确拒绝，不发送丢失上下文的命令。
      if (envelope.type === "sendText" && payload.genUiContext?.length) {
        throw new Error("proto.genUiContextUnsupported");
      }
      return agentService.sendConversationCommandV4({ ...workspace, envelope });
    },
    async queryCommands({ commands }) {
      await ensureHandshake();
      return agentService.queryConversationCommandsV4({
        ...workspace,
        commands,
      });
    },
    async rowsRange(params: V4ConversationRowsRangeParams) {
      await ensureHandshake();
      return agentService.conversationRowsRangeV4({
        ...workspace,
        sessionId: params.sessionId,
        ...(params.beforeRowId !== undefined ? { beforeRowId: params.beforeRowId } : {}),
        limit: params.limit,
      });
    },
    async attachmentPut(
      params: V4AttachmentPutParams,
      options?: AttachmentUploadOptions,
    ): Promise<V4AttachmentPutResult> {
      await ensureHandshake();
      return uploadAttachmentTransaction(agentService, workspace, params, options);
    },
    async attachmentRead(params) {
      params.signal?.throwIfAborted();
      await ensureHandshake();
      params.signal?.throwIfAborted();
      const chunks: Uint8Array[] = [];
      let offset = 0;
      let totalBytes: number | null = null;
      let mediaType: string | null = null;

      for (let chunkIndex = 0; ; chunkIndex += 1) {
        params.signal?.throwIfAborted();
        // 已发送视频读取曾误用上传事务的 64-chunk 上限，导致 20MiB 以上视频无法预览。
        if (chunkIndex >= PROTOCOL_V4_LIMITS.attachmentPreviewMaxChunks) {
          throw new Error("fault.attachment.previewTooManyChunks");
        }
        const result = await agentService.attachmentReadV4({
          ...workspace,
          sessionId: params.sessionId,
          ref: params.ref,
          ...(params.target ? { target: params.target } : {}),
          ...(params.attachmentIndex !== undefined
            ? { attachmentIndex: params.attachmentIndex }
            : {}),
          offset,
          limit: PROTOCOL_V4_LIMITS.attachmentChunkMaxBytes,
        });
        // 旧的 request-id 保护只会忽略晚到结果，Dialog 关闭后仍会继续拉取
        // 最多 30MiB 视频。高层读取拥有取消语义，在每个在途 chunk 返回后立即停住。
        params.signal?.throwIfAborted();
        totalBytes ??= result.totalBytes;
        mediaType ??= result.mediaType;
        if (result.totalBytes !== totalBytes || result.mediaType !== mediaType) {
          throw new Error("fault.attachment.previewChangedDuringRead");
        }
        const chunk = decodeBase64Chunk(result.dataBase64);
        const nextOffset = offset + chunk.byteLength;
        if (nextOffset > totalBytes) {
          throw new Error("fault.attachment.previewSizeMismatch");
        }
        chunks.push(chunk);
        if (nextOffset === totalBytes) {
          params.signal?.throwIfAborted();
          const bytes = new Uint8Array(totalBytes);
          let writeOffset = 0;
          for (const part of chunks) {
            bytes.set(part, writeOffset);
            writeOffset += part.byteLength;
          }
          return { bytes, mediaType };
        }
        if (chunk.byteLength === 0) {
          throw new Error("fault.attachment.previewEmptyChunk");
        }
        offset = nextOffset;
      }
    },
    async attachmentReadRange(params) {
      params.signal?.throwIfAborted();
      await ensureHandshake();
      params.signal?.throwIfAborted();
      const result = await agentService.attachmentReadV4({
        ...workspace,
        sessionId: params.sessionId,
        ref: params.ref,
        ...(params.target ? { target: params.target } : {}),
        ...(params.attachmentIndex !== undefined
          ? { attachmentIndex: params.attachmentIndex }
          : {}),
        offset: params.offset,
        limit: params.limit,
      });
      params.signal?.throwIfAborted();
      const bytes = decodeBase64Chunk(result.dataBase64);
      const endOffset = params.offset + bytes.byteLength;
      return {
        bytes,
        mediaType: result.mediaType,
        totalBytes: result.totalBytes,
        nextOffset: endOffset < result.totalBytes ? endOffset : null,
      };
    },
    onFrame(
      listener: (
        frame: ConversationTopicFrame,
        context?: { deliveryKind: TopicFrameDeliveryKind },
      ) => void,
    ): () => void {
      listeners.add(listener);
      attachFrameUpstream();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          upstream?.dispose();
          upstream = null;
          logger.lifecycle.info("v4 conversation frame upstream detached", {
            ...lifecycleContext,
            event: "v4.conversation.frames.upstream_detached",
            listenerCount: 0,
            module: "ui.v4.conversation_transport",
            status: "completed",
          });
        }
      };
    },
    onAssemblyFault(listener) {
      faultListeners.add(listener);
      return () => faultListeners.delete(listener);
    },
  };
}
