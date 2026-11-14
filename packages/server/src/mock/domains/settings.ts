// 模拟设置领域：应用设置、内存凭据、OAuth 账号、客户端配置与首页场景。
// AppSettings 是设置页的唯一权威内存态，不落盘。
import { Emitter, type Event } from "@zcode/rpc";
import {
  BIGMODEL_PROVIDER_ID,
  createUuid,
  type AppSettings,
  type ClientConfigReadOptions,
  type ClientConfigSnapshot,
  type OAuthAccountAvailability,
  type OAuthCallbackResult,
  type OAuthCachedSessionRestoreResult,
  type OAuthProviderId,
  type OAuthProviderMeta,
  type OAuthSessionState,
  type OAuthStartResponse,
  type OAuthWebsiteSession,
  type UserInfo,
} from "@zcode/shared";
import {
  IClientConfigService,
  IClientScenesService,
  ICredentialService,
  IOAuthService,
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

// ── OAuth（永远已登录的模拟账号） ──

const MOCK_USER: UserInfo = {
  id: "mock-user-001",
  username: "nsfnaqdr",
  displayName: "nsfnaqdr",
};

export class MockOAuthService implements IOAuthService {
  private readonly sessionChangeEmitter = new Emitter<OAuthSessionState>();
  readonly onDidChangeSession: Event<OAuthSessionState> = this.sessionChangeEmitter.event;

  async getProviders(): Promise<OAuthProviderMeta[]> {
    return [
      { id: BIGMODEL_PROVIDER_ID, displayName: "智谱开放平台", enabled: true, order: 0 },
      { id: "zai", displayName: "Z.ai", enabled: true, order: 1 },
    ];
  }

  async getActiveProvider(): Promise<OAuthProviderId | null> {
    return BIGMODEL_PROVIDER_ID;
  }

  async getAccountAvailability(): Promise<OAuthAccountAvailability> {
    return {
      loginProvider: BIGMODEL_PROVIDER_ID,
      userId: MOCK_USER.id,
      sessionRevision: "mock-rev-1",
      families: ["start-plan"] as unknown as OAuthAccountAvailability["families"],
    };
  }

  async getWebsiteSession(): Promise<OAuthWebsiteSession | null> {
    return {
      loginProvider: BIGMODEL_PROVIDER_ID,
      userId: MOCK_USER.id,
      sessionRevision: "mock-rev-1",
      zcodeJwtToken: null,
      legacyOAuthToken: null,
    };
  }

  async refreshAccountProfile(
    _expected?: Partial<OAuthAccountAvailability>,
  ): Promise<OAuthAccountAvailability> {
    return this.getAccountAvailability();
  }

  async restoreCachedSession(): Promise<UserInfo | null> {
    return MOCK_USER;
  }

  async restoreCachedSessionState(): Promise<OAuthCachedSessionRestoreResult> {
    return { status: "authenticated", userInfo: MOCK_USER };
  }

  async restoreSession(): Promise<UserInfo | null> {
    return MOCK_USER;
  }

  async startOAuth(provider: OAuthProviderId): Promise<OAuthStartResponse> {
    return { provider, authorizeUrl: "about:blank#mock-oauth", state: `state_${createUuid()}` };
  }

  async startOAuthWithPolling(provider: OAuthProviderId): Promise<OAuthStartResponse> {
    return this.startOAuth(provider);
  }

  async pollPendingOAuth(): Promise<OAuthCallbackResult | null> {
    return null;
  }

  async handleCallback(_url: string): Promise<OAuthCallbackResult | null> {
    return null;
  }

  async refreshToken(_provider?: OAuthProviderId): Promise<void> {}

  async logout(_provider?: OAuthProviderId): Promise<void> {
    this.sessionChangeEmitter.fire("signed-out");
  }

  async logoutAll(): Promise<void> {
    this.sessionChangeEmitter.fire("signed-out");
  }

  async cancelPending(_provider?: OAuthProviderId): Promise<void> {}
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
  services.register(IOAuthService, new MockOAuthService());
  services.register(IClientConfigService, new MockClientConfigService());
  services.register(IClientScenesService, new MockClientScenesService());
}
