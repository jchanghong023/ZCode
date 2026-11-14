// 模拟扩展领域：扩展宿主、扩展视图与授权（全部为不可用能力，返回形状合法的空集合）。
import { Emitter } from "@zcode/rpc";
import {
  IExtensionGrantsService,
  IExtensionsService,
  IExtensionViewsService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type R<T extends (...args: never) => unknown> = ReturnType<T>;
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── 扩展 ──

export class MockExtensionsService implements IExtensionsService {
  private readonly contributionsEmitter = new Emitter<never>();
  private readonly hostStatusEmitter = new Emitter<never>();
  private readonly logsEmitter = new Emitter<unknown[]>();

  onDynamicContributions(): R<IExtensionsService["onDynamicContributions"]> {
    return this.contributionsEmitter.event as R<IExtensionsService["onDynamicContributions"]>;
  }

  onDynamicHostStatus(): R<IExtensionsService["onDynamicHostStatus"]> {
    return this.hostStatusEmitter.event as R<IExtensionsService["onDynamicHostStatus"]>;
  }

  async executeCommand(_input: P<IExtensionsService["executeCommand"]>): Promise<void> {}

  async provideMentionItems(
    _input: P<IExtensionsService["provideMentionItems"]>,
  ): Promise<AR<IExtensionsService["provideMentionItems"]>> {
    return { items: [] } as unknown as AR<IExtensionsService["provideMentionItems"]>;
  }

  async reload(): Promise<void> {}

  async reportWorkbench(_report: P<IExtensionsService["reportWorkbench"]>): Promise<void> {}

  async reportEnv(_env: P<IExtensionsService["reportEnv"]>): Promise<void> {}

  async getLogs(
    _input: P<IExtensionsService["getLogs"]>,
  ): Promise<AR<IExtensionsService["getLogs"]>> {
    return { entries: [], revision: 0 } as unknown as AR<IExtensionsService["getLogs"]>;
  }

  onDynamicLogs(): R<IExtensionsService["onDynamicLogs"]> {
    return this.logsEmitter.event as R<IExtensionsService["onDynamicLogs"]>;
  }
}

export class MockExtensionViewsService implements IExtensionViewsService {
  private readonly notificationsEmitter = new Emitter<never>();
  private readonly openRequestsEmitter = new Emitter<never>();
  private readonly draftRequestsEmitter = new Emitter<never>();
  private readonly notificationRequestsEmitter = new Emitter<never>();

  async prepareView(
    _input: P<IExtensionViewsService["prepareView"]>,
  ): Promise<AR<IExtensionViewsService["prepareView"]>> {
    throw new Error("mock: 扩展视图未启用");
  }

  async viewRequest(
    _input: P<IExtensionViewsService["viewRequest"]>,
  ): Promise<AR<IExtensionViewsService["viewRequest"]>> {
    return null as unknown as AR<IExtensionViewsService["viewRequest"]>;
  }

  async closeView(_input: { instanceId: string }): Promise<void> {}

  onDynamicViewNotifications(_input: {
    instanceId: string;
  }): R<IExtensionViewsService["onDynamicViewNotifications"]> {
    return this.notificationsEmitter.event as R<
      IExtensionViewsService["onDynamicViewNotifications"]
    >;
  }

  onDynamicViewOpenRequests(): R<IExtensionViewsService["onDynamicViewOpenRequests"]> {
    return this.openRequestsEmitter.event as R<IExtensionViewsService["onDynamicViewOpenRequests"]>;
  }

  async ackViewOpen(_ack: P<IExtensionViewsService["ackViewOpen"]>): Promise<void> {}

  onDynamicDraftRequests(): R<IExtensionViewsService["onDynamicDraftRequests"]> {
    return this.draftRequestsEmitter.event as R<IExtensionViewsService["onDynamicDraftRequests"]>;
  }

  async ackDraftRequest(_ack: P<IExtensionViewsService["ackDraftRequest"]>): Promise<void> {}

  onDynamicNotificationRequests(): R<IExtensionViewsService["onDynamicNotificationRequests"]> {
    return this.notificationRequestsEmitter.event as R<
      IExtensionViewsService["onDynamicNotificationRequests"]
    >;
  }

  async ackNotificationRequest(
    _ack: P<IExtensionViewsService["ackNotificationRequest"]>,
  ): Promise<void> {}
}

export class MockExtensionGrantsService implements IExtensionGrantsService {
  private readonly grantsEmitter = new Emitter<never>();
  private readonly grantRequestsEmitter = new Emitter<never>();

  onDynamicGrants(): R<IExtensionGrantsService["onDynamicGrants"]> {
    return this.grantsEmitter.event as R<IExtensionGrantsService["onDynamicGrants"]>;
  }

  async grant(_input: P<IExtensionGrantsService["grant"]>): Promise<void> {}

  async revoke(_input: P<IExtensionGrantsService["revoke"]>): Promise<void> {}

  async describeEnable(
    _input: P<IExtensionGrantsService["describeEnable"]>,
  ): Promise<AR<IExtensionGrantsService["describeEnable"]>> {
    return { impact: [] } as unknown as AR<IExtensionGrantsService["describeEnable"]>;
  }

  async getRecentActions(
    _input: P<IExtensionGrantsService["getRecentActions"]>,
  ): Promise<AR<IExtensionGrantsService["getRecentActions"]>> {
    return { actions: [] } as unknown as AR<IExtensionGrantsService["getRecentActions"]>;
  }

  async decideActivation(_input: P<IExtensionGrantsService["decideActivation"]>): Promise<void> {}

  async setNotificationsEnabled(
    _input: P<IExtensionGrantsService["setNotificationsEnabled"]>,
  ): Promise<void> {}

  onDynamicGrantRequests(): R<IExtensionGrantsService["onDynamicGrantRequests"]> {
    return this.grantRequestsEmitter.event as R<IExtensionGrantsService["onDynamicGrantRequests"]>;
  }

  async ackGrantRequest(_ack: P<IExtensionGrantsService["ackGrantRequest"]>): Promise<void> {}
}

export function registerExtensionsMockServices(services: MockServiceRegistrar): void {
  services.register(IExtensionsService, new MockExtensionsService());
  services.register(IExtensionViewsService, new MockExtensionViewsService());
  services.register(IExtensionGrantsService, new MockExtensionGrantsService());
}
