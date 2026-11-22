// 模拟设置领域：帮助配置保留 HTTP 路由，不提供 client-config RPC。
// Web 设置只有这一份权威内存态，不落盘。
import {
  ISettingService,
  createDefaultWebAppSettings,
  webAppSettingsPatchSchema,
  type WebAppSettings,
  type WebSettingService,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

// ── 设置 ──

export class MockSettingService implements WebSettingService {
  private settings = createDefaultWebAppSettings();

  async get(): Promise<WebAppSettings> {
    return this.settings;
  }

  async update(patch: Parameters<WebSettingService["update"]>[0], ...extra: never[]): Promise<void> {
    // 原型不支持桌面账户快照校验；不能忽略额外实参后仍提交设置。
    if (extra.length !== 0) {
      throw Object.assign(new Error("设置更新只接收设置补丁。"), {
        code: "INVALID_ARGUMENT",
        publicMessage: true,
      });
    }
    // 先完整验证再原子合并；partial 解析不能补默认值或吞未知键后污染回读。
    const validated = webAppSettingsPatchSchema.parse(patch);
    this.settings = { ...this.settings, ...validated };
  }
}

export function registerSettingsMockServices(services: MockServiceRegistrar): void {
  services.register<WebSettingService>(ISettingService, new MockSettingService());
}
