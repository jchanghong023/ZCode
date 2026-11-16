// 模拟设置领域：应用设置与客户端配置。
// AppSettings 是设置页的唯一权威内存态，不落盘。
import {
  type AppSettings,
  type ClientConfigReadOptions,
  type ClientConfigSnapshot,
} from "@zcode/shared";
import { IClientConfigService, ISettingService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

// ── 设置 ──

const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "dark",
  language: "zh-CN",
  uiFontSizePx: 14,
  fontSmoothingEnabled: true,
  notificationEnabled: true,
  hideProjectDeviceNames: false,
  interfaceMode: "desktop",
  autoCheckUpdates: false,
} as unknown as AppSettings;

export class MockSettingService implements ISettingService {
  private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };

  async get(): Promise<AppSettings> {
    return this.settings;
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
  }
}

// ── 客户端配置 ──

export class MockClientConfigService implements IClientConfigService {
  async getSnapshot(_options?: ClientConfigReadOptions): Promise<ClientConfigSnapshot> {
    return {
      revision: 1,
      pluginStoreOrder: [],
      vulnerabilityReportUrl: null,
      helpAppConfig: null,
    } as unknown as ClientConfigSnapshot;
  }
}

export function registerSettingsMockServices(services: MockServiceRegistrar): void {
  services.register(ISettingService, new MockSettingService());
  services.register(IClientConfigService, new MockClientConfigService());
}
