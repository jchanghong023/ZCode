// 模拟协作类服务组：插件、扩展、子智能体、命令、钩子、记忆、技能、输出风格、
// 设置同步、反馈、GenUI、数据同步、MCP/插件/技能同步、语音输入、云内容、营销触达。
// 长尾接口统一用 Parameters/ReturnType 派生签名；空集合返回保证 UI 打开对应页面无错误。
import { Emitter, type Event } from "@zcode/rpc";
import {
  createUuid,
  type UserConfigSyncCategory,
  type UserConfigSyncPayloadMap,
} from "@zcode/shared";
import type {
  ICommandsService,
  IDeviceSyncStateService,
  IExtensionGrantsService,
  IExtensionViewsService,
  IExtensionsService,
  IFeedbackService,
  IGenUiService,
  IHooksService,
  IMcpSyncService,
  IMemoryService,
  IOutputStyleService,
  IPluginManagementService,
  IPluginSyncService,
  IPluginUiAppToolsService,
  IPluginUiBridgeService,
  IPluginUiSamplingService,
  IPluginsService,
  ISkillSyncService,
  ISkillsService,
  ISubagentsService,
  IUserConfigSyncService,
  IVoiceInputService,
} from "@zcode/services";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type R<T extends (...args: never) => unknown> = ReturnType<T>;
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── 插件 ──

export class MockPluginsService implements IPluginsService {
  async getOverview(
    _params: P<IPluginsService["getOverview"]>,
  ): Promise<AR<IPluginsService["getOverview"]>> {
    return {
      availablePlugins: [],
      installedPlugins: [],
      capability: { canInstall: false, canConfigure: false },
    } as unknown as AR<IPluginsService["getOverview"]>;
  }

  async addMarketplace(_params: P<IPluginsService["addMarketplace"]>): Promise<void> {
    throw new Error("mock: 插件市场未启用");
  }

  async removeMarketplace(_params: P<IPluginsService["removeMarketplace"]>): Promise<void> {}

  async updateMarketplace(_params: P<IPluginsService["updateMarketplace"]>): Promise<void> {}

  async installPlugin(_params: P<IPluginsService["installPlugin"]>): Promise<void> {
    throw new Error("mock: 插件安装未启用");
  }

  async uninstallPlugin(_params: P<IPluginsService["uninstallPlugin"]>): Promise<void> {}

  async setPluginEnabled(_params: P<IPluginsService["setPluginEnabled"]>): Promise<void> {}
}

export class MockPluginManagementService implements IPluginManagementService {
  private readonly progressEmitter = new Emitter<{
    operationId: string;
    state: "refreshing";
  }>();

  async listPlugins(
    _params: P<IPluginManagementService["listPlugins"]>,
  ): Promise<AR<IPluginManagementService["listPlugins"]>> {
    return { plugins: [], marketplaces: [], diagnostics: [] } as unknown as AR<
      IPluginManagementService["listPlugins"]
    >;
  }

  async getPluginReferenceCatalog(
    _params: P<IPluginManagementService["getPluginReferenceCatalog"]>,
  ): Promise<AR<IPluginManagementService["getPluginReferenceCatalog"]>> {
    return { authority: "workspace" as const, plugins: [] } as unknown as AR<
      IPluginManagementService["getPluginReferenceCatalog"]
    >;
  }

  async resolveSuggestedPluginReference(
    _params: P<IPluginManagementService["resolveSuggestedPluginReference"]>,
  ): Promise<AR<IPluginManagementService["resolveSuggestedPluginReference"]>> {
    throw new Error("mock: 建议插件解析未启用");
  }

  onDynamicPluginOperationProgress(
    operationId: string,
  ): Event<{ operationId: string; state: "refreshing" }> {
    void operationId;
    return this.progressEmitter.event;
  }

  async getPluginsOverview(
    _params: P<IPluginManagementService["getPluginsOverview"]>,
  ): Promise<AR<IPluginManagementService["getPluginsOverview"]>> {
    return {
      marketplaces: [],
      availablePlugins: [],
      installedPlugins: [],
      restorableBuiltins: [],
      diagnostics: [],
      capability: { canInstall: false, canConfigure: false },
    } as unknown as AR<IPluginManagementService["getPluginsOverview"]>;
  }

  async addPluginMarketplace(
    _params: P<IPluginManagementService["addPluginMarketplace"]>,
  ): Promise<AR<IPluginManagementService["addPluginMarketplace"]>> {
    throw new Error("mock: 插件市场未启用");
  }

  async removePluginMarketplace(
    _params: P<IPluginManagementService["removePluginMarketplace"]>,
  ): Promise<AR<IPluginManagementService["removePluginMarketplace"]>> {
    return {} as unknown as AR<IPluginManagementService["removePluginMarketplace"]>;
  }

  async updatePluginMarketplace(
    _params: P<IPluginManagementService["updatePluginMarketplace"]>,
  ): Promise<AR<IPluginManagementService["updatePluginMarketplace"]>> {
    return {} as unknown as AR<IPluginManagementService["updatePluginMarketplace"]>;
  }

  async installPlugin(
    _params: P<IPluginManagementService["installPlugin"]>,
  ): Promise<AR<IPluginManagementService["installPlugin"]>> {
    throw new Error("mock: 插件安装未启用");
  }

  async cancelPluginOperation(
    _params: P<IPluginManagementService["cancelPluginOperation"]>,
  ): Promise<AR<IPluginManagementService["cancelPluginOperation"]>> {
    return { operationId: "", cancelled: false } as unknown as AR<
      IPluginManagementService["cancelPluginOperation"]
    >;
  }

  async uninstallPlugin(
    _params: P<IPluginManagementService["uninstallPlugin"]>,
  ): Promise<AR<IPluginManagementService["uninstallPlugin"]>> {
    return { diagnostics: [] } as unknown as AR<IPluginManagementService["uninstallPlugin"]>;
  }

  async updatePlugin(
    _params: P<IPluginManagementService["updatePlugin"]>,
  ): Promise<AR<IPluginManagementService["updatePlugin"]>> {
    throw new Error("mock: 插件更新未启用");
  }

  async restoreBuiltinPlugin(
    _params: P<IPluginManagementService["restoreBuiltinPlugin"]>,
  ): Promise<AR<IPluginManagementService["restoreBuiltinPlugin"]>> {
    throw new Error("mock: 内置插件恢复未启用");
  }

  async configurePlugin(
    _params: P<IPluginManagementService["configurePlugin"]>,
  ): Promise<AR<IPluginManagementService["configurePlugin"]>> {
    throw new Error("mock: 插件配置未启用");
  }

  async resetPluginConfig(
    _params: P<IPluginManagementService["resetPluginConfig"]>,
  ): Promise<AR<IPluginManagementService["resetPluginConfig"]>> {
    throw new Error("mock: 插件配置未启用");
  }

  async validatePlugin(
    _params: P<IPluginManagementService["validatePlugin"]>,
  ): Promise<AR<IPluginManagementService["validatePlugin"]>> {
    return { ok: true as const, issues: [] } as unknown as AR<
      IPluginManagementService["validatePlugin"]
    >;
  }

  async describePlugin(
    _params: P<IPluginManagementService["describePlugin"]>,
  ): Promise<AR<IPluginManagementService["describePlugin"]>> {
    return null as unknown as AR<IPluginManagementService["describePlugin"]>;
  }

  async setPluginEnabled(
    _params: P<IPluginManagementService["setPluginEnabled"]>,
  ): Promise<AR<IPluginManagementService["setPluginEnabled"]>> {
    return {} as unknown as AR<IPluginManagementService["setPluginEnabled"]>;
  }
}

export class MockPluginUiBridgeService implements IPluginUiBridgeService {
  async validateInstance(_params: P<IPluginUiBridgeService["validateInstance"]>): Promise<void> {}

  async recycleInstance(_params: P<IPluginUiBridgeService["recycleInstance"]>): Promise<boolean> {
    return false;
  }

  async closeInstance(_params: P<IPluginUiBridgeService["closeInstance"]>): Promise<void> {}

  async prepareSandbox(
    _params: P<IPluginUiBridgeService["prepareSandbox"]>,
  ): Promise<AR<IPluginUiBridgeService["prepareSandbox"]>> {
    throw new Error("mock: 插件 UI 沙箱未启用");
  }

  async callTool(
    _params: P<IPluginUiBridgeService["callTool"]>,
  ): Promise<AR<IPluginUiBridgeService["callTool"]>> {
    throw new Error("mock: 插件 UI 工具调用未启用");
  }

  async cancelToolCall(
    _params: P<IPluginUiBridgeService["cancelToolCall"]>,
  ): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }

  async readResource(
    _params: P<IPluginUiBridgeService["readResource"]>,
  ): Promise<AR<IPluginUiBridgeService["readResource"]>> {
    return { contents: [] } as unknown as AR<IPluginUiBridgeService["readResource"]>;
  }

  async listResources(
    _params: P<IPluginUiBridgeService["listResources"]>,
  ): Promise<AR<IPluginUiBridgeService["listResources"]>> {
    return { resources: [] } as unknown as AR<IPluginUiBridgeService["listResources"]>;
  }

  async listResourceTemplates(
    _params: P<IPluginUiBridgeService["listResourceTemplates"]>,
  ): Promise<AR<IPluginUiBridgeService["listResourceTemplates"]>> {
    return { templates: [] } as unknown as AR<IPluginUiBridgeService["listResourceTemplates"]>;
  }

  async subscribeResource(_params: P<IPluginUiBridgeService["subscribeResource"]>): Promise<void> {}

  async unsubscribeResource(
    _params: P<IPluginUiBridgeService["unsubscribeResource"]>,
  ): Promise<void> {}

  async listSurfaces(
    _params: P<IPluginUiBridgeService["listSurfaces"]>,
  ): Promise<AR<IPluginUiBridgeService["listSurfaces"]>> {
    return [] as unknown as AR<IPluginUiBridgeService["listSurfaces"]>;
  }
}

export class MockPluginUiSamplingService implements IPluginUiSamplingService {
  async sample(
    _params: P<IPluginUiSamplingService["sample"]>,
  ): Promise<AR<IPluginUiSamplingService["sample"]>> {
    throw new Error("mock: sampling 未启用");
  }

  async cancelSampling(
    _params: P<IPluginUiSamplingService["cancelSampling"]>,
  ): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }
}

export class MockPluginUiAppToolsService implements IPluginUiAppToolsService {
  async registerAppTools(
    _params: P<IPluginUiAppToolsService["registerAppTools"]>,
  ): Promise<AR<IPluginUiAppToolsService["registerAppTools"]>> {
    return { accepted: 0, rejected: [] } as unknown as AR<
      IPluginUiAppToolsService["registerAppTools"]
    >;
  }

  async unregisterAppTools(
    _params: P<IPluginUiAppToolsService["unregisterAppTools"]>,
  ): Promise<{ removed: number }> {
    return { removed: 0 };
  }

  async claimAppToolCall(
    _params: P<IPluginUiAppToolsService["claimAppToolCall"]>,
  ): Promise<AR<IPluginUiAppToolsService["claimAppToolCall"]>> {
    throw new Error("mock: app tools 未启用");
  }

  async resolveAppToolCall(
    _params: P<IPluginUiAppToolsService["resolveAppToolCall"]>,
  ): Promise<AR<IPluginUiAppToolsService["resolveAppToolCall"]>> {
    return { accepted: false } as unknown as AR<IPluginUiAppToolsService["resolveAppToolCall"]>;
  }
}

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
    return { skills: [] } as unknown as AR<ISkillsService["list"]>;
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
