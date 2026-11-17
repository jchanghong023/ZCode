// 模拟模型领域：Provider 设置视图、模型选择与用量统计。
import { Emitter, type Event } from "@zcode/rpc";
import { BIGMODEL_PROVIDER_ID } from "@zcode/shared";
import {
  IModelSelectionService,
  IProviderSettingsService,
  IUsageStatsService,
  type ModelSelectionView,
  type ProviderSettingsView,
} from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

// ── Provider / 模型选择视图 ──

function completeModelConfig(modelId: string) {
  return {
    enabled: true,
    properties: {
      requiresMfjsToolSchema: false,
      contextWindow: 128_000,
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: true,
      },
      outputFormat: { supportsText: true },
      supportsToolCall: true,
      supportsJsonSchemaOutput: false,
      supportsNativeWebSearch: false,
      supportsMidConversationSystem: true,
    },
    optionSpecs: {
      reasoningLevel: {
        values: modelId.includes("Flash")
          ? ["low", "medium", "high", "max"]
          : ["low", "medium", "high"],
        map: "{}",
      },
      maxOutputTokens: { max: 16_384, map: "{'max_tokens': maxOutputTokens}" },
    },
  };
}

const MOCK_MODEL_IDS = ["GLM-5.3-Flash", "GLM-5.3"];

function buildProviderSettingsView(): ProviderSettingsView {
  return {
    revision: 1,
    providerTemplates: [
      {
        templateId: "zai-api",
        templateNameMap: { "zh-CN": "Z.ai Coding Plan", "en-US": "Z.ai Coding Plan" },
        config: {
          builtinModelIds: [...MOCK_MODEL_IDS],
          personalModelIds: [],
          modelOrder: [...MOCK_MODEL_IDS],
          access: {
            type: "zhipu-account",
            accountType: "bigmodel",
            mode: "start-plan",
            entitled: true,
          },
          api: { type: "anthropic-messages", baseUrl: "https://mock.zcode.local/api/anthropic" },
          logo: { type: "builtin", key: "zai" },
        },
      },
    ],
    providerOrder: [BIGMODEL_PROVIDER_ID],
    providers: [
      {
        providerId: "bigmodel",
        providerName: "智谱 Coding Plan",
        templateId: "zai-api",
        enabled: true,
        executable: true,
        effectiveConfig: {
          builtinModelIds: [...MOCK_MODEL_IDS],
          personalModelIds: [],
          modelOrder: [...MOCK_MODEL_IDS],
          access: {
            type: "zhipu-account",
            accountType: "bigmodel",
            mode: "start-plan",
            entitled: true,
          },
          api: { type: "anthropic-messages", baseUrl: "https://mock.zcode.local/api/anthropic" },
          logo: { type: "builtin", key: "zai" },
        },
        issues: [],
        models: MOCK_MODEL_IDS.map((modelId) => ({
          kind: "candidate" as const,
          modelId,
          builtin: true,
          effectiveBuiltinConfig: completeModelConfig(modelId),
          effectiveConfig: completeModelConfig(modelId),
          enabled: true,
          executable: true,
          selectable: true,
          issues: [],
        })),
      },
    ],
  };
}

export class MockProviderSettingsService implements IProviderSettingsService {
  private readonly changeEmitter = new Emitter<ProviderSettingsView>();
  readonly onDidChange: Event<ProviderSettingsView> = this.changeEmitter.event;

  async getView(): Promise<ProviderSettingsView> {
    return buildProviderSettingsView();
  }

  async refresh(_reason: string): Promise<ProviderSettingsView> {
    // 当前目录没有可变事实；刷新只读取内存，不能伪造新版本、变更事件或外部连通性。
    return this.getView();
  }
}

export class MockModelSelectionService implements IModelSelectionService {
  private readonly changeEmitter = new Emitter<ModelSelectionView>();
  readonly onDidChange: Event<ModelSelectionView> = this.changeEmitter.event;
  private revision = 1;

  async getView(input?: {
    selection: {
      providerId: string;
      modelId: string;
      options?: { reasoningLevel?: string };
    } | null;
  }): Promise<ModelSelectionView> {
    const preferred = input?.selection
      ? input.selection
      : { providerId: "bigmodel", modelId: "GLM-5.3-Flash", options: { reasoningLevel: "max" } };
    return {
      revision: this.revision,
      providers: [
        {
          providerId: "bigmodel",
          providerName: "智谱 Coding Plan",
          templateId: "zai-api",
          config: {
            builtinModelIds: [...MOCK_MODEL_IDS],
            personalModelIds: [],
            modelOrder: [...MOCK_MODEL_IDS],
            access: {
              type: "zhipu-account",
              accountType: "bigmodel",
              mode: "start-plan",
              entitled: true,
            },
            api: { type: "anthropic-messages", baseUrl: "https://mock.zcode.local/api/anthropic" },
            logo: { type: "builtin", key: "zai" },
          },
          models: MOCK_MODEL_IDS.map((modelId) => ({
            modelId,
            config: completeModelConfig(modelId),
          })),
        },
      ],
      preferredSelection: preferred,
      effectiveSelection: preferred,
    };
  }
}

// 收口原因：没有套餐后端，只提供当前消费者所需的真实无权益投影，不制造统计或写入成功。
export class MockUsageStatsService implements IUsageStatsService {
  async getCodingPlanResetStatus(
    _request: P<IUsageStatsService["getCodingPlanResetStatus"]>,
  ): Promise<AR<IUsageStatsService["getCodingPlanResetStatus"]>> {
    return {
      availableFiveHourResets: [],
      availableWeekResets: [],
      latestFiveHourResetHistory: null,
      latestWeekResetHistory: null,
      hasUnreadHistory: false,
    };
  }

  async getEntitlementSnapshot(
    _request?: P<IUsageStatsService["getEntitlementSnapshot"]>,
  ): Promise<AR<IUsageStatsService["getEntitlementSnapshot"]>> {
    return {
      generatedAt: Date.now(),
      authenticated: false,
      unavailableReason: "not_configured",
      provider: null,
      remaining: null,
      subscription: null,
      quota: null,
    };
  }
}

export function registerModelsMockServices(services: MockServiceRegistrar): void {
  services.register(IProviderSettingsService, new MockProviderSettingsService());
  services.register(IModelSelectionService, new MockModelSelectionService());
  services.register(IUsageStatsService, new MockUsageStatsService());
}
