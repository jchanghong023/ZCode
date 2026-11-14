// 模拟服务装配：把全部 mock 服务注册进 ServiceCollection，
// 由 server 的 ChannelServer 经 WebSocket RPC 暴露给浏览器 UI。
import { ServiceCollection } from "@zcode/services";
import {
  IBroadcastService,
  ICloudContentService,
  IProviderProvisioningStatusService,
  ISkillSyncService as ISkillSyncDescriptor,
  IVoiceInputService,
  IBotsService,
  IClientConfigService,
  IClientScenesService,
  ICodingPlanSubscriptionService,
  ICommandsService,
  IConversationShareService,
  ICredentialService,
  IDeviceSyncStateService,
  IExtensionGrantsService,
  IExtensionViewsService,
  IExtensionsService,
  IFeedbackService,
  IFileService,
  IFileWatcherService,
  IGenUiService,
  IGitCheckpointService,
  IGitService,
  IHighspeedCardService,
  IHooksService,
  IManagedWorktreeService,
  IMarketingTouchService,
  IMcpSyncService,
  IMediaPreviewService,
  IMemoryService,
  IModelSelectionService,
  IOffPeakTaskService,
  IOnboardingRecordService,
  IOutputStyleService,
  IOAuthService,
  IPromptAttachmentTransferService,
  IPluginManagementService,
  IPluginSyncService,
  IPluginUiAppToolsService,
  IPluginUiBridgeService,
  IPluginUiSamplingService,
  IPluginsService,
  IProjectService,
  IProviderProvisioningTargetService,
  IProviderSettingsService,
  ISettingService,
  ISettingsSyncService,
  ISkillSyncService,
  ISkillsService,
  ISourceServerManagementService,
  ISourceServerWorkspaceService,
  ISubagentsService,
  ISystemService,
  ITaskGroupService,
  ITerminalService,
  IUsageStatsService,
  IUserConfigSyncService,
  IWindowControllerService,
  IWindowProjectChangesService,
  IWindowProjectService,
  IZCodeAgentService,
  IZCodeSessionService,
  IZCodeTaskService,
} from "@zcode/services";
import { MockBroadcastService } from "./broadcast.js";
import {
  MockClientConfigService,
  MockClientScenesService,
  MockCodingPlanSubscriptionService,
  MockCredentialService,
  MockModelSelectionService,
  MockOAuthService,
  MockProviderSettingsService,
  MockSettingService,
  MockUsageStatsService,
} from "./config.js";
import {
  MockCloudContentService,
  MockCommandsService,
  MockDeviceSyncStateService,
  MockExtensionGrantsService,
  MockExtensionViewsService,
  MockExtensionsService,
  MockFeedbackService,
  MockGenUiService,
  MockHooksService,
  MockMcpSyncService,
  MockMarketingTouchService,
  MockSettingsSyncService,
  MockMemoryService,
  MockOutputStyleService,
  MockPluginManagementService,
  MockPluginSyncService,
  MockPluginUiAppToolsService,
  MockPluginUiBridgeService,
  MockPluginUiSamplingService,
  MockPluginsService,
  MockProviderProvisioningStatusService,
  MockProviderProvisioningTargetService,
  MockSkillSyncService,
  MockSkillsService,
  MockSubagentsService,
  MockUserConfigSyncService,
  MockVoiceInputService,
} from "./collab.js";
import {
  MockBotsService,
  MockConversationShareService,
  MockHighspeedCardService,
  MockManagedWorktreeService,
  MockOffPeakTaskService,
  MockOnboardingRecordService,
  MockProjectService,
  MockPromptAttachmentTransferService,
  MockSourceServerManagementService,
  MockSourceServerWorkspaceService,
  MockTaskGroupService,
  MockWindowControllerService,
  MockWindowProjectChangesService,
} from "./planning.js";
import { MockRuntime } from "./runtime.js";
import {
  MockFileService,
  MockFileWatcherService,
  MockGitCheckpointService,
  MockGitService,
  MockMediaPreviewService,
  MockSystemService,
  MockTerminalService,
} from "./workspace.js";
import { MockZCodeAgentService } from "./zcodeAgent.js";
import { MockZCodeSessionService, MockZCodeTaskService } from "./zcodeTask.js";

export interface MockServicesOptions {
  workspacePath: string;
}

export function createMockServices(options: MockServicesOptions): {
  services: ServiceCollection;
  runtime: MockRuntime;
} {
  const runtime = new MockRuntime({ workspacePath: options.workspacePath });
  const services = new ServiceCollection();

  services.register(IFileService, new MockFileService(runtime));
  services.register(IFileWatcherService, new MockFileWatcherService(runtime));
  services.register(IGitService, new MockGitService(runtime));
  services.register(IGitCheckpointService, new MockGitCheckpointService(runtime));
  services.register(ISystemService, new MockSystemService(runtime));
  services.register(ITerminalService, new MockTerminalService());
  services.register(IMediaPreviewService, new MockMediaPreviewService());
  services.register(ISettingService, new MockSettingService(runtime));
  services.register(ICredentialService, new MockCredentialService());
  services.register(IOAuthService, new MockOAuthService());
  services.register(IProviderSettingsService, new MockProviderSettingsService());
  services.register(IModelSelectionService, new MockModelSelectionService());
  services.register(IUsageStatsService, new MockUsageStatsService());
  services.register(ICodingPlanSubscriptionService, new MockCodingPlanSubscriptionService());
  services.register(IClientConfigService, new MockClientConfigService());
  services.register(IClientScenesService, new MockClientScenesService());
  services.register(IBroadcastService, new MockBroadcastService());
  services.register(IBotsService, new MockBotsService(runtime));
  services.register(IZCodeAgentService, new MockZCodeAgentService(runtime));
  services.register(IZCodeTaskService, new MockZCodeTaskService(runtime));
  services.register(IZCodeSessionService, new MockZCodeSessionService());
  services.register(IProjectService, new MockProjectService(runtime));
  services.register(ITaskGroupService, new MockTaskGroupService());
  services.register(IManagedWorktreeService, new MockManagedWorktreeService());
  services.register(IWindowProjectService, new MockProjectService(runtime));
  services.register(IWindowProjectChangesService, new MockWindowProjectChangesService());
  services.register(IWindowControllerService, new MockWindowControllerService(runtime));
  services.register(ISourceServerWorkspaceService, new MockSourceServerWorkspaceService());
  services.register(ISourceServerManagementService, new MockSourceServerManagementService());
  services.register(IDeviceSyncStateService, new MockDeviceSyncStateService());
  services.register(IUserConfigSyncService, new MockUserConfigSyncService());
  services.register(ISkillSyncService, new MockSkillSyncService());
  services.register(IMcpSyncService, new MockMcpSyncService());
  services.register(IPluginSyncService, new MockPluginSyncService());
  services.register(IPluginsService, new MockPluginsService());
  services.register(IPluginManagementService, new MockPluginManagementService());
  services.register(IPluginUiBridgeService, new MockPluginUiBridgeService());
  services.register(IPluginUiSamplingService, new MockPluginUiSamplingService());
  services.register(IPluginUiAppToolsService, new MockPluginUiAppToolsService());
  services.register(ISubagentsService, new MockSubagentsService());
  services.register(ICommandsService, new MockCommandsService());
  services.register(IHooksService, new MockHooksService());
  services.register(IMemoryService, new MockMemoryService());
  services.register(ISkillsService, new MockSkillsService());
  services.register(IOutputStyleService, new MockOutputStyleService());
  services.register(ISettingsSyncService, new MockSettingsSyncService());
  services.register(IFeedbackService, new MockFeedbackService());
  services.register(IGenUiService, new MockGenUiService());
  services.register(IExtensionsService, new MockExtensionsService());
  services.register(IExtensionViewsService, new MockExtensionViewsService());
  services.register(IExtensionGrantsService, new MockExtensionGrantsService());
  services.register(IVoiceInputService, new MockVoiceInputService());
  services.register(IConversationShareService, new MockConversationShareService());
  services.register(IPromptAttachmentTransferService, new MockPromptAttachmentTransferService());
  services.register(IOnboardingRecordService, new MockOnboardingRecordService());
  services.register(IHighspeedCardService, new MockHighspeedCardService());
  services.register(
    IProviderProvisioningTargetService,
    new MockProviderProvisioningTargetService(),
  );
  services.register(
    IProviderProvisioningStatusService,
    new MockProviderProvisioningStatusService() as never,
  );
  services.register(IMarketingTouchService, new MockMarketingTouchService() as never);
  services.register(ICloudContentService, new MockCloudContentService());

  return { services, runtime };
}
