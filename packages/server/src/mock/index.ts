// 模拟服务装配：把全部 mock 服务注册进 ServiceCollection，
// 由 server 的 ChannelServer 经 WebSocket RPC 暴露给浏览器 UI。
// 领域服务委托给 domains/* 的装配函数；本文件仍是唯一集中装配点。
import { ServiceCollection } from "@zcode/services";
import {
  IBroadcastService,
  IFileService,
  IProjectService,
  IZCodeAgentService,
} from "@zcode/services";
import { MockBroadcastService } from "./broadcast.js";
import { registerModelSelectionMockService } from "./domains/models.js";
import { registerSettingsMockServices } from "./domains/settings.js";
import { MockProjectService } from "./project.js";
import { MockRuntime } from "./runtime.js";
import { MockFileService } from "./workspace.js";
import { MockZCodeAgentService } from "./zcodeAgent.js";
import { IAIReqService } from "@zcode/services/aireq";
import { MockAIReqService, type AIReqNativeBridge } from "../aireq/contract.js";

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
  services.register(IBroadcastService, new MockBroadcastService());

  // 领域服务：每域只注册自己的服务，权威状态仍在 runtime。
  registerSettingsMockServices(services);
  registerModelSelectionMockService(services);

  // 协议面与项目目录：AIReq、v4 会话、项目目录。
  const aiReqService = new MockAIReqService() satisfies AIReqNativeBridge;
  services.register(IAIReqService, aiReqService.remote);
  const native = new MockZCodeAgentService(runtime, aiReqService);
  aiReqService.bindReviewRuntime((work) => native.enqueueDocumentReview(work));
  services.register(IZCodeAgentService, native);
  services.register(IProjectService, new MockProjectService(runtime));

  return { services, runtime };
}
