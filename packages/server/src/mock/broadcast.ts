// 跨连接广播总线的唯一内存 owner；发送源隔离由 HTTP 连接 facade 执行。
import { Emitter, type Event } from "@zcode/rpc";
import type { BroadcastMessage, IBroadcastService } from "@zcode/services";

export class MockBroadcastService implements IBroadcastService {
  private readonly messageEmitter = new Emitter<BroadcastMessage>();

  /** 单一 topic 总线：UI 按 message.channel 自行过滤。 */
  get onMessage(): Event<BroadcastMessage> {
    return this.messageEmitter.event;
  }

  async send(message: BroadcastMessage): Promise<void> {
    this.messageEmitter.fire(message);
  }
}
