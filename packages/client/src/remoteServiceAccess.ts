import { ProxyChannel, type IChannelClient } from "@zcode/rpc";
import {
  IAIReqService,
  IFileService,
  ISystemService,
  ISettingService,
  IBroadcastService,
  IZCodeAgentService,
  IProjectService,
  IModelSelectionService,
  IProviderSettingsService,
  ISubagentsService,
  type IServiceAccessor,
} from "@zcode/services";

/**
 * RemoteServiceAccess — 通过 ChannelClient 自动创建类型安全的服务代理
 *
 * 仅装配生产公开服务；退役频道不保留代理或可选兼容入口。
 */
export class RemoteServiceAccess implements IServiceAccessor {
  readonly aiReqService: IAIReqService;
  readonly fileService: IFileService;
  readonly systemService: ISystemService;
  readonly settingService: ISettingService;
  readonly broadcastService: IBroadcastService;
  readonly zcodeAgentService: IZCodeAgentService;
  readonly projectService: IProjectService;
  readonly providerSettingsService: IProviderSettingsService;
  readonly modelSelectionService: IModelSelectionService;
  readonly subagentsService: ISubagentsService;

  constructor(channelClient: IChannelClient) {
    this.aiReqService = ProxyChannel.toService<IAIReqService>(
      channelClient.getChannel(IAIReqService.channelName),
    );
    this.fileService = ProxyChannel.toService<IFileService>(
      channelClient.getChannel(IFileService.channelName),
    );
    this.systemService = ProxyChannel.toService<ISystemService>(
      channelClient.getChannel(ISystemService.channelName),
    );
    this.settingService = ProxyChannel.toService<ISettingService>(
      channelClient.getChannel(ISettingService.channelName),
    );
    this.broadcastService = ProxyChannel.toService<IBroadcastService>(
      channelClient.getChannel(IBroadcastService.channelName),
    );
    this.zcodeAgentService = ProxyChannel.toService<IZCodeAgentService>(
      channelClient.getChannel(IZCodeAgentService.channelName),
    );
    this.projectService = ProxyChannel.toService<IProjectService>(
      channelClient.getChannel(IProjectService.channelName),
    );
    this.providerSettingsService = ProxyChannel.toService<IProviderSettingsService>(
      channelClient.getChannel(IProviderSettingsService.channelName),
    );
    this.modelSelectionService = ProxyChannel.toService<IModelSelectionService>(
      channelClient.getChannel(IModelSelectionService.channelName),
    );
    this.subagentsService = ProxyChannel.toService<ISubagentsService>(
      channelClient.getChannel(ISubagentsService.channelName),
    );
  }
}
