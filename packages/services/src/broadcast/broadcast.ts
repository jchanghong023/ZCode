import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/**
 * 广播消息
 *
 * 用于跨窗口状态同步。从 Renderer 发出后经 host → main → 其他 host → 对应 Renderer。
 */
export interface BroadcastMessage {
  /** 频道名，如 "state:theme"、"state:locale" */
  channel: string;
  /** 消息负载 */
  payload: unknown;
  /** 发送源窗口 ID（由 BroadcastHub 填充，接收端可用来跳过自己） */
  sourceWindowId?: number;
}

/**
 * 广播服务接口
 *
 * 路径：Renderer → (RPC call) → Host → (parentPort) → Main(BroadcastHub)
 *       → (postMessage) → 其他 Host → (RPC event onMessage) → 对应 Renderer
 */
export interface IBroadcastService {
  /** 发送广播消息 */
  send(message: BroadcastMessage): Promise<void>;
  /** 接收来自其他窗口的广播 */
  onMessage: Event<BroadcastMessage>;
}

export type WebBroadcastMessage = Pick<BroadcastMessage, "channel" | "payload">;

export interface WebBroadcastService {
  send(message: WebBroadcastMessage): Promise<void>;
  onMessage: Event<WebBroadcastMessage>;
}

export const IBroadcastService = createServiceDescriptor<IBroadcastService>(
  ServiceChannels.Broadcast,
);
