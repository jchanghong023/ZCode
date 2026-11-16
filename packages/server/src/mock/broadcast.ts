// 跨连接广播总线与 claims 的唯一内存 owner；发送源隔离由 HTTP 连接 facade 执行。
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

  async send(message: BroadcastMessage): Promise<void> {
    this.messageEmitter.fire(message);
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
