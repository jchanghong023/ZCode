import type { IAIReqService } from "./aireq/contract.js";
import type { ITaskGroupService } from "#src/task-groups/contract.js";
import type { IProjectService } from "#src/project/contract.js";
import type { IGenUiService } from "./gen-ui/contract.js";
import type { IPluginUiBridgeService } from "./plugin-ui-bridge/contract.js";
import type { IPluginUiSamplingService } from "./plugin-ui-bridge/samplingContract.js";
import type { IPluginUiAppToolsService } from "./plugin-ui-bridge/appToolsContract.js";
import type { IFileService } from "./file/file.js";
import type { IMediaPreviewService } from "./media-preview/mediaPreview.js";
import type { IGitService } from "./git/git.js";
import type { ISystemService } from "./system/system.js";
import type { ISettingService } from "./setting/setting.js";
import type { IBroadcastService } from "./broadcast/broadcast.js";
import type { IZCodeTaskService } from "./session/zcodeTaskService.js";
import type { IZCodeAgentService } from "./zcode-agent/zcodeAgent.js";
import type { IZCodeSessionService } from "./zcode-session/zcodeSession.js";
import type { IBotsService } from "./bots/bots.js";
import type { IFileWatcherService } from "./fileWatcher/fileWatcher.js";
import type {
  IModelSelectionService,
  IProviderSettingsService,
} from "./model-provider/providerFacadeServices.js";
import type { IUsageStatsService } from "./usage-stats/usageStats.js";
import type { IClientConfigService } from "./client-config/clientConfig.js";
import type { ISkillsService } from "./skills/skills.js";
import type { IMcpSyncService } from "./mcp-sync/mcpSync.js";
import type { IPluginManagementService } from "./plugins/pluginManagement.js";
import type { ISubagentsService } from "./subagents/subagents.js";
import type { IPromptAttachmentTransferService } from "./prompt-attachment-transfer/promptAttachmentTransfer.js";

/** UI 层消费的统一服务接口 */
export interface IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly taskGroupService?: ITaskGroupService;
  readonly projectService?: IProjectService;
  readonly fileService: IFileService;
  readonly mediaPreviewService?: IMediaPreviewService;
  readonly gitService: IGitService;
  readonly systemService: ISystemService;
  readonly settingService: ISettingService;
  readonly broadcastService: IBroadcastService;
  readonly zcodeTaskService: IZCodeTaskService;
  readonly zcodeAgentService: IZCodeAgentService;
  readonly zcodeSessionService: IZCodeSessionService;
  readonly botsService: IBotsService;
  readonly fileWatcherService: IFileWatcherService;
  /** 当前 Environment 的 Provider 配置与设置视图。 */
  readonly providerSettingsService: IProviderSettingsService;
  /** 当前 Environment Registry 发布的唯一模型选择 View。 */
  readonly modelSelectionService: IModelSelectionService;
  readonly usageStatsService: IUsageStatsService;
  readonly clientConfigService: IClientConfigService;
  readonly skillsService: ISkillsService;
  readonly mcpSyncService: IMcpSyncService;
  /** 插件 UI 桥；web 或旧 host 可不提供，UI 据此回退普通 MCP 卡片。 */
  readonly genUiService?: IGenUiService;
  readonly pluginUiBridgeService?: IPluginUiBridgeService;
  /** 页面 sampling；只有桌面本地任务开放。 */
  readonly pluginUiSamplingService?: IPluginUiSamplingService;
  /** App-Provided Tools；只有桌面本地 agent 时存在。 */
  readonly pluginUiAppToolsService?: IPluginUiAppToolsService;
  /** 设置页插件管理（UI 不再直触 zcodeAgentService 的 plugins/* 面） */
  readonly pluginManagementService: IPluginManagementService;
  readonly subagentsService: ISubagentsService;
  readonly promptAttachmentTransferService: IPromptAttachmentTransferService;
}
