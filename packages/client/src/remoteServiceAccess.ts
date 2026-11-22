import { ProxyChannel, type IChannelClient } from "@zcode/rpc";
import {
  IAIReqService,
  IFileService,
  ISettingService,
  IBroadcastService,
  IZCodeAgentService,
  IProjectService,
  IModelSelectionService,
  WEB_MODEL_SELECTION_METHODS,
  type IServiceAccessor,
  type WebBroadcastService,
  type WebFileService,
  type WebModelSelectionService,
  type WebProjectService,
  type WebSettingService,
} from "@zcode/services";
import {
  WEB_AIREQ_AGENT_EVENTS,
  WEB_AIREQ_AGENT_METHODS,
  type WebAIReqAgent,
} from "@zcode/services/zcode-agent";

const agentMembers = new Set([...WEB_AIREQ_AGENT_METHODS, ...WEB_AIREQ_AGENT_EVENTS]);
const modelSelectionMembers = new Set(WEB_MODEL_SELECTION_METHODS);

/**
 * RemoteServiceAccess — 通过 ChannelClient 自动创建类型安全的服务代理
 *
 * 仅装配生产公开服务；退役频道不保留代理或可选兼容入口。
 */
export class RemoteServiceAccess implements IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly fileService: WebFileService;
  readonly settingService: WebSettingService;
  readonly broadcastService: WebBroadcastService;
  readonly zcodeAgentService: WebAIReqAgent;
  readonly projectService: WebProjectService;
  readonly modelSelectionService: WebModelSelectionService;

  constructor(channelClient: IChannelClient) {
    this.aiReqService = ProxyChannel.toService<IAIReqService>(
      channelClient.getChannel(IAIReqService.channelName),
    );
    this.fileService = ProxyChannel.toService<WebFileService>(
      channelClient.getChannel(IFileService.channelName),
    );
    this.settingService = ProxyChannel.toService<WebSettingService>(
      channelClient.getChannel(ISettingService.channelName),
    );
    this.broadcastService = ProxyChannel.toService<WebBroadcastService>(
      channelClient.getChannel(IBroadcastService.channelName),
    );
    this.zcodeAgentService = ProxyChannel.toService<WebAIReqAgent>(
      channelClient.getChannel(IZCodeAgentService.channelName),
      { members: agentMembers },
    );
    this.projectService = ProxyChannel.toService<WebProjectService>(
      channelClient.getChannel(IProjectService.channelName),
    );
    this.modelSelectionService = ProxyChannel.toService<WebModelSelectionService>(
      channelClient.getChannel(IModelSelectionService.channelName),
      { members: modelSelectionMembers },
    );
  }
}
