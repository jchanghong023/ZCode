// 原生附件暂存。
// 附件暂存需要远端存储，纯 Web 模拟后端不提供暂存写入。
import { Emitter } from "@zcode/rpc";
import { IPromptAttachmentTransferService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

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

export function registerSharingMockServices(services: MockServiceRegistrar): void {
  services.register(IPromptAttachmentTransferService, new MockPromptAttachmentTransferService());
}
