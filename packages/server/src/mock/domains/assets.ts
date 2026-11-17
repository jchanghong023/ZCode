// 原生子智能体目录；Skill 引用由 agent catalog 提供，不保留独立 skills 服务。
import { ISubagentsService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── 子智能体 / 技能 ──

export class MockSubagentsService implements ISubagentsService {
  async list(_params: P<ISubagentsService["list"]>): Promise<AR<ISubagentsService["list"]>> {
    // 当前目录没有任何已接纳子智能体；能力字段仍须遵守正式结果契约。
    return {
      agents: [],
      userAgents: [],
      pluginAgents: [],
      capability: { userScopeAvailable: false, userScopeReason: "desktop_only" },
      diagnostics: [],
    };
  }
}

export function registerAssetsMockServices(services: MockServiceRegistrar): void {
  services.register(ISubagentsService, new MockSubagentsService());
}
