import { appSettingsPatchSchema, appSettingsSchema, ServiceChannels, type AppSettings } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

/** Host 私有装配端口：只读取本机已提交目录，禁止递归读取设置或网络。 */
export type WorkspaceSettingsProjection = Pick<
  AppSettings,
  "lastActiveWorkspace" | "lastWorkspaceSession" | "recentProjects" | "lastActiveTabIndex"
>;

export interface ISettingService {
  get(): Promise<AppSettings>;
  /** 完整连接映射写入必须传入原快照和操作版本；服务在锁内比较并递增版本。 */
  update(
    patch: Partial<AppSettings>,
    expectedAccountSettings?: Pick<
      AppSettings,
      | "providerFamilyDomain"
      | "providerFamilyConnectionSelections"
      | "providerFamilyDomainUpdatedAt"
    >,
  ): Promise<void>;
}

const HOST_ONLY_PATCH_FIELDS = {
  httpProxy: true,
  httpProxyNoProxy: true,
  httpProxyCaCertPath: true,
  terminalInheritSystemProfile: true,
  terminalFontFamily: true,
  integratedTerminalShell: true,
  desktopZoomLevel: true,
  desktopWindowSize: true,
  desktopChromiumHardwareAccelerationEnabled: true,
  keepAwakeWhileRunning: true,
  closeToTrayOnWindows: true,
  closeToTrayOnWindowsMigrationInitialized: true,
  closeToTrayLinuxMigrationInitialized: true,
  sourceServers: true,
  connectionProfiles: true,
  sourceServerWorkspaceHistory: true,
  remoteConversationWorkspaceBySourceServerId: true,
  remoteStartupAutoReconnectEnabled: true,
  sourceServerDirectoryMigrationVersion: true,
  remoteBoundaryOnboardingVersion: true,
  remoteBoundaryIntroAcknowledgedVersion: true,
  recentProjects: true,
  lastActiveWorkspace: true,
  lastWorkspaceSession: true,
  lastActiveTabIndex: true,
  lastActiveTaskByWorkspace: true,
  taskAutoArchiveEnabled: true,
  taskAutoArchiveOlderThanDays: true,
  nativeSearchEnhancementsEnabled: true,
  toolSearchMode: true,
  memoryEnabled: true,
  enabledBuiltinAgentCliProviders: true,
  computerUseComposerEntryHidden: true,
  startPlanRecommendationDismissed: true,
  onboardingOccupation: true,
  proactiveSuggestionsEnabled: true,
  messageStreamShowReasoningMigrationInitialized: true,
  dataBaseDir: true,
  settingsSyncFirstRunPromptHandled: true,
  zcodeEndpointOrigin: true,
} as const;

// 迁移版本是通用设置的内部字段，原本就不属于严格补丁 schema。
const HOST_ONLY_READ_FIELDS = {
  ...HOST_ONLY_PATCH_FIELDS,
  taskAutoArchiveResetVersion: true,
} as const;

export type WebAppSettings = Omit<AppSettings, keyof typeof HOST_ONLY_READ_FIELDS>;

export const webAppSettingsPatchSchema = appSettingsPatchSchema.omit(HOST_ONLY_PATCH_FIELDS);

export function createDefaultWebAppSettings(): WebAppSettings {
  const settings: AppSettings = appSettingsSchema.parse({});
  // 通用 schema 会填入桌面默认值；初始化时投影一次，避免把宿主字段下发给浏览器。
  for (const key of Object.keys(HOST_ONLY_READ_FIELDS) as (keyof typeof HOST_ONLY_READ_FIELDS)[]) {
    delete settings[key];
  }
  return settings;
}

export interface WebSettingService {
  get(): Promise<WebAppSettings>;
  update(patch: Partial<WebAppSettings>): Promise<void>;
}

export const ISettingService = createServiceDescriptor<ISettingService>(ServiceChannels.Setting);
