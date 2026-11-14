// 模拟分享领域：会话分享、附件暂存、Onboarding 记录与加速卡。
// 分享/暂存需要远端存储，纯 Web 模拟后端只暴露不可用能力与空集合。
import { Emitter } from "@zcode/rpc";
import {
  IConversationShareService,
  IHighspeedCardService,
  IOnboardingRecordService,
  IPromptAttachmentTransferService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 复杂 result 的空实现统一经 unknown 收敛；字段缺失由 UI 空集合兜底。 */
function asResult<T>(value: unknown): T {
  return value as T;
}

// ── 会话分享 / 附件暂存 / Onboarding / 加速卡 ──

export class MockConversationShareService implements IConversationShareService {
  async getCapabilities(): Promise<AR<IConversationShareService["getCapabilities"]>> {
    return asResult({ publish: false, import: false });
  }

  async preflight(
    _input: P<IConversationShareService["preflight"]>,
  ): Promise<AR<IConversationShareService["preflight"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async publish(
    _input: P<IConversationShareService["publish"]>,
  ): Promise<AR<IConversationShareService["publish"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  onDynamicPublishProgress(
    _operationId: string,
  ): ReturnType<IConversationShareService["onDynamicPublishProgress"]> {
    return new Emitter<never>().event as unknown as ReturnType<
      IConversationShareService["onDynamicPublishProgress"]
    >;
  }

  async importShare(
    _input: P<IConversationShareService["importShare"]>,
  ): Promise<AR<IConversationShareService["importShare"]>> {
    throw new Error("mock: 会话导入未启用");
  }

  onDynamicImportProgress(
    _operationId: string,
  ): ReturnType<IConversationShareService["onDynamicImportProgress"]> {
    return new Emitter<never>().event as unknown as ReturnType<
      IConversationShareService["onDynamicImportProgress"]
    >;
  }

  async getImportedConversation(
    _input: P<IConversationShareService["getImportedConversation"]>,
  ): Promise<AR<IConversationShareService["getImportedConversation"]>> {
    throw new Error("mock: 会话导入未启用");
  }

  async getPreview(_shareCode: string): Promise<AR<IConversationShareService["getPreview"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async getContinuation(
    _input: P<IConversationShareService["getContinuation"]>,
  ): Promise<AR<IConversationShareService["getContinuation"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async listManagedShares(
    _input: P<IConversationShareService["listManagedShares"]>,
  ): Promise<AR<IConversationShareService["listManagedShares"]>> {
    return asResult({ items: [], nextCursor: null });
  }

  async revokeManagedShare(
    _shareId: string,
  ): Promise<AR<IConversationShareService["revokeManagedShare"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async restoreManagedShare(
    _shareId: string,
  ): Promise<AR<IConversationShareService["restoreManagedShare"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async deleteManagedShare(_shareId: string): Promise<void> {}
}

export class MockPromptAttachmentTransferService implements IPromptAttachmentTransferService {
  private readonly progressEmitter = new Emitter<never>();

  async stage(
    _params: P<IPromptAttachmentTransferService["stage"]>,
  ): Promise<AR<IPromptAttachmentTransferService["stage"]>> {
    throw new Error("mock: 附件暂存未启用");
  }

  async adopt(_operationId: string): Promise<void> {}

  async cancel(_operationId: string): Promise<void> {}

  async cleanup(_operationId: string): Promise<void> {}

  onDynamicProgress(
    _operationId: string,
  ): ReturnType<IPromptAttachmentTransferService["onDynamicProgress"]> {
    return this.progressEmitter.event as unknown as ReturnType<
      IPromptAttachmentTransferService["onDynamicProgress"]
    >;
  }
}

export class MockOnboardingRecordService implements IOnboardingRecordService {
  async appendRecord(
    _deviceMid: string,
    _entry: Parameters<IOnboardingRecordService["appendRecord"]>[1],
  ): Promise<void> {}

  async shouldOnboard(_deviceMid: string): Promise<boolean> {
    return false;
  }

  async dismissOnboarding(_deviceMid: string): Promise<void> {}

  async claimAnonymousRecord(): Promise<void> {}

  async getLatestEntry(): Promise<AR<IOnboardingRecordService["getLatestEntry"]>> {
    return null;
  }

  async syncSettingsFromRecord(): Promise<AR<IOnboardingRecordService["syncSettingsFromRecord"]>> {
    return null;
  }

  async updateRecordPreferences(
    _params: P<IOnboardingRecordService["updateRecordPreferences"]>,
  ): Promise<void> {}

  async getRecords(): Promise<AR<IOnboardingRecordService["getRecords"]>> {
    return null;
  }

  async clearRecords(): Promise<void> {}
}

export class MockHighspeedCardService implements IHighspeedCardService {
  async prepareTurn(
    _params: P<IHighspeedCardService["prepareTurn"]>,
  ): Promise<AR<IHighspeedCardService["prepareTurn"]>> {
    throw new Error("mock: 加速卡未启用");
  }

  async getSnapshot(): Promise<AR<IHighspeedCardService["getSnapshot"]>> {
    return asResult({ cards: [], revision: 0 });
  }

  async invalidateCard(_cardId: string): Promise<boolean> {
    return false;
  }

  async getCurrentOwnerKey(): Promise<string | null> {
    return null;
  }

  async healthy(
    _cardId: string,
    _ownerKey?: string,
  ): Promise<AR<IHighspeedCardService["healthy"]>> {
    return null;
  }
}

export function registerSharingMockServices(services: MockServiceRegistrar): void {
  services.register(IConversationShareService, new MockConversationShareService());
  services.register(IPromptAttachmentTransferService, new MockPromptAttachmentTransferService());
  services.register(IOnboardingRecordService, new MockOnboardingRecordService());
  services.register(IHighspeedCardService, new MockHighspeedCardService());
}
