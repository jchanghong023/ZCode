// 模拟服务装配：把全部 mock 服务注册进 ServiceCollection，
// 由 server 的 ChannelServer 经 WebSocket RPC 暴露给浏览器 UI。
// 领域服务委托给 domains/* 的装配函数；本文件仍是唯一集中装配点。
import { ServiceCollection } from "@zcode/services";
import {
  IBroadcastService,
  IFileService,
  IFileWatcherService,
  IGitCheckpointService,
  IGitService,
  IMediaPreviewService,
  IProjectService,
  ISystemService,
  ITerminalService,
  IWindowProjectService,
  IZCodeAgentService,
  IZCodeSessionService,
  IZCodeTaskService,
} from "@zcode/services";
import { MockBroadcastService } from "./broadcast.js";
import { registerAssetsMockServices } from "./domains/assets.js";
import { registerAutomationsMockServices } from "./domains/automations.js";
import { registerCompatSurfacesMockServices } from "./domains/compat-surfaces.js";
import { registerExtensionsMockServices } from "./domains/extensions.js";
import { registerModelsMockServices } from "./domains/models.js";
import { registerPluginsMockServices } from "./domains/plugins.js";
import { registerProjectsMockServices } from "./domains/projects.js";
import { registerSettingsMockServices } from "./domains/settings.js";
import { registerSharingMockServices } from "./domains/sharing.js";
import { registerSyncMockServices } from "./domains/sync.js";
import { MockProjectService } from "./project.js";
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

  // 工作区/传输基础服务：虚拟文件系统、git、终端、系统信息。
  services.register(IFileService, new MockFileService(runtime));
  services.register(IFileWatcherService, new MockFileWatcherService(runtime));
  services.register(IGitService, new MockGitService(runtime));
  services.register(IGitCheckpointService, new MockGitCheckpointService(runtime));
  services.register(ISystemService, new MockSystemService(runtime));
  services.register(ITerminalService, new MockTerminalService());
  services.register(IMediaPreviewService, new MockMediaPreviewService());
  services.register(IBroadcastService, new MockBroadcastService());

  // 领域服务：每域只注册自己的服务，权威状态仍在 runtime。
  registerSettingsMockServices(services, runtime);
  registerModelsMockServices(services);
  registerPluginsMockServices(services);
  registerExtensionsMockServices(services);
  registerAssetsMockServices(services);
  registerSyncMockServices(services);
  registerProjectsMockServices(services, runtime);
  registerAutomationsMockServices(services, runtime);
  registerSharingMockServices(services);
  registerCompatSurfacesMockServices(services);

  // 协议面与任务索引：v4 会话、会话列表、任务门面、项目目录。
  services.register(IZCodeAgentService, new MockZCodeAgentService(runtime));
  services.register(IZCodeTaskService, new MockZCodeTaskService(runtime));
  services.register(IZCodeSessionService, new MockZCodeSessionService());
  // 修复原因：两个 descriptor 各 new 一张项目表会让窗口目录与会话准备互相看不到项目。
  const projectService = new MockProjectService(runtime);
  services.register(IProjectService, projectService);
  services.register(IWindowProjectService, projectService);

  return { services, runtime };
}
