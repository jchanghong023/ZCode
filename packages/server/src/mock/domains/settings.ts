// 模拟设置领域：应用设置、内存模型/工具凭据、客户端配置与首页场景。
// AppSettings 是设置页的唯一权威内存态，不落盘。
import {
  type AppSettings,
  type ClientConfigReadOptions,
  type ClientConfigSnapshot,
} from "@zcode/shared";
import {
  IClientConfigService,
  IClientScenesService,
  ICredentialService,
  ISettingService,
} from "@zcode/services";
import type { MockRuntime } from "../runtime.js";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

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

  constructor(private readonly runtime: MockRuntime) {}

  async get(): Promise<AppSettings> {
    return this.settings;
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    void this.runtime;
  }

  async updateDataBaseDir(_newDir: string | undefined): Promise<void> {}

  async getUserInstructions() {
    return { content: "", filePath: "~/.zcode/AGENTS.md（模拟）" };
  }

  async saveUserInstructions(_content: string) {
    return { filePath: "~/.zcode/AGENTS.md（模拟）" };
  }
}

// ── 凭据（内存 key/value，不落盘） ──

export class MockCredentialService implements ICredentialService {
  private readonly store = new Map<string, string>();

  async inspectStore() {
    return { status: "healthy" as const };
  }

  async recoverStore(
    _params: P<ICredentialService["recoverStore"]>,
  ): Promise<AR<ICredentialService["recoverStore"]>> {
    return { recovered: false } as unknown as AR<ICredentialService["recoverStore"]>;
  }

  async load(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async save(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// ── 客户端配置 / 场景 ──

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

export class MockClientScenesService implements IClientScenesService {
  async list(): Promise<AR<IClientScenesService["list"]>> {
    // 与真实云端 scenes 同形状：draft-suggestion 场景驱动首页快捷操作。
    return {
      code: 0,
      msg: "ok",
      data: [
        {
          namespace: "zcode-mock",
          scene: "draft-suggestion",
          options: {
            prompts: {
              id: "prompts",
              type: "group",
              contents: {},
              labels: {},
              items: [
                {
                  id: "weekly-report",
                  type: "prompt",
                  contents: {
                    cn: "帮我总结本周的工作进展，整理成一份周报。",
                    en: "Summarize this week's progress into a report.",
                  },
                  labels: { cn: "周报总结", en: "Weekly report" },
                  img: "clipboard-check",
                },
                {
                  id: "bug-fix",
                  type: "prompt",
                  contents: {
                    cn: "帮我定位并修复当前项目里的报错。",
                    en: "Locate and fix the errors in this project.",
                  },
                  labels: { cn: "报错修复", en: "Fix errors" },
                  img: "bug",
                },
                {
                  id: "ppt",
                  type: "prompt",
                  contents: {
                    cn: "帮我制作一份产品介绍 PPT 大纲。",
                    en: "Draft an outline for a product deck.",
                  },
                  labels: { cn: "PPT 制作", en: "Make a deck" },
                  img: "presentation",
                },
                {
                  id: "off-peak",
                  type: "prompt",
                  contents: {
                    cn: "创建一个闲时任务，在低峰期自动完成长耗时工作。",
                    en: "Create an off-peak task for long jobs.",
                  },
                  labels: { cn: "闲时任务", en: "Off-peak task" },
                  img: "clock",
                  on_finish: "NAVIGATE:AUTOMATIONS:OFFPEAK",
                },
              ],
            },
          },
        },
      ],
    } as unknown as AR<IClientScenesService["list"]>;
  }
}

export function registerSettingsMockServices(
  services: MockServiceRegistrar,
  runtime: MockRuntime,
): void {
  services.register(ISettingService, new MockSettingService(runtime));
  services.register(ICredentialService, new MockCredentialService());
  services.register(IClientConfigService, new MockClientConfigService());
  services.register(IClientScenesService, new MockClientScenesService());
}
