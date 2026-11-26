import type { IAIReqService } from "./aireq/contract.js";
import type { WebProjectService } from "#src/project/contract.js";
import type { WebFileService } from "./file/file.js";
import type { WebSettingService } from "./setting/setting.js";
import type { WebBroadcastService } from "./broadcast/broadcast.js";
import type { WebAIReqAgent } from "./zcode-agent/zcodeAgent.js";
import type { WebModelSelectionService } from "./model-provider/providerFacadeServices.js";

/** AIReq 浏览器服务访问器，与公开 RPC 成员一致。 */
export interface IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly projectService?: WebProjectService;
  readonly fileService: WebFileService;
  readonly settingService: WebSettingService;
  readonly broadcastService: WebBroadcastService;
  readonly zcodeAgentService: WebAIReqAgent;
  readonly modelSelectionService: WebModelSelectionService;
}
