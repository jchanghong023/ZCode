// 模拟工作区资产领域：原生子智能体与技能目录。
// 资产目录保留原生会话所需的空投影，不提供旧管理写面。
import { ISkillsService, ISubagentsService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── 子智能体 / 技能 ──

export class MockSubagentsService implements ISubagentsService {
  async list(_params: P<ISubagentsService["list"]>): Promise<AR<ISubagentsService["list"]>> {
    return { agents: [] } as unknown as AR<ISubagentsService["list"]>;
  }
}

export class MockSkillsService implements ISkillsService {
  async list(_params: P<ISkillsService["list"]>): Promise<AR<ISkillsService["list"]>> {
    // Bugfix：契约 SkillsListResult 要求 skills/capability/diagnostics 三字段齐全。
    // 之前只回 skills，UI setDiagnostics(undefined) 后渲染 diagnostics.filter 直接崩溃
    // （设置页「技能」页签整块落入错误边界）。mock 按契约返回空集合。
    return {
      skills: [],
      capability: { userScopeAvailable: true },
      diagnostics: [],
    };
  }
}

export function registerAssetsMockServices(services: MockServiceRegistrar): void {
  services.register(ISubagentsService, new MockSubagentsService());
  services.register(ISkillsService, new MockSkillsService());
}
