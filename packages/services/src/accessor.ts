import type { IAIReqService } from "./aireq/contract.js";
import type { WebProjectService } from "#src/project/contract.js";
import type { WebFileService } from "./file/file.js";
import type { ISystemService } from "./system/system.js";
import type { ISettingService, WebSettingService } from "./setting/setting.js";
import type { IBroadcastService } from "./broadcast/broadcast.js";
import type { IZCodeAgentService, WebAIReqAgent } from "./zcode-agent/zcodeAgent.js";
import type {
  IModelSelectionService,
  IProviderSettingsService,
  WebModelSelectionService,
} from "./model-provider/providerFacadeServices.js";
import type { ISubagentsService } from "./subagents/subagents.js";

/** 通用渲染服务访问器；Web 实际装配仅包含其公开成员。 */
export interface IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly projectService?: WebProjectService;
  readonly fileService: WebFileService;
  readonly systemService?: ISystemService;
  readonly settingService: Pick<WebSettingService, "get"> & Pick<ISettingService, "update">;
  readonly broadcastService: IBroadcastService;
  readonly zcodeAgentService: Omit<
    IZCodeAgentService,
    | "attachmentAbortV4"
    | "attachmentBeginV4"
    | "attachmentChunkV4"
    | "attachmentCommitV4"
    | "attachmentReadV4"
    | "conversationRowsRangeV4"
    | "getSkillReferenceCatalog"
    | "helloConversationV4"
    | "initializeConversationV4"
    | "onDynamicConversationFrame"
    | "queryConversationCommandsV4"
    | "resyncConversationV4"
    | "sendConversationCommandV4"
    | "subscribeConversationV4"
    | "unsubscribeConversationV4"
    | "setConnectionFlowStateV4"
    | "disposeWorkspace"
    | "disposeAll"
  > &
    Pick<
      WebAIReqAgent,
      | "attachmentAbortV4"
      | "attachmentBeginV4"
      | "attachmentChunkV4"
      | "attachmentCommitV4"
      | "attachmentReadV4"
      | "conversationRowsRangeV4"
      | "getSkillReferenceCatalog"
      | "helloConversationV4"
      | "initializeConversationV4"
      | "onDynamicConversationFrame"
      | "queryConversationCommandsV4"
      | "resyncConversationV4"
      | "sendConversationCommandV4"
      | "subscribeConversationV4"
      | "unsubscribeConversationV4"
    >;
  /** 当前 Environment 的 Provider 配置与设置视图。 */
  readonly providerSettingsService?: IProviderSettingsService;
  /** 当前 Environment Registry 发布的唯一模型选择 View。 */
  readonly modelSelectionService: WebModelSelectionService & Pick<IModelSelectionService, "onDidChange">;
  readonly subagentsService?: ISubagentsService;
}
