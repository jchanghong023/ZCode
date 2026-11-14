// 模拟工作区资产领域：子智能体、命令、钩子、记忆、技能、输出风格。
// 资产列表为只读投影（空集合）；写操作明确抛错，不返回假成功。
import {
  ICommandsService,
  IHooksService,
  IMemoryService,
  IOutputStyleService,
  ISkillsService,
  ISubagentsService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── 子智能体 / 命令 / 钩子 / 记忆 / 技能 / 输出风格 ──

export class MockSubagentsService implements ISubagentsService {
  async list(_params: P<ISubagentsService["list"]>): Promise<AR<ISubagentsService["list"]>> {
    return { agents: [] } as unknown as AR<ISubagentsService["list"]>;
  }

  async setEnabled(_params: P<ISubagentsService["setEnabled"]>): Promise<void> {}

  async setBuiltInModelOverride(
    _params: P<ISubagentsService["setBuiltInModelOverride"]>,
  ): Promise<void> {}

  async setPluginAgentModelOverride(
    _params: P<ISubagentsService["setPluginAgentModelOverride"]>,
  ): Promise<void> {}

  async getPrimaryUserAgentsDirectory(
    _params: P<ISubagentsService["getPrimaryUserAgentsDirectory"]>,
  ) {
    return { path: "~/.zcode/agents（模拟）" };
  }

  async createAgent(
    _params: P<ISubagentsService["createAgent"]>,
  ): Promise<AR<ISubagentsService["createAgent"]>> {
    throw new Error("mock: 子智能体创建未启用");
  }

  async updateAgent(
    _params: P<ISubagentsService["updateAgent"]>,
  ): Promise<AR<ISubagentsService["updateAgent"]>> {
    throw new Error("mock: 子智能体更新未启用");
  }

  async deleteAgent(_params: P<ISubagentsService["deleteAgent"]>): Promise<void> {}
}

export class MockCommandsService implements ICommandsService {
  async list(_params: P<ICommandsService["list"]>): Promise<AR<ICommandsService["list"]>> {
    return { commands: [] } as unknown as AR<ICommandsService["list"]>;
  }

  async writeCommandFile(
    _params: P<ICommandsService["writeCommandFile"]>,
  ): Promise<AR<ICommandsService["writeCommandFile"]>> {
    throw new Error("mock: 命令创建未启用");
  }

  async updateCommandFile(
    _params: P<ICommandsService["updateCommandFile"]>,
  ): Promise<AR<ICommandsService["updateCommandFile"]>> {
    throw new Error("mock: 命令更新未启用");
  }

  async deleteCommandFile(_params: P<ICommandsService["deleteCommandFile"]>): Promise<void> {}

  async setCommandEnabled(_params: P<ICommandsService["setCommandEnabled"]>): Promise<void> {}

  async getPrimaryUserCommandsDirectory(
    _params?: P<ICommandsService["getPrimaryUserCommandsDirectory"]>,
  ) {
    return { path: "~/.zcode/commands（模拟）" };
  }
}

export class MockHooksService implements IHooksService {
  async loadHooks(_params: P<IHooksService["loadHooks"]>): Promise<AR<IHooksService["loadHooks"]>> {
    return { hooks: [] } as unknown as AR<IHooksService["loadHooks"]>;
  }

  async saveHooks(_params: P<IHooksService["saveHooks"]>): Promise<void> {}

  async grantWorkspaceHookTrust(
    _params: P<NonNullable<IHooksService["grantWorkspaceHookTrust"]>>,
  ): Promise<AR<NonNullable<IHooksService["grantWorkspaceHookTrust"]>>> {
    return { skills: [] } as unknown as AR<NonNullable<IHooksService["grantWorkspaceHookTrust"]>>;
  }
}

export class MockMemoryService implements IMemoryService {
  async loadMemory(
    _params: P<IMemoryService["loadMemory"]>,
  ): Promise<AR<IMemoryService["loadMemory"]>> {
    return { content: "" } as unknown as AR<IMemoryService["loadMemory"]>;
  }

  async saveMemory(_params: P<IMemoryService["saveMemory"]>): Promise<void> {}

  async clearMemory(_params: P<IMemoryService["clearMemory"]>): Promise<void> {}

  async getUserMemoryDirectory() {
    return { path: "~/.zcode/memory（模拟）" };
  }

  async listProjectMemories() {
    return [];
  }

  async readProjectMemoryFile(
    _params: P<IMemoryService["readProjectMemoryFile"]>,
  ): Promise<AR<IMemoryService["readProjectMemoryFile"]>> {
    return { content: "", exists: false as const } as unknown as AR<
      IMemoryService["readProjectMemoryFile"]
    >;
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

  async setEnabled(_params: P<ISkillsService["setEnabled"]>): Promise<void> {}

  async buildPromptContext(
    _params: P<ISkillsService["buildPromptContext"]>,
  ): Promise<AR<ISkillsService["buildPromptContext"]>> {
    return { context: "" } as unknown as AR<ISkillsService["buildPromptContext"]>;
  }

  async copyToCommon(_params: P<ISkillsService["copyToCommon"]>): Promise<{ newPath: string }> {
    return { newPath: "~/.zcode/skills（模拟）" };
  }

  async removeFromCommon(_params: P<ISkillsService["removeFromCommon"]>): Promise<void> {}

  async deleteSkill(_params: P<ISkillsService["deleteSkill"]>): Promise<void> {}
}

export class MockOutputStyleService implements IOutputStyleService {
  async listStyles() {
    return { styles: [] };
  }

  async addStyle(_params: { config: unknown }): Promise<void> {}

  async updateStyle(_params: { id: string; config: unknown }): Promise<void> {}

  async deleteStyle(_params: { id: string }): Promise<void> {}

  async getUserStylesDirectory() {
    return { path: "~/.zcode/output-styles（模拟）" };
  }

  async setActiveStyle(_params: { styleId: string }): Promise<void> {}

  async getActiveStyle() {
    return { styleId: null };
  }
}

export function registerAssetsMockServices(services: MockServiceRegistrar): void {
  services.register(ISubagentsService, new MockSubagentsService());
  services.register(ICommandsService, new MockCommandsService());
  services.register(IHooksService, new MockHooksService());
  services.register(IMemoryService, new MockMemoryService());
  services.register(ISkillsService, new MockSkillsService());
  services.register(IOutputStyleService, new MockOutputStyleService());
}
