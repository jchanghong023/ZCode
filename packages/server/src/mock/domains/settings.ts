// 模拟设置领域：AppSettings；帮助配置保留 HTTP 路由，不提供 client-config RPC。
// AppSettings 是设置页的唯一权威内存态，不落盘。
import { appSettingsPatchSchema, appSettingsSchema, type AppSettings } from "@zcode/shared";
import { ISettingService } from "@zcode/services";
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

export function registerSettingsMockServices(services: MockServiceRegistrar): void {
  services.register(ISettingService, new MockSettingService());
}
