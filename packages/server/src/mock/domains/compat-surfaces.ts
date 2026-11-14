// 兼容面领域：反馈、GenUI、语音、云内容、营销触达与 Provider Provisioning。
// 这些能力在纯 Web 模拟后端不可用：读取返回形状合法的空值，写入明确拒绝。
import { Emitter } from "@zcode/rpc";
import { createUuid } from "@zcode/shared";
import {
  ICloudContentService,
  IFeedbackService,
  IGenUiService,
  IMarketingTouchService,
  IProviderProvisioningStatusService,
  IProviderProvisioningTargetService,
  IVoiceInputService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type R<T extends (...args: never) => unknown> = ReturnType<T>;
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

export class MockFeedbackService implements IFeedbackService {
  private readonly uploadProgressEmitter = new Emitter<never>();

  async create(_input: P<IFeedbackService["create"]>): Promise<AR<IFeedbackService["create"]>> {
    throw new Error("mock: 反馈提交未启用");
  }

  async cancelCreate(_operationId: string): Promise<void> {}

  async list(_query?: P<IFeedbackService["list"]>): Promise<AR<IFeedbackService["list"]>> {
    return { tickets: [], total: 0 } as unknown as AR<IFeedbackService["list"]>;
  }

  async get(_id: string): Promise<AR<IFeedbackService["get"]>> {
    throw new Error("mock: 反馈详情未启用");
  }

  async comment(_id: string, _body: string): Promise<AR<IFeedbackService["comment"]>> {
    throw new Error("mock: 反馈评论未启用");
  }

  async uploadAttachment(
    _input: P<IFeedbackService["uploadAttachment"]>,
  ): Promise<AR<IFeedbackService["uploadAttachment"]>> {
    throw new Error("mock: 附件上传未启用");
  }

  async uploadAttachmentWithProgress(
    _input: P<IFeedbackService["uploadAttachmentWithProgress"]>,
  ): Promise<AR<IFeedbackService["uploadAttachmentWithProgress"]>> {
    throw new Error("mock: 附件上传未启用");
  }

  async cancelUpload(_progressId: string): Promise<void> {}

  onDynamicUploadProgress(_id: string): R<IFeedbackService["onDynamicUploadProgress"]> {
    return this.uploadProgressEmitter.event as R<IFeedbackService["onDynamicUploadProgress"]>;
  }

  async uploadAttachmentData(
    _input: P<IFeedbackService["uploadAttachmentData"]>,
  ): Promise<AR<IFeedbackService["uploadAttachmentData"]>> {
    throw new Error("mock: 附件上传未启用");
  }

  async attachLogsFromExport(
    _id: string,
    _options?: { full?: boolean },
  ): Promise<AR<IFeedbackService["attachLogsFromExport"]>> {
    throw new Error("mock: 日志归档未启用");
  }

  async getDeviceSnapshot(): Promise<AR<IFeedbackService["getDeviceSnapshot"]>> {
    throw new Error("mock: 设备快照未启用");
  }

  async prepareCompactLogArchive(_options?: {
    full?: boolean;
    progressId?: string;
  }): Promise<AR<IFeedbackService["prepareCompactLogArchive"]>> {
    throw new Error("mock: 日志归档未启用");
  }

  async cleanupPreparedLogArchive(_path: string): Promise<void> {}

  async revealLogArchive(_path: string): Promise<void> {}
}

export class MockGenUiService implements IGenUiService {
  async readDocument(
    _target: P<IGenUiService["readDocument"]>,
  ): Promise<AR<IGenUiService["readDocument"]>> {
    throw new Error("mock: GenUI 未启用");
  }

  async prepareSandbox(
    _input: P<IGenUiService["prepareSandbox"]>,
  ): Promise<AR<IGenUiService["prepareSandbox"]>> {
    throw new Error("mock: GenUI 未启用");
  }

  async getState(_target: P<IGenUiService["getState"]>): Promise<AR<IGenUiService["getState"]>> {
    return null as unknown as AR<IGenUiService["getState"]>;
  }

  async setState(_input: P<IGenUiService["setState"]>): Promise<void> {}

  async listState(_scope: P<IGenUiService["listState"]>): Promise<AR<IGenUiService["listState"]>> {
    return [] as unknown as AR<IGenUiService["listState"]>;
  }

  get onStateChanged(): IGenUiService["onStateChanged"] {
    return new Emitter<never>().event as unknown as IGenUiService["onStateChanged"];
  }
}

// ── 语音输入 / 云内容 / 营销触达 ──

export class MockVoiceInputService implements IVoiceInputService {
  private readonly eventEmitter = new Emitter<never>();

  get onEvent(): IVoiceInputService["onEvent"] {
    return this.eventEmitter.event as unknown as IVoiceInputService["onEvent"];
  }

  async start(_params: P<IVoiceInputService["start"]>): Promise<void> {}

  async sendAudio(_params: P<IVoiceInputService["sendAudio"]>): Promise<void> {}

  async finish(_params: P<IVoiceInputService["finish"]>): Promise<void> {}

  async cancel(_params: P<IVoiceInputService["cancel"]>): Promise<void> {}
}

export class MockCloudContentService {
  async readPublishedMedia(_input: { asset: unknown; kind: "image" | "video" }): Promise<string> {
    return "";
  }

  async prepare(_input: Record<string, unknown>) {
    return { leaseId: `lease_${createUuid()}` };
  }

  async release(_input: { leaseId: string }): Promise<void> {}
}

export class MockMarketingTouchService {
  async query(_input: { locale: string }) {
    return { scope: "mock", banners: [], notices: [] };
  }

  async report(_input: Record<string, unknown>): Promise<void> {}
}

export class MockProviderProvisioningStatusService {
  async getStatus(_params: Record<string, unknown>) {
    return { state: "idle" as const };
  }

  async retry(_params: Record<string, unknown>) {
    return { state: "idle" as const };
  }
}

export class MockProviderProvisioningTargetService {
  async apply(_envelope: unknown): Promise<never> {
    throw new Error("mock: Provider Provisioning 仅支持受信 Desktop Host");
  }
}

export function registerCompatSurfacesMockServices(services: MockServiceRegistrar): void {
  services.register(IFeedbackService, new MockFeedbackService());
  services.register(IGenUiService, new MockGenUiService());
  services.register(IVoiceInputService, new MockVoiceInputService());
  services.register(ICloudContentService, new MockCloudContentService() as never);
  services.register(IMarketingTouchService, new MockMarketingTouchService() as never);
  services.register(
    IProviderProvisioningTargetService,
    new MockProviderProvisioningTargetService(),
  );
  services.register(
    IProviderProvisioningStatusService,
    new MockProviderProvisioningStatusService() as never,
  );
}
