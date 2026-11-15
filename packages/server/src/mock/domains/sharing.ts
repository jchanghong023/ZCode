// 附件暂存、Onboarding 记录与加速卡。
// 附件暂存需要远端存储，纯 Web 模拟后端不提供暂存写入。
import { Emitter } from "@zcode/rpc";
import {
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
  services.register(IPromptAttachmentTransferService, new MockPromptAttachmentTransferService());
  services.register(IOnboardingRecordService, new MockOnboardingRecordService());
  services.register(IHighspeedCardService, new MockHighspeedCardService());
}
