// 模拟广播服务：跨窗口主题消息总线（内存回环）。
import { Emitter, type Event } from "@zcode/rpc";
import { createUuid } from "@zcode/shared";
import type {
  BroadcastClaimAcquireResult,
  BroadcastClaimLease,
  BroadcastMessage,
  IBroadcastService,
} from "@zcode/services";

export class MockBroadcastService implements IBroadcastService {
  private readonly messageEmitter = new Emitter<BroadcastMessage>();
  private readonly tokens = new Map<string, string>();
  private readonly committed = new Set<string>();

  /** 单一 topic 总线：UI 按 message.channel 自行过滤。 */
  get onMessage(): Event<BroadcastMessage> {
    return this.messageEmitter.event;
  }

  async send(_message: BroadcastMessage): Promise<void> {
    // 真实实现是跨窗口 IPC 且由 BroadcastHub 跳过发送源窗口。模拟后端只有一个
    // renderer，回声会让 UI 把自己的状态同步当外部变更消费（重挂循环），因此不投递。
    void _message;
  }

  async acquireClaim(key: string): Promise<BroadcastClaimAcquireResult> {
    if (this.committed.has(key) || this.tokens.has(key)) {
      return { status: "busy", retryAfterMs: 1_000 };
    }
    const lease: BroadcastClaimLease = { key, token: `claim_${createUuid()}` };
    this.tokens.set(key, lease.token);
    return { status: "acquired", lease };
  }

  async commitClaim(lease: BroadcastClaimLease): Promise<void> {
    const token = this.tokens.get(lease.key);
    if (token === lease.token) {
      this.tokens.delete(lease.key);
      this.committed.add(lease.key);
    }
  }

  async releaseClaim(lease: BroadcastClaimLease): Promise<void> {
    const token = this.tokens.get(lease.key);
    if (token === lease.token) {
      this.tokens.delete(lease.key);
    }
  }

  async tryClaim(key: string): Promise<boolean> {
    if (this.committed.has(key) || this.tokens.has(key)) return false;
    this.tokens.set(key, `claim_${createUuid()}`);
    return true;
  }
}
