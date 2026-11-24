// 模拟后端入口：启动 HTTP + WebSocket 服务。
// 默认 workspace 为当前工作目录；可用 ZCODE_SERVER_WORKSPACE 覆盖。
import { createMockServices } from "./mock/index.js";
import { createMockHttpServer } from "./http.js";
import { createWebChatServices } from "./chat/service.js";
import { initializePrototypeProjectWorkspaces } from "./aireq/contract.js";

function resolveWorkspacePath(): string {
  return process.env["ZCODE_SERVER_WORKSPACE"]?.trim() || process.cwd();
}

async function main(): Promise<void> {
  const workspacePath = resolveWorkspacePath();
  const port = Number(process.env["PORT"]) || 3031;
  const host = process.env["ZCODE_SERVER_HOST"]?.trim() || process.env["HOST"]?.trim() || "0.0.0.0";
  const staticRoot = process.env["ZCODE_WEB_STATIC_ROOT"]?.trim() || undefined;
  const authToken = process.env["ZCODE_SERVER_AUTH_TOKEN"]?.trim() || undefined;

  await initializePrototypeProjectWorkspaces(workspacePath);
  const { services } = createMockServices({ workspacePath });
  const chatServices = createWebChatServices(workspacePath);
  createMockHttpServer(services, {
    port,
    chatServices,
    trustedProxyIPs: (process.env["ZCODE_TRUSTED_PROXY_IPS"] ?? "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
    ...(host ? { host } : {}),
    ...(staticRoot ? { staticRoot, spaFallback: true } : {}),
    ...(authToken ? { authToken } : {}),
  });
}

void main().catch((error: unknown) => {
  console.error("[zcode-mock-server] startup failed", error);
  process.exitCode = 1;
});
