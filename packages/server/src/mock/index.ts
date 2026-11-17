// 模拟服务装配：把全部 mock 服务注册进 ServiceCollection，
// 由 server 的 ChannelServer 经 WebSocket RPC 暴露给浏览器 UI。
// 领域服务委托给 domains/* 的装配函数；本文件仍是唯一集中装配点。
import { ServiceCollection } from "@zcode/services";
import {
  IBroadcastService,
  IFileService,
  IProjectService,
  ISystemService,
  IZCodeAgentService,
  IZCodeSessionService,
  IZCodeTaskService,
} from "@zcode/services";
import { MockBroadcastService } from "./broadcast.js";
import { registerAssetsMockServices } from "./domains/assets.js";
import { registerModelsMockServices } from "./domains/models.js";
import { registerSettingsMockServices } from "./domains/settings.js";
import { MockProjectService } from "./project.js";
import { MockRuntime } from "./runtime.js";
import { MockFileService, MockSystemService } from "./workspace.js";
import { MockZCodeAgentService } from "./zcodeAgent.js";
import { MockZCodeSessionService, MockZCodeTaskService } from "./zcodeTask.js";
import { IAIReqService } from "@zcode/services/aireq";
import { MockAIReqService } from "../aireq/contract.js";

export interface MockServicesOptions {
  workspacePath: string;
}

export function createMockServices(options: MockServicesOptions): {
  services: ServiceCollection;
  runtime: MockRuntime;
} {
  const runtime = new MockRuntime({ workspacePath: options.workspacePath });
  const services = new ServiceCollection();

  // 收口原因：当前 Web 不提供 Git、文件监听或媒体会话，不能注册旧能力空壳。
  services.register(IFileService, new MockFileService(runtime));
  services.register(ISystemService, new MockSystemService());
  services.register(IBroadcastService, new MockBroadcastService());

  // 领域服务：每域只注册自己的服务，权威状态仍在 runtime。
  registerSettingsMockServices(services);
  registerModelsMockServices(services);
  registerAssetsMockServices(services);

  // 协议面与任务索引：v4 会话、会话列表、任务门面、项目目录。
  const aiReqService = new MockAIReqService();
  services.register(IAIReqService, aiReqService.remote);
  services.register(IZCodeAgentService, new MockZCodeAgentService(runtime, aiReqService));
  services.register(IZCodeTaskService, new MockZCodeTaskService());
  services.register(IZCodeSessionService, new MockZCodeSessionService());
  services.register(IProjectService, new MockProjectService(runtime, aiReqService));

  return { services, runtime };
}
