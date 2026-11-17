import type { IAIReqService } from "./aireq/contract.js";
import type { IProjectService } from "#src/project/contract.js";
import type { IFileService } from "./file/file.js";
import type { ISystemService } from "./system/system.js";
import type { ISettingService } from "./setting/setting.js";
import type { IBroadcastService } from "./broadcast/broadcast.js";
import type { IZCodeAgentService } from "./zcode-agent/zcodeAgent.js";
import type {
  IModelSelectionService,
  IProviderSettingsService,
} from "./model-provider/providerFacadeServices.js";
import type { ISubagentsService } from "./subagents/subagents.js";

/** 当前电脑 Web 消费的统一服务接口；退役 RPC 不以可选字段残留。 */
export interface IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly projectService?: IProjectService;
  readonly fileService: IFileService;
  readonly systemService: ISystemService;
  readonly settingService: ISettingService;
  readonly broadcastService: IBroadcastService;
  readonly zcodeAgentService: IZCodeAgentService;
  /** 当前 Environment 的 Provider 配置与设置视图。 */
  readonly providerSettingsService: IProviderSettingsService;
  /** 当前 Environment Registry 发布的唯一模型选择 View。 */
  readonly modelSelectionService: IModelSelectionService;
  readonly subagentsService: ISubagentsService;
}
