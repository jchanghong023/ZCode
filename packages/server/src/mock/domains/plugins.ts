// 模拟插件领域：插件目录/安装/管理、插件 UI 桥与 sampling、App 工具注册。
// 只注册本域服务；权威运行时状态仍集中在 MockRuntime。
import { Emitter, type Event } from "@zcode/rpc";
import {
  IPluginManagementService,
  IPluginUiAppToolsService,
  IPluginUiBridgeService,
  IPluginUiSamplingService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── 插件 ──

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
      capability: { supported: false, reason: "mock" },
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

export function registerPluginsMockServices(services: MockServiceRegistrar): void {
  services.register(IPluginManagementService, new MockPluginManagementService());
  services.register(IPluginUiBridgeService, new MockPluginUiBridgeService());
  services.register(IPluginUiSamplingService, new MockPluginUiSamplingService());
  services.register(IPluginUiAppToolsService, new MockPluginUiAppToolsService());
}
