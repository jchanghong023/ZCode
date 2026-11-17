// 原生群组投递与运行时偏好使用的 Bots 契约。
import { IBotsService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

export class MockBotsService implements IBotsService {
  async syncAppRuntimePreferences(
    _preferences: P<IBotsService["syncAppRuntimePreferences"]>,
  ): Promise<void> {
    // 未接入 Bot 运行时，偏好同步不能以空成功冒充已应用。
    throw Object.assign(new Error("当前服务未启用 Bot 运行时偏好同步。"), {
      code: "fault.command.capabilityUnsupported",
    });
  }

  async getConfig(): Promise<AR<IBotsService["getConfig"]>> {
    return { version: 3, bots: [] };
  }

  async getBotStates(): Promise<AR<IBotsService["getBotStates"]>> {
    return [];
  }
}

export function registerAutomationsMockServices(services: MockServiceRegistrar): void {
  services.register(IBotsService, new MockBotsService());
}
