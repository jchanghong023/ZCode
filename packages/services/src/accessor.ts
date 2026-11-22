import type { IAIReqService } from "./aireq/contract.js";
import type { WebProjectService } from "#src/project/contract.js";
import type { WebFileService } from "./file/file.js";
import type { ISystemService } from "./system/system.js";
import type { WebSettingService } from "./setting/setting.js";
import type { WebBroadcastService } from "./broadcast/broadcast.js";
import type { IZCodeAgentService, WebAIReqAgent } from "./zcode-agent/zcodeAgent.js";
import type { WebModelSelectionService } from "./model-provider/providerFacadeServices.js";
import type { ISubagentsService } from "./subagents/subagents.js";

/** 通用渲染服务访问器；Web 实际装配仅包含其公开成员。 */
export interface IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly projectService?: WebProjectService;
  readonly fileService: WebFileService;
  readonly systemService?: ISystemService;
  readonly settingService: WebSettingService;
  readonly broadcastService: WebBroadcastService;
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
  /** 当前 Environment Registry 发布的唯一模型选择 View。 */
  readonly modelSelectionService: WebModelSelectionService;
  readonly subagentsService?: ISubagentsService;
}
