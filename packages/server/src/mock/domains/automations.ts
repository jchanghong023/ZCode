// 模拟自动化领域：闲时任务与 Bots（IM 集成）。
// 两者都依赖真实网络/账号能力，纯 Web 模拟后端只提供只读空投影与明确拒绝。
import { type MockRuntime } from "../runtime.js";
import { IBotsService, IOffPeakTaskService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 复杂 result 的空实现统一经 unknown 收敛；字段缺失由 UI 空集合兜底。 */
function asResult<T>(value: unknown): T {
  return value as T;
}

// ── 闲时任务 / Bots ──

export class MockOffPeakTaskService implements IOffPeakTaskService {
  async getCodingPlanSupport(): Promise<AR<IOffPeakTaskService["getCodingPlanSupport"]>> {
    return asResult({ supported: false, reasonCode: "mock" });
  }

  async getTakeNumberAvailability(): Promise<AR<IOffPeakTaskService["getTakeNumberAvailability"]>> {
    return asResult({ available: false, remaining: 0 });
  }

  async createTask(
    _params: P<IOffPeakTaskService["createTask"]>,
  ): Promise<AR<IOffPeakTaskService["createTask"]>> {
    throw new Error("mock: 闲时任务未启用");
  }

  async cancelTask(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["cancelTask"]>> {
    return null;
  }

  async pauseTask(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["pauseTask"]>> {
    return null;
  }

  async continueTask(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["continueTask"]>> {
    return null;
  }

  async deleteTask(_offPeakTaskId: string): Promise<void> {}

  async deleteHistory(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["deleteHistory"]>> {
    return null;
  }

  async updateTask(
    _params: P<IOffPeakTaskService["updateTask"]>,
  ): Promise<AR<IOffPeakTaskService["updateTask"]>> {
    return null;
  }

  async list(): Promise<AR<IOffPeakTaskService["list"]>> {
    return [];
  }

  async get(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["get"]>> {
    return null;
  }
}

export class MockBotsService implements IBotsService {
  constructor(private readonly runtime: MockRuntime) {}

  async syncAppRuntimePreferences(
    _preferences: P<IBotsService["syncAppRuntimePreferences"]>,
  ): Promise<void> {}

  async getStatus(): Promise<AR<IBotsService["getStatus"]>> {
    void this.runtime;
    return asResult({ enabled: false, providers: [] });
  }

  async getConfig(): Promise<AR<IBotsService["getConfig"]>> {
    return asResult({ bots: [], channels: {} });
  }

  async saveConfig(config: P<IBotsService["saveConfig"]>): Promise<AR<IBotsService["saveConfig"]>> {
    return asResult(config);
  }

  async listWorkspaceRefs(
    _params?: P<IBotsService["listWorkspaceRefs"]>,
  ): Promise<AR<IBotsService["listWorkspaceRefs"]>> {
    return [];
  }

  async getUserConfigOptions(
    _params: P<IBotsService["getUserConfigOptions"]>,
  ): Promise<AR<IBotsService["getUserConfigOptions"]>> {
    return [];
  }

  async beginFeishuRegistration(
    _params: P<IBotsService["beginFeishuRegistration"]>,
  ): Promise<AR<IBotsService["beginFeishuRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async pollFeishuRegistration(
    _params: P<IBotsService["pollFeishuRegistration"]>,
  ): Promise<AR<IBotsService["pollFeishuRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async beginWeixinRegistration(): Promise<AR<IBotsService["beginWeixinRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async pollWeixinRegistration(
    _params: P<IBotsService["pollWeixinRegistration"]>,
  ): Promise<AR<IBotsService["pollWeixinRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async listBots(): Promise<AR<IBotsService["listBots"]>> {
    return [];
  }

  async saveBot(_params: P<IBotsService["saveBot"]>): Promise<AR<IBotsService["saveBot"]>> {
    throw new Error("mock: Bot 保存未启用");
  }

  async removeBotSecret(_botId: string): Promise<AR<IBotsService["removeBotSecret"]>> {
    throw new Error("mock: Bot 保存未启用");
  }

  async deleteBot(_botId: string): Promise<void> {}

  async testBot(_botId: string): Promise<AR<IBotsService["testBot"]>> {
    return asResult({ ok: false, message: "mock: Bot 测试未启用" });
  }

  async createBindCode(
    _params: P<IBotsService["createBindCode"]>,
  ): Promise<AR<IBotsService["createBindCode"]>> {
    throw new Error("mock: Bot 绑定未启用");
  }

  async getBotStates(): Promise<AR<IBotsService["getBotStates"]>> {
    return [];
  }

  async resetBotState(_params: P<IBotsService["resetBotState"]>): Promise<void> {}

  async watchAutomationRun(_params: P<IBotsService["watchAutomationRun"]>): Promise<void> {}

  async handleInboundMessage(
    _message: P<IBotsService["handleInboundMessage"]>,
  ): Promise<AR<IBotsService["handleInboundMessage"]>> {
    return [];
  }

  async handleProviderCallback(
    _provider: string,
    _payload: unknown,
  ): Promise<AR<IBotsService["handleProviderCallback"]>> {
    return [];
  }

  async handleProviderCallbackResponse(
    _provider: string,
    _payload: unknown,
  ): Promise<AR<IBotsService["handleProviderCallbackResponse"]>> {
    return asResult({ ok: false, status: 400, replies: [] });
  }
}

export function registerAutomationsMockServices(
  services: MockServiceRegistrar,
  runtime: MockRuntime,
): void {
  services.register(IOffPeakTaskService, new MockOffPeakTaskService());
  services.register(IBotsService, new MockBotsService(runtime));
}
