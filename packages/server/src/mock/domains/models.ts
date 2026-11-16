// 模拟模型领域：Provider 设置视图、模型选择与用量统计。
import { Emitter, type Event } from "@zcode/rpc";
import {
  BIGMODEL_PROVIDER_ID,
  type AppUsageSnapshot,
  type CodingPlanUsageSnapshot,
} from "@zcode/shared";
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

function buildProviderSettingsView(revision = 1): ProviderSettingsView {
  return {
    revision,
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
  private revision = 1;

  async getView(): Promise<ProviderSettingsView> {
    return buildProviderSettingsView(this.revision);
  }

  async refresh(_reason: string): Promise<ProviderSettingsView> {
    this.revision += 1;
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

// ── 用量与套餐 ──

function createEmptyAppUsageSnapshot(range: AppUsageSnapshot["range"]): AppUsageSnapshot {
  return {
    range,
    generatedAt: Date.now(),
    timeZone: "UTC",
    source: "agent-db",
    summary: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheHitRate: 0,
      totalSessions: 0,
      totalTurns: 0,
      toolCallCount: 0,
      toolErrorRate: 0,
      modelErrorRate: 0,
      avgTimeToFirstTokenMs: null,
      avgTurnDurationMs: null,
      activeDays: 0,
      currentStreakDays: 0,
      longestSessionMs: 0,
      longestStreakDays: 0,
      peakDayTokens: 0,
      favoriteModel: null,
    },
    heatmap: { startDate: null, endDate: null, maxTokens: 0, weeks: [] },
    dailyModelUsage: [],
    models: [],
    tools: [],
  };
}

const EMPTY_USAGE_DETAIL_SUMMARY: CodingPlanUsageSnapshot["detail"]["model"] = {
  cacheHitRate: null,
  cacheHitRateTrend: null,
  totalCredits: 0,
  totalCreditsTrend: null,
  averageDailyCredits: 0,
  averageDailyCreditsTrend: null,
};

function createEmptyCodingPlanUsageSnapshot(
  request: P<IUsageStatsService["getCodingPlanUsageSnapshot"]>,
): CodingPlanUsageSnapshot {
  return {
    range: request.range,
    rangeStartDate: "",
    rangeEndDate: "",
    generatedAt: Date.now(),
    sourceProvider: { id: request.preferredProviderId, name: request.preferredProviderId },
    quota: null,
    activity: {
      summary: {
        totalTokens: 0,
        peakDailyTokens: 0,
        peakDailyTokensDate: null,
        totalUsageDurationMs: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        favoriteModelName: null,
      },
      heatmap: { startDate: null, endDate: null, maxTokens: 0, weeks: [] },
    },
    detail: { model: EMPTY_USAGE_DETAIL_SUMMARY, tool: EMPTY_USAGE_DETAIL_SUMMARY },
    modelUsage: {
      xTime: [],
      granularity: "day",
      totalModelCallCount: 0,
      totalTokensUsage: 0,
      modelDataList: [],
      modelSummaryList: [],
    },
    toolUsage: {
      xTime: [],
      granularity: "day",
      toolDataList: [],
      toolSummaryList: [],
    },
    health: { xTime: [], proMaxDecodeSpeed: [], liteDecodeSpeed: [] },
  };
}

export class MockUsageStatsService implements IUsageStatsService {
  async getAppUsageSnapshot(
    request: P<IUsageStatsService["getAppUsageSnapshot"]>,
  ): Promise<AR<IUsageStatsService["getAppUsageSnapshot"]>> {
    return createEmptyAppUsageSnapshot(request.range);
  }

  async getCodingPlanUsageSnapshot(
    request: P<IUsageStatsService["getCodingPlanUsageSnapshot"]>,
  ): Promise<AR<IUsageStatsService["getCodingPlanUsageSnapshot"]>> {
    return createEmptyCodingPlanUsageSnapshot(request);
  }

  async getCodingPlanRegularTps(
    _request: P<NonNullable<IUsageStatsService["getCodingPlanRegularTps"]>>,
  ): Promise<number | undefined> {
    return undefined;
  }

  async getCodingPlanResetStatus(
    _request: P<IUsageStatsService["getCodingPlanResetStatus"]>,
  ): Promise<AR<IUsageStatsService["getCodingPlanResetStatus"]>> {
    return { available: false } as unknown as AR<IUsageStatsService["getCodingPlanResetStatus"]>;
  }

  async requestCodingPlanResetOpportunity(
    _request: P<IUsageStatsService["requestCodingPlanResetOpportunity"]>,
  ): Promise<AR<IUsageStatsService["requestCodingPlanResetOpportunity"]>> {
    return { available: false } as unknown as AR<
      IUsageStatsService["requestCodingPlanResetOpportunity"]
    >;
  }

  async useCodingPlanReset(
    _request: P<IUsageStatsService["useCodingPlanReset"]>,
  ): Promise<AR<IUsageStatsService["useCodingPlanReset"]>> {
    return { ok: false, reason: "not-available" } as unknown as AR<
      IUsageStatsService["useCodingPlanReset"]
    >;
  }

  async markCodingPlanResetHistoryRead(
    _request: P<IUsageStatsService["markCodingPlanResetHistoryRead"]>,
  ): Promise<void> {}

  async getSnapshot(
    _request: P<IUsageStatsService["getSnapshot"]>,
  ): Promise<AR<IUsageStatsService["getSnapshot"]>> {
    return { generatedAt: Date.now(), items: [] } as unknown as AR<
      IUsageStatsService["getSnapshot"]
    >;
  }

  async getEntitlementSnapshot(
    _request?: P<IUsageStatsService["getEntitlementSnapshot"]>,
  ): Promise<AR<IUsageStatsService["getEntitlementSnapshot"]>> {
    return {
      entitled: true,
      scope: "personal",
      providerId: "bigmodel",
      sources: [],
    } as unknown as AR<IUsageStatsService["getEntitlementSnapshot"]>;
  }
}

export function registerModelsMockServices(services: MockServiceRegistrar): void {
  services.register(IProviderSettingsService, new MockProviderSettingsService());
  services.register(IModelSelectionService, new MockModelSelectionService());
  services.register(IUsageStatsService, new MockUsageStatsService());
}
