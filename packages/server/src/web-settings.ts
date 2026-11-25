import {
  createDefaultWebAppSettings,
  webAppSettingsPatchSchema,
  type WebAppSettings,
  type WebSettingService,
} from "@zcode/services";

export class WebSettings implements WebSettingService {
  private settings: WebAppSettings;
  constructor(
    saved?: WebAppSettings,
    private readonly persist?: (settings: WebAppSettings) => void,
  ) {
    this.settings = {
      ...createDefaultWebAppSettings(),
      ...webAppSettingsPatchSchema.parse(saved ?? {}),
    };
  }

  async get(): Promise<WebAppSettings> {
    return structuredClone(this.settings);
  }

  async update(
    patch: Parameters<WebSettingService["update"]>[0],
    ...extra: never[]
  ): Promise<void> {
    // Web 更新只接受一个补丁；额外参数必须在提交之前拒绝。
    if (extra.length !== 0) {
      throw Object.assign(new Error("设置更新只接收设置补丁。"), {
        code: "INVALID_ARGUMENT",
        publicMessage: true,
      });
    }
    // 先完整验证再原子合并；partial 解析不能补默认值或吞未知键后污染回读。
    const validated = webAppSettingsPatchSchema.parse(patch);
    const next = { ...this.settings, ...validated };
    this.persist?.(next);
    this.settings = next;
  }
}
