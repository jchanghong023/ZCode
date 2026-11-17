/* oxlint-disable eslint(max-lines) -- AppSettings schema 聚合历史迁移、默认值和 patch 校验，拆分会削弱设置迁移的单一入口。 */
import { z } from "zod";
import {
  appToolSearchModeSchema,
  DEFAULT_APP_TOOL_SEARCH_MODE,
} from "./app-runtime-preferences.js";
import { SUPPORTED_LOCALES } from "./protocol.js";
import { resolvePersistedUiLocale, resolvePersistedUiLocalePreference } from "./locale.js";
import { REMOTE_ASSET_INSTALL_MODES } from "./remoteAssetInstallMode.js";
import { isKnownRemoteResourcePackageId } from "./remoteResourcePackages.js";
import { wslUserSchema } from "./wslUserValidation.js";
import { ZCODE_ENABLED_AGENT_PROVIDERS } from "./zcode-agent-policy.js";
import { normalizeZCodeEndpointOrigin } from "./zcodeEndpoint.js";
import { providerFamilyConnectionSelectionSettingsSchema } from "./provider-family-connection-selection.js";
import {
  connectionProfileSchema,
  sourceServerRecordSchema,
  sourceServerWorkspaceHistoryEntrySchema,
} from "./source-server/contracts.js";

/** 引导职业枚举；单独导出供 onboarding 记录回填 settings 时做窄化校验。 */
const appSettingsOccupationSchema = z.enum([
  "office",
  "developer",
  "independent",
  "infrastructure",
  "product",
  "design",
  "student",
  "creator",
  "operations",
  "marketing",
  "finance",
  "accounting",
  "legal",
  "other",
]);
export const appSettingsOccupationEnum = appSettingsOccupationSchema;

const nonEmptyStringSchema = z.string().trim().min(1);

export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const localePreferenceSchema = z.enum(["system", ...SUPPORTED_LOCALES]);
const zcodeInteractionBehaviorSchema = z.enum(["queue", "guide"]);
const desktopZoomLevelSchema = z.number().int().min(-3).max(5);
const appThemeSchema = z.enum(["light", "dark", "zai-light", "zai-dark", "system"]);
const appUiFontSizeSchema = z.number().int().min(12).max(20);
const desktopWindowSizeSchema = z.object({
  width: z.number().int().min(480),
  height: z.number().int().min(640),
  maximized: z.boolean(),
});
export const integratedTerminalShellSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("auto"),
  }),
  z.object({
    mode: z.literal("shell"),
    dialect: z.enum(["cmd", "git-bash"]),
    id: nonEmptyStringSchema,
    label: nonEmptyStringSchema,
    path: nonEmptyStringSchema,
  }),
]);
const enabledBuiltinAgentCliProvidersSchema = z
  // 兼容旧 settings：历史列表可能残留三方 CLI provider，解析后统一归一为 ZCode Agent。
  .array(z.enum(["claude", "opencode", "gemini", "codex", "glm"]))
  .transform(() => [...ZCODE_ENABLED_AGENT_PROVIDERS]);
const providerFamilyDomainSchema = z.enum(["zai", "bigmodel"]);

const remoteWorkspaceTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ssh"),
    host: nonEmptyStringSchema,
    port: z.number().int().positive().max(65535).optional(),
    username: nonEmptyStringSchema,
    sshConfigAlias: nonEmptyStringSchema.optional(),
    privateKeyPath: z.string().optional(),
    assetInstallMode: z.enum(REMOTE_ASSET_INSTALL_MODES).optional(),
    resourcePackages: z
      .object({
        selectedPackageIds: z.array(z.string().refine(isKnownRemoteResourcePackageId)).optional(),
      })
      .optional(),
    passwordCredentialKey: nonEmptyStringSchema.optional(),
    privateKeyPassphraseCredentialKey: nonEmptyStringSchema.optional(),
  }),
  z.object({
    kind: z.literal("wsl"),
    distro: z.string().optional(),
    // 远程历史重连会直接使用 settings 中的 WSL user，必须和连接入口共用校验，避免绕过 UI 后污染 identity/日志。
    user: wslUserSchema.optional(),
  }),
  z.object({
    kind: z.literal("docker"),
    container: nonEmptyStringSchema,
  }),
  z.object({
    kind: z.literal("server"),
    url: z.string().url(),
    name: nonEmptyStringSchema.optional(),
    workspacePath: z.string().optional(),
    serverId: nonEmptyStringSchema.optional(),
    tokenCredentialKey: nonEmptyStringSchema.optional(),
  }),
]);

const appWorkspaceSessionEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    workspacePath: nonEmptyStringSchema,
    workspacePurpose: z.enum(["project", "conversation"]).default("project"),
  }),
  z.object({
    kind: z.literal("remote"),
    workspacePath: nonEmptyStringSchema,
    workspacePurpose: z.enum(["project", "conversation"]).default("project"),
    localWorkspacePath: nonEmptyStringSchema.optional(),
    workspaceIdentity: nonEmptyStringSchema.optional(),
    target: remoteWorkspaceTargetSchema,
    lastOpenedAt: z.number().int().nonnegative(),
    lastConnectionStatus: z.enum(["connected", "failed"]),
    lastConnectionError: z.string().optional(),
    lastConnectionErrorCode: z.string().optional(),
  }),
]);

const remoteConversationWorkspaceRecordSchema = z
  .object({
    workspacePath: nonEmptyStringSchema,
    lastResolvedAt: z.number().int().nonnegative(),
  })
  .strict();

const zcodeEndpointOriginSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return normalizeZCodeEndpointOrigin(trimmed);
  } catch {
    return undefined;
  }
}, z.string().optional());

// 历史读取可丢弃坏 endpoint；公开写入必须失败，不能把非法值归一成 undefined 后覆盖旧设置。
const zcodeEndpointOriginPatchSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, context) => {
    try {
      return normalizeZCodeEndpointOrigin(value);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid endpoint origin" });
      return z.NEVER;
    }
  });

function sanitizeZCodeEndpointOrigin(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (!("zcodeEndpointOrigin" in raw)) {
    return value;
  }
  const parsed = zcodeEndpointOriginSchema.safeParse(raw.zcodeEndpointOrigin);
  if (parsed.success && typeof parsed.data === "string") {
    return { ...raw, zcodeEndpointOrigin: parsed.data };
  }
  const { zcodeEndpointOrigin: _zcodeEndpointOrigin, ...next } = raw;
  // 非生产 endpoint override 是开发辅助字段，坏值只丢弃该字段，不能拖垮整个 settings 读取。
  return next;
}

function sanitizeDesktopWindowSize(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (!("desktopWindowSize" in raw)) {
    return value;
  }
  const parsed = desktopWindowSizeSchema.safeParse(raw.desktopWindowSize);
  if (parsed.success) {
    return value;
  }
  const { desktopWindowSize: _desktopWindowSize, ...next } = raw;
  // 窗口尺寸是非关键偏好，坏值若参与整份 schema 校验，会让其他合法设置全部回退默认。
  // 读取历史设置时只丢弃损坏字段；写入 patch 仍保持严格校验，避免继续产生坏数据。
  return next;
}

function migrateRemoteBoundaryIntroAcknowledgement(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  if (raw.remoteBoundaryOnboardingVersion !== 3) return value;
  // 原因：旧客户端只接受 2，写 3 会让整份设置回退默认值。迁移已确认的 3 到新字段，
  // 同时恢复旧字段合同；不能仅收窄 schema，否则修复版读取存量 3 也会丢设置。
  return {
    ...raw,
    remoteBoundaryOnboardingVersion: 2,
    remoteBoundaryIntroAcknowledgedVersion: 1,
  };
}

function migrateTaskAutoArchiveReset(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  if (raw.taskAutoArchiveResetVersion === 1) return value;
  // 旧版开关开启后可能未执行；修复后直接沿用会在启动时突然归档历史会话。
  // 首次读取统一关闭并持久化标记，用户重新开启后不再重置。
  return { ...raw, taskAutoArchiveEnabled: false, taskAutoArchiveResetVersion: 1 };
}

function migrateCloseToTrayOnWindowsDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (raw.closeToTrayOnWindowsMigrationInitialized === true) {
    return value;
  }
  return {
    ...raw,
    // 初始化原因：旧版会把默认 false 和用户手动关闭都保存成同一个值，无法可靠区分。
    // 本版本统一开启一次；写入迁移标记后，后续再按用户明确选择保留 true/false。
    closeToTrayOnWindows: true,
    closeToTrayOnWindowsMigrationInitialized: true,
  };
}

function migrateMessageStreamShowReasoningDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (raw.messageStreamShowReasoningMigrationInitialized === true) {
    return value;
  }
  return {
    ...raw,
    // 初始化原因：旧版会把默认 false 和用户手动关闭都保存成同一个值，无法可靠区分。
    // 本版本统一开启一次；写入迁移标记后，后续再按用户明确选择保留 true/false。
    messageStreamShowReasoning: true,
    messageStreamShowReasoningMigrationInitialized: true,
  };
}

/**
 * setting.json 的 uiLocale / uiLocalePreference（真实界面语言）合并回内存字段 locale / localePreference。
 * 落盘时旧字段只存中英以兼容旧版本 schema，见 locale.ts「setting.json 界面语言存储格式」。
 * 新字段不进 appSettingsObjectSchema：内存 AppSettings 只有一份真实语言，由 z.object 默认 strip 掉。
 */
function applyPersistedUiLocaleFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  if (!("uiLocale" in raw) && !("uiLocalePreference" in raw)) {
    return value;
  }
  const merged: Record<string, unknown> = { ...raw };
  const locale = resolvePersistedUiLocale(raw);
  const localePreference = resolvePersistedUiLocalePreference(raw);
  if (locale !== undefined) merged.locale = locale;
  if (localePreference !== undefined) merged.localePreference = localePreference;
  return merged;
}

function migrateLegacyLocalePreference(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const raw = value as Record<string, unknown>;
  if ("localePreference" in raw || !("locale" in raw)) {
    return value;
  }

  const parsedLocale = localeSchema.safeParse(raw.locale);
  if (!parsedLocale.success) {
    return value;
  }

  return {
    ...raw,
    // 旧 setting.json 只有 locale，无法区分“用户显式选择 zh-CN”和“默认值 zh-CN”。
    // 对已经落盘的旧配置保留原 locale 作为显式偏好，避免升级后误切到 system。
    localePreference: parsedLocale.data,
  };
}

const legacyRemoteWorkspaceHistoryEntrySchema = z.object({
  id: nonEmptyStringSchema,
  workspacePath: nonEmptyStringSchema,
  localWorkspacePath: nonEmptyStringSchema.optional(),
  workspaceIdentity: nonEmptyStringSchema.optional(),
  target: remoteWorkspaceTargetSchema,
  lastOpenedAt: z.number().int().nonnegative(),
  lastConnectionStatus: z.enum(["connected", "failed"]),
  lastConnectionError: z.string().optional(),
});

function migrateLegacyBuiltinAgentCliProviders(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const raw = value as {
    enabledBuiltinAgentCliProviders?: unknown;
  };

  // Bugfix: 单 ZCode Agent 迁移后，旧 setting.json 可能还保存已移除的第三方 CLI provider
  // 的启用状态。若这些值继续进入 UI / bot 的 provider 选项，会和 server 侧唯一 glm 状态打架。
  // 这里在 schema 入口统一归一到 ZCode Agent，让核心 provider 状态只有一个事实源。
  return {
    ...raw,
    enabledBuiltinAgentCliProviders: [...ZCODE_ENABLED_AGENT_PROVIDERS],
  };
}

function stripHistoricalRemoteResourcePackages(target: unknown): unknown {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return target;
  }

  const rawTarget = target as Record<string, unknown>;
  if (rawTarget.kind !== "ssh" || !("resourcePackages" in rawTarget)) {
    return target;
  }

  const { resourcePackages: _resourcePackages, ...nextTarget } = rawTarget;
  // SSH 部署固定使用完整 active 资源集；旧 setting.json 里的 resourcePackages 是历史裁剪，
  // 在配置入口清掉，避免后续重连或 tab 恢复继续读取。
  return nextTarget;
}

function migrateLegacyWorkspaceSession(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const raw = value as {
    lastOpenTabs?: unknown;
    lastWorkspaceSession?: unknown;
    remoteWorkspaceHistory?: unknown;
  };
  const migrated = { ...raw } as Record<string, unknown>;
  const lastWorkspaceSession = Array.isArray(raw.lastWorkspaceSession)
    ? raw.lastWorkspaceSession
    : [];

  const hasLegacyRemoteEntries = lastWorkspaceSession.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    return "historyId" in (entry as Record<string, unknown>);
  });

  const legacyRemoteHistory = Array.isArray(raw.remoteWorkspaceHistory)
    ? raw.remoteWorkspaceHistory
    : [];
  const legacyRemoteHistoryById = new Map(
    legacyRemoteHistory.flatMap((entry) => {
      const sanitizedEntry =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? {
              ...(entry as Record<string, unknown>),
              // 更老的 remoteWorkspaceHistory 可能保存了已退役资源包 ID。
              // 先剥离历史选择再走 schema，避免迁移阶段误删整条远程历史。
              target: stripHistoricalRemoteResourcePackages(
                (entry as Record<string, unknown>).target,
              ),
            }
          : entry;
      const parsed = legacyRemoteWorkspaceHistoryEntrySchema.safeParse(sanitizedEntry);
      return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
    }),
  );

  const migratedWorkspaceSessionEntries: Record<string, unknown>[] =
    lastWorkspaceSession.length > 0
      ? lastWorkspaceSession.flatMap((entry): Record<string, unknown>[] => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }

          const rawEntry = entry as Record<string, unknown>;
          if (rawEntry.kind === "local" && typeof rawEntry.workspacePath === "string") {
            return [
              {
                kind: "local",
                workspacePath: rawEntry.workspacePath,
                workspacePurpose:
                  rawEntry.workspacePurpose === "conversation" ? "conversation" : "project",
              },
            ];
          }

          if (rawEntry.kind === "remote") {
            if (typeof rawEntry.workspacePath === "string" && rawEntry.target) {
              return [
                {
                  ...rawEntry,
                  target: stripHistoricalRemoteResourcePackages(rawEntry.target),
                },
              ];
            }

            if (typeof rawEntry.historyId === "string") {
              const legacyRemoteEntry = legacyRemoteHistoryById.get(rawEntry.historyId);
              return legacyRemoteEntry
                ? [
                    {
                      kind: "remote",
                      workspacePath: legacyRemoteEntry.workspacePath,
                      ...(legacyRemoteEntry.localWorkspacePath
                        ? { localWorkspacePath: legacyRemoteEntry.localWorkspacePath }
                        : {}),
                      ...(legacyRemoteEntry.workspaceIdentity
                        ? { workspaceIdentity: legacyRemoteEntry.workspaceIdentity }
                        : {}),
                      target: stripHistoricalRemoteResourcePackages(legacyRemoteEntry.target),
                      lastOpenedAt: legacyRemoteEntry.lastOpenedAt,
                      lastConnectionStatus: legacyRemoteEntry.lastConnectionStatus,
                      ...(legacyRemoteEntry.lastConnectionError
                        ? { lastConnectionError: legacyRemoteEntry.lastConnectionError }
                        : {}),
                    },
                  ]
                : [];
            }
          }

          return [];
        })
      : [];
  const migratedLegacyLocalEntries = Array.isArray(raw.lastOpenTabs)
    ? raw.lastOpenTabs.flatMap((workspacePath) =>
        typeof workspacePath === "string"
          ? [
              {
                kind: "local" as const,
                workspacePath,
                workspacePurpose: "project" as const,
              },
            ]
          : [],
      )
    : [];
  const existingLocalWorkspacePaths = new Set(
    migratedWorkspaceSessionEntries.flatMap((entry) =>
      entry.kind === "local" && typeof entry.workspacePath === "string"
        ? [entry.workspacePath]
        : [],
    ),
  );
  const nextWorkspaceSession = [
    ...migratedWorkspaceSessionEntries,
    ...migratedLegacyLocalEntries.filter(
      (entry) => !existingLocalWorkspacePaths.has(entry.workspacePath),
    ),
  ];

  // 旧 setting.json 把本地会话、远端历史、组合会话拆在三处存，
  // 一旦只删掉其中一处，启动恢复就会出现“列表还在但恢复不到”或“远端数据残留”的分叉状态。
  // 这里在 schema 解析阶段统一合并进 lastWorkspaceSession，并主动移除旧字段，
  // 保证后续所有读写都只围绕单一真相源展开。
  if (
    nextWorkspaceSession.length > 0 ||
    hasLegacyRemoteEntries ||
    Array.isArray(raw.lastOpenTabs)
  ) {
    migrated.lastWorkspaceSession = nextWorkspaceSession;
  }
  delete migrated.lastOpenTabs;
  delete migrated.remoteWorkspaceHistory;
  return migrated;
}

const appSettingsObjectSchema = z.object({
  theme: appThemeSchema.default("dark"),
  uiFontSizePx: appUiFontSizeSchema.default(14),
  recentProjects: z.array(z.string()).default([]),
  locale: localeSchema.default("zh-CN"),
  // 快捷键用户覆盖（语义校验在 ui/src/shortcuts 生效表阶段容错，schema 只管形状）
  shortcutBindings: z.record(z.string(), z.array(z.string())).optional(),
  localePreference: localePreferenceSchema.default("system"),
  terminalInheritSystemProfile: z.boolean().default(true),
  terminalFontFamily: nonEmptyStringSchema.optional(),
  integratedTerminalShell: integratedTerminalShellSelectionSchema.optional(),
  httpProxy: nonEmptyStringSchema.optional(),
  httpProxyNoProxy: nonEmptyStringSchema.optional(),
  httpProxyCaCertPath: nonEmptyStringSchema.optional(),
  // 输入框电脑操作入口改为默认不展示，设置项保留、默认关闭。
  // default 只对缺省字段生效，显式存过 false 的用户仍保持展示。
  computerUseComposerEntryHidden: z.boolean().default(true),
  taskAutoArchiveEnabled: z.boolean().default(false),
  taskAutoArchiveResetVersion: z.literal(1).default(1),
  taskAutoArchiveOlderThanDays: z.number().int().positive().max(365).default(30),
  closeToTrayOnWindows: z.boolean().default(true),
  closeToTrayOnWindowsMigrationInitialized: z.boolean().default(true),
  // default(false)：新装与存量用户首次启动都视为未归位，由 main 进程按平台决定是否迁移。
  closeToTrayLinuxMigrationInitialized: z.boolean().default(false),
  keepAwakeWhileRunning: z.boolean().default(false),
  desktopZoomLevel: desktopZoomLevelSchema.optional(),
  desktopWindowSize: desktopWindowSizeSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: z.boolean().default(true),
  messageStreamShowReasoning: z.boolean().default(true),
  messageStreamShowReasoningMigrationInitialized: z.boolean().default(true),
  messageStreamShowTodos: z.boolean().default(false),
  zcodeInteractionBehavior: zcodeInteractionBehaviorSchema.default("queue"),
  askUserQuestionAutoResolutionEnabled: z.boolean().default(true),
  modelIoFullRetentionEnabled: z.boolean().default(false),
  enabledBuiltinAgentCliProviders: enabledBuiltinAgentCliProvidersSchema.default([
    ...ZCODE_ENABLED_AGENT_PROVIDERS,
  ]),
  startPlanRecommendationDismissed: z.boolean().default(false),
  providerFamilyConnectionSelections: providerFamilyConnectionSelectionSettingsSchema.default({}),
  providerFamilyDomain: providerFamilyDomainSchema.optional(),
  providerFamilyDomainUpdatedAt: z.number().int().nonnegative().optional(),
  providerFamilyDomainMigrated: z.boolean().default(false),
  nativeSearchEnhancementsEnabled: z.boolean().default(true),
  toolSearchMode: appToolSearchModeSchema.default(DEFAULT_APP_TOOL_SEARCH_MODE),
  onboardingOccupation: appSettingsOccupationSchema.nullish(),
  proactiveSuggestionsEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().default(false),
  lastWorkspaceSession: z.array(appWorkspaceSessionEntrySchema).default([]),
  lastActiveWorkspace: appWorkspaceSessionEntrySchema.nullable().optional(),
  remoteConversationWorkspaceBySourceServerId: z
    .record(nonEmptyStringSchema, remoteConversationWorkspaceRecordSchema)
    .optional(),
  sourceServers: z.array(sourceServerRecordSchema).default([]),
  connectionProfiles: z.array(connectionProfileSchema).default([]),
  sourceServerWorkspaceHistory: z.array(sourceServerWorkspaceHistoryEntrySchema).default([]),
  // Bug 原因：该开关过去只声明在 patch schema，SettingService 合并后再走完整 schema 时会把
  // 显式 false 剥离，导致重启后恢复为默认开启。完整 schema 必须拥有这项持久化事实。
  remoteStartupAutoReconnectEnabled: z.boolean().optional(),
  sourceServerDirectoryMigrationVersion: z.literal(1).optional(),
  remoteBoundaryOnboardingVersion: z.literal(2).optional(),
  remoteBoundaryIntroAcknowledgedVersion: z.literal(1).optional(),
  lastActiveTabIndex: z.number().int().nonnegative().default(0),
  lastActiveTaskByWorkspace: z.record(z.string(), z.string()).optional(),
  dataBaseDir: z.string().trim().min(1).optional(),
  settingsSyncFirstRunPromptHandled: z.boolean().optional(),
  zcodeEndpointOrigin: zcodeEndpointOriginSchema.optional(),
});

export const appSettingsSchema = z.preprocess(
  (value) =>
    sanitizeDesktopWindowSize(
      migrateMessageStreamShowReasoningDefault(
        migrateCloseToTrayOnWindowsDefault(
          migrateLegacyLocalePreference(
            applyPersistedUiLocaleFields(
              sanitizeZCodeEndpointOrigin(
                migrateLegacyWorkspaceSession(
                  migrateLegacyBuiltinAgentCliProviders(
                    migrateRemoteBoundaryIntroAcknowledgement(migrateTaskAutoArchiveReset(value)),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  appSettingsObjectSchema,
);

export const appSettingsPatchSchema = z.strictObject({
  theme: appThemeSchema.optional(),
  uiFontSizePx: appUiFontSizeSchema.optional(),
  recentProjects: z.array(z.string()).optional(),
  locale: localeSchema.optional(),
  shortcutBindings: z.record(z.string(), z.array(z.string())).optional(),
  localePreference: localePreferenceSchema.optional(),
  terminalInheritSystemProfile: z.boolean().optional(),
  terminalFontFamily: nonEmptyStringSchema.optional(),
  integratedTerminalShell: integratedTerminalShellSelectionSchema.optional(),
  httpProxy: nonEmptyStringSchema.optional(),
  httpProxyNoProxy: nonEmptyStringSchema.optional(),
  httpProxyCaCertPath: nonEmptyStringSchema.optional(),
  computerUseComposerEntryHidden: z.boolean().optional(),
  taskAutoArchiveEnabled: z.boolean().optional(),
  taskAutoArchiveOlderThanDays: z.number().int().positive().max(365).optional(),
  closeToTrayOnWindows: z.boolean().optional(),
  keepAwakeWhileRunning: z.boolean().optional(),
  closeToTrayOnWindowsMigrationInitialized: z.boolean().optional(),
  closeToTrayLinuxMigrationInitialized: z.boolean().optional(),
  desktopZoomLevel: desktopZoomLevelSchema.optional(),
  desktopWindowSize: desktopWindowSizeSchema.optional(),
  desktopChromiumHardwareAccelerationEnabled: z.boolean().optional(),
  messageStreamShowReasoning: z.boolean().optional(),
  messageStreamShowReasoningMigrationInitialized: z.boolean().optional(),
  messageStreamShowTodos: z.boolean().optional(),
  zcodeInteractionBehavior: zcodeInteractionBehaviorSchema.optional(),
  askUserQuestionAutoResolutionEnabled: z.boolean().optional(),
  modelIoFullRetentionEnabled: z.boolean().optional(),
  enabledBuiltinAgentCliProviders: enabledBuiltinAgentCliProvidersSchema.optional(),
  startPlanRecommendationDismissed: z.boolean().optional(),
  providerFamilyConnectionSelections: providerFamilyConnectionSelectionSettingsSchema.optional(),
  // 清空选择的既有空串输入归一为正式可选值，不能把空串写进 AppSettings。
  providerFamilyDomain: z
    .union([providerFamilyDomainSchema, z.literal("")])
    .transform((value) => value || undefined)
    .optional(),
  providerFamilyDomainUpdatedAt: z.number().int().nonnegative().optional(),
  providerFamilyDomainMigrated: z.boolean().optional(),
  nativeSearchEnhancementsEnabled: z.boolean().optional(),
  toolSearchMode: appToolSearchModeSchema.optional(),
  onboardingOccupation: z
    .enum([
      "office",
      "developer",
      "independent",
      "infrastructure",
      "product",
      "design",
      "student",
      "creator",
      "operations",
      "marketing",
      "finance",
      "accounting",
      "legal",
      "other",
    ])
    .nullish(),
  proactiveSuggestionsEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  lastWorkspaceSession: z.array(appWorkspaceSessionEntrySchema).optional(),
  lastActiveWorkspace: appWorkspaceSessionEntrySchema.nullable().optional(),
  remoteConversationWorkspaceBySourceServerId: z
    .record(nonEmptyStringSchema, remoteConversationWorkspaceRecordSchema)
    .optional(),
  sourceServers: z.array(sourceServerRecordSchema).optional(),
  connectionProfiles: z.array(connectionProfileSchema).optional(),
  sourceServerWorkspaceHistory: z.array(sourceServerWorkspaceHistoryEntrySchema).optional(),
  remoteStartupAutoReconnectEnabled: z.boolean().optional(),
  sourceServerDirectoryMigrationVersion: z.literal(1).optional(),
  remoteBoundaryOnboardingVersion: z.literal(2).optional(),
  remoteBoundaryIntroAcknowledgedVersion: z.literal(1).optional(),
  lastActiveTabIndex: z.number().int().nonnegative().optional(),
  lastActiveTaskByWorkspace: z.record(z.string(), z.string()).optional(),
  dataBaseDir: z.string().trim().min(1).optional(),
  settingsSyncFirstRunPromptHandled: z.boolean().optional(),
  zcodeEndpointOrigin: zcodeEndpointOriginPatchSchema.optional(),
});
