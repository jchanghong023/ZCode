// 模拟配置同步领域：MCP / 插件 / 技能 / 用户配置 / 设备同步状态与首次迁移提示。
// 同步清单是只读投影；不支持写入时按契约返回不可写，不伪造成功。
import type { UserConfigSyncCategory, UserConfigSyncPayloadMap } from "@zcode/shared";
import {
  IDeviceSyncStateService,
  IMcpSyncService,
  IPluginSyncService,
  ISettingsSyncService,
  ISkillSyncService,
  IUserConfigSyncService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── MCP / 插件 / 技能 / 用户配置同步 ──

function emptySyncList() {
  return { items: [], categories: [] };
}

export class MockMcpSyncService implements IMcpSyncService {
  async loadMcpFromUserDirectory(
    _params: P<IMcpSyncService["loadMcpFromUserDirectory"]>,
  ): Promise<AR<IMcpSyncService["loadMcpFromUserDirectory"]>> {
    return { servers: [] } as unknown as AR<IMcpSyncService["loadMcpFromUserDirectory"]>;
  }

  async listWorkspaceMcpServerStatuses(
    _params: P<IMcpSyncService["listWorkspaceMcpServerStatuses"]>,
  ): Promise<AR<IMcpSyncService["listWorkspaceMcpServerStatuses"]>> {
    return { servers: [], mode: "all" as const } as unknown as AR<
      IMcpSyncService["listWorkspaceMcpServerStatuses"]
    >;
  }

  async setWorkspaceMcpTrust(
    _params: P<NonNullable<IMcpSyncService["setWorkspaceMcpTrust"]>>,
  ): Promise<AR<NonNullable<IMcpSyncService["setWorkspaceMcpTrust"]>>> {
    return { applied: false as const } as unknown as AR<
      NonNullable<IMcpSyncService["setWorkspaceMcpTrust"]>
    >;
  }

  async saveMcpToUserDirectory(
    _params: P<IMcpSyncService["saveMcpToUserDirectory"]>,
  ): Promise<void> {}

  async listSyncItems(): Promise<AR<IMcpSyncService["listSyncItems"]>> {
    return emptySyncList() as unknown as AR<IMcpSyncService["listSyncItems"]>;
  }

  async getSyncContentHashes(
    _params: P<IMcpSyncService["getSyncContentHashes"]>,
  ): Promise<AR<IMcpSyncService["getSyncContentHashes"]>> {
    return { hashes: {} } as unknown as AR<IMcpSyncService["getSyncContentHashes"]>;
  }

  async checkSyncWriteAccess(): Promise<AR<IMcpSyncService["checkSyncWriteAccess"]>> {
    return { writable: false as const, reason: "mock" as const } as unknown as AR<
      IMcpSyncService["checkSyncWriteAccess"]
    >;
  }

  async exportSyncItems(
    _params: P<IMcpSyncService["exportSyncItems"]>,
  ): Promise<AR<IMcpSyncService["exportSyncItems"]>> {
    return { items: [] } as unknown as AR<IMcpSyncService["exportSyncItems"]>;
  }

  async importSyncItems(
    _params: P<IMcpSyncService["importSyncItems"]>,
  ): Promise<AR<IMcpSyncService["importSyncItems"]>> {
    return { imported: 0, failed: 0 } as unknown as AR<IMcpSyncService["importSyncItems"]>;
  }
}

export class MockPluginSyncService implements IPluginSyncService {
  async exportMarketplaceSourceArchive(
    _params: P<IPluginSyncService["exportMarketplaceSourceArchive"]>,
  ): Promise<AR<IPluginSyncService["exportMarketplaceSourceArchive"]>> {
    throw new Error("mock: 插件同步未启用");
  }

  async inspectMarketplaceSourceMirror(
    _params: P<IPluginSyncService["inspectMarketplaceSourceMirror"]>,
  ): Promise<AR<IPluginSyncService["inspectMarketplaceSourceMirror"]>> {
    throw new Error("mock: 插件同步未启用");
  }

  async importMarketplaceSourceArchive(
    _params: P<IPluginSyncService["importMarketplaceSourceArchive"]>,
  ): Promise<AR<IPluginSyncService["importMarketplaceSourceArchive"]>> {
    throw new Error("mock: 插件同步未启用");
  }

  async listSyncItems(): Promise<AR<IPluginSyncService["listSyncItems"]>> {
    return emptySyncList() as unknown as AR<IPluginSyncService["listSyncItems"]>;
  }

  async getSyncContentHashes(
    _params: P<IPluginSyncService["getSyncContentHashes"]>,
  ): Promise<AR<IPluginSyncService["getSyncContentHashes"]>> {
    return { hashes: {} } as unknown as AR<IPluginSyncService["getSyncContentHashes"]>;
  }

  async checkSyncWriteAccess(): Promise<AR<IPluginSyncService["checkSyncWriteAccess"]>> {
    return { writable: false as const, reason: "mock" as const } as unknown as AR<
      IPluginSyncService["checkSyncWriteAccess"]
    >;
  }

  async exportSyncItems(
    _params: P<IPluginSyncService["exportSyncItems"]>,
  ): Promise<AR<IPluginSyncService["exportSyncItems"]>> {
    return { items: [] } as unknown as AR<IPluginSyncService["exportSyncItems"]>;
  }

  async importSyncItems(
    _params: P<IPluginSyncService["importSyncItems"]>,
  ): Promise<AR<IPluginSyncService["importSyncItems"]>> {
    return { imported: 0, failed: 0 } as unknown as AR<IPluginSyncService["importSyncItems"]>;
  }
}

export class MockSkillSyncService implements ISkillSyncService {
  async listSyncItems(): Promise<AR<ISkillSyncService["listSyncItems"]>> {
    return emptySyncList() as unknown as AR<ISkillSyncService["listSyncItems"]>;
  }

  async getSyncContentHashes(
    _params: P<ISkillSyncService["getSyncContentHashes"]>,
  ): Promise<AR<ISkillSyncService["getSyncContentHashes"]>> {
    return { hashes: {} } as unknown as AR<ISkillSyncService["getSyncContentHashes"]>;
  }

  async checkSyncWriteAccess(): Promise<AR<ISkillSyncService["checkSyncWriteAccess"]>> {
    return { writable: false as const, reason: "mock" as const } as unknown as AR<
      ISkillSyncService["checkSyncWriteAccess"]
    >;
  }

  async exportSyncItems(
    _params: P<ISkillSyncService["exportSyncItems"]>,
  ): Promise<AR<ISkillSyncService["exportSyncItems"]>> {
    return { items: [] } as unknown as AR<ISkillSyncService["exportSyncItems"]>;
  }

  async importSyncItems(
    _params: P<ISkillSyncService["importSyncItems"]>,
  ): Promise<AR<ISkillSyncService["importSyncItems"]>> {
    return { imported: 0, failed: 0 } as unknown as AR<ISkillSyncService["importSyncItems"]>;
  }
}

export class MockUserConfigSyncService implements IUserConfigSyncService {
  async listSyncItems(
    _params: P<IUserConfigSyncService["listSyncItems"]>,
  ): Promise<AR<IUserConfigSyncService["listSyncItems"]>> {
    return emptySyncList() as unknown as AR<IUserConfigSyncService["listSyncItems"]>;
  }

  async getSyncContentHashes(
    _params: P<IUserConfigSyncService["getSyncContentHashes"]>,
  ): Promise<AR<IUserConfigSyncService["getSyncContentHashes"]>> {
    return { hashes: {} } as unknown as AR<IUserConfigSyncService["getSyncContentHashes"]>;
  }

  async checkSyncWriteAccess(
    _params: P<IUserConfigSyncService["checkSyncWriteAccess"]>,
  ): Promise<AR<IUserConfigSyncService["checkSyncWriteAccess"]>> {
    return { writable: false as const, reason: "mock" as const } as unknown as AR<
      IUserConfigSyncService["checkSyncWriteAccess"]
    >;
  }

  async exportSyncItems<C extends UserConfigSyncCategory>(_params: {
    category: C;
    keys: string[];
    workspace?: unknown;
  }): Promise<UserConfigSyncPayloadMap[C]> {
    return null as unknown as UserConfigSyncPayloadMap[C];
  }

  async importSyncItems(
    _params: P<IUserConfigSyncService["importSyncItems"]>,
  ): Promise<AR<IUserConfigSyncService["importSyncItems"]>> {
    return { imported: 0, failed: 0 } as unknown as AR<IUserConfigSyncService["importSyncItems"]>;
  }
}

export class MockDeviceSyncStateService implements IDeviceSyncStateService {
  async getDeviceSyncStates(): Promise<AR<IDeviceSyncStateService["getDeviceSyncStates"]>> {
    return {} as unknown as AR<IDeviceSyncStateService["getDeviceSyncStates"]>;
  }

  async recordDeviceSyncResult(
    _params: P<IDeviceSyncStateService["recordDeviceSyncResult"]>,
  ): Promise<AR<IDeviceSyncStateService["recordDeviceSyncResult"]>> {
    throw new Error("mock: 设备同步未启用");
  }
}

export class MockSettingsSyncService {
  async getClaudeAgentsFileMigrationStatus(_request: unknown) {
    return { status: "not-needed" } as never;
  }

  async copyClaudeAgentsFileToZcodeAgentsFile(_request?: unknown) {
    return { copied: false } as never;
  }

  async detect(_request: unknown) {
    return { categories: [] } as never;
  }

  async importSelected(_request: unknown) {
    return { imported: 0, failed: 0 } as never;
  }

  async getFirstRunPromptState() {
    return { handled: true } as never;
  }

  async markFirstRunPromptHandled(): Promise<void> {}
}

export function registerSyncMockServices(services: MockServiceRegistrar): void {
  services.register(IMcpSyncService, new MockMcpSyncService());
  services.register(IPluginSyncService, new MockPluginSyncService());
  services.register(ISkillSyncService, new MockSkillSyncService());
  services.register(IUserConfigSyncService, new MockUserConfigSyncService());
  services.register(IDeviceSyncStateService, new MockDeviceSyncStateService());
  services.register(ISettingsSyncService, new MockSettingsSyncService());
}
