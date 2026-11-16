// 模拟设置领域：应用设置与客户端配置。
// AppSettings 是设置页的唯一权威内存态，不落盘。
import {
  appSettingsPatchSchema,
  appSettingsSchema,
  type AppSettings,
  type ClientConfigReadOptions,
  type ClientConfigSnapshot,
} from "@zcode/shared";
import { IClientConfigService, ISettingService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

// ── 设置 ──

export class MockSettingService implements ISettingService {
  private settings: AppSettings = appSettingsSchema.parse({});

  async get(): Promise<AppSettings> {
    return this.settings;
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    // 先完整验证再原子合并；partial 解析不能补默认值或吞未知键后污染回读。
    const validated = appSettingsPatchSchema.parse(patch);
    this.settings = { ...this.settings, ...validated };
  }
}

// ── 客户端配置 ──

export class MockClientConfigService implements IClientConfigService {
  async getSnapshot(_options?: ClientConfigReadOptions): Promise<ClientConfigSnapshot> {
    return {
      zsrcUrl: null,
    };
  }
}

export function registerSettingsMockServices(services: MockServiceRegistrar): void {
  services.register(ISettingService, new MockSettingService());
  services.register(IClientConfigService, new MockClientConfigService());
}
