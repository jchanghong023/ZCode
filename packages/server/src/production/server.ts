import { resolve } from "node:path";
import {
  ServiceCollection,
  IBroadcastService,
  IModelSelectionService,
  IZCodeAgentService,
} from "@zcode/services";
import { IAIReqService } from "@zcode/services/aireq";
import { createServiceLogger } from "@zcode/services/logger";
import { deploymentOptions, productionHelp } from "./options.js";
import type { SdkModules } from "./omp.js";

const logger = createServiceLogger("production");
export async function startProduction(
  options: { sdk: SdkModules | (() => Promise<SdkModules>); staticRoot?: string; args?: string[] },
) {
  const config = deploymentOptions(options.args ?? process.argv.slice(2));
  if (config.help) {
    process.stdout.write(productionHelp + "\n");
    return;
  }
  process.env["ZCODE_CLOUDDRAGON_MODE"] = config.cloud;
  if (config.zone === "yellow" && config.cloud === "mock") {
    process.env["ZCODE_CLOUDDRAGON_MOCK_DB"] ||= resolve(config.root, "clouddragon.sqlite");
  }
  const {
    openProduction,
    fileTransfer,
    startRedZoneImport,
    MockAIReqService,
    configureBusinessResearch,
  } = await import("../aireq/contract.js");
  const { OmpEngine } = await import("./omp.js");
  const store = openProduction(config.zone, config.root, config.exchange);
  let stopImport: (() => void) | undefined;
  process.once("exit", () => {
    stopImport?.();
    store.db.close();
  });
  const sdk = typeof options.sdk === "function" ? await options.sdk() : options.sdk;
  const engine = new OmpEngine(sdk, store);
  await engine.discover(config.workspace);
  configureBusinessResearch(engine.knowledgeMcp);
  const { createHttpServer } = await import("../http.js");
  const { MockRuntime } = await import("../mock/runtime.js");
  const { MockZCodeAgentService } = await import("../mock/zcodeAgent.js");
  const { MockBroadcastService } = await import("../mock/broadcast.js");
  const { createWebChatServices } = await import("../chat/service.js");
  const { registerProductionPlatformServices } = await import("./platform-services.js");
  const services = new ServiceCollection();
  const runtime = new MockRuntime({ workspacePath: config.workspace, production: true });
  const business = new MockAIReqService(config.root, fileTransfer(store));
  const native = new MockZCodeAgentService(runtime, business, undefined, { engine, store });
  business.bindReviewRuntime((work) => native.enqueueDocumentReview(work));
  services.register(IAIReqService, business.remote);
  services.register(IZCodeAgentService, native);
  services.register(IModelSelectionService, engine);
  services.register(IBroadcastService, new MockBroadcastService());
  await registerProductionPlatformServices(services, runtime, store);
  if (config.zone === "red") stopImport = startRedZoneImport(store);
  const staticRoot = options.staticRoot ?? process.env["ZCODE_WEB_STATIC_ROOT"]?.trim();
  const publicOrigin = process.env["ZCODE_PUBLIC_ORIGIN"]?.trim() || undefined;
  const trustedProxyIPs = (process.env["ZCODE_TRUSTED_PROXY_IPS"] ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  // TUI 历史属于本机运行账户，不纳入共享部署令牌所授权的业务数据。
  const localTuiHistory =
    config.zone === "yellow" &&
    ["127.0.0.1", "::1", "localhost"].includes(config.host.toLowerCase()) &&
    !publicOrigin &&
    trustedProxyIPs.length === 0;
  const server = createHttpServer(services, {
    port: config.port,
    host: config.host,
    webPort: config.webPort,
    publicOrigin,
    authToken: process.env["ZCODE_SERVER_AUTH_TOKEN"]?.trim() || undefined,
    trustedProxyIPs,
    chatServices: createWebChatServices(config.workspace, { engine, store }, localTuiHistory),
    ...(staticRoot && { staticRoot, spaFallback: true }),
  });
  logger.info(undefined, "正式 Web 服务已启动", { zone: config.zone, port: server.port });
  return server;
}

