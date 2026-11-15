// HTTP + WebSocket 宿主：/api/server-info 元信息、/ws 上的二进制 RPC ChannelServer、
// 生产模式静态资源托管。传输层与真实 server 完全同构（packages/rpc SocketProtocol），
// 业务层全部来自 mock 服务集合。
import { hostname } from "node:os";
import { readFile, stat } from "node:fs/promises";
import localAppConfig from "../../../config/default.json" with { type: "json" };
import * as nodePath from "node:path";
import { basename, extname, resolve } from "node:path";
import { Hono, type Context } from "hono";
import type { ServerWebSocket } from "bun";
import {
  Emitter,
  VSBuffer,
  SocketProtocol,
  ChannelServer,
  LoggingChannelServer,
  type ISocket,
} from "@zcode/rpc";
import {
  ServiceCollection,
  IZCodeAgentService,
  createZCodeAgentConnectionScope,
} from "@zcode/services";
import {
  formatLogPrefix,
  serverRemoteInfoOutputSchema,
  SERVER_REMOTE_PROTOCOL_VERSION,
  ZCODE_VERSION,
  ZCODE_COMPATIBILITY_MANIFEST,
  type ServerRemoteInfo,
} from "@zcode/shared";
import { resolveServerOsUser } from "@zcode/shared/node";
import { workspaceIdentityOf } from "./mock/runtime.js";
import { getConnectionServices, validateAIReqIdentity } from "./aireq/contract.js";
import type { AIReqIdentity } from "@zcode/services/aireq";

interface ConnectionData {
  identity: AIReqIdentity;
  transport?: ReturnType<typeof wrapWebSocket>;
}

function wrapWebSocket(ws: ServerWebSocket<ConnectionData>) {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();
  let closed = false;

  const socket: ISocket = {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write(buffer) {
      // Bun 的 0 表示发送失败，-1 表示已缓存；不能把失败伪装成成功。
      if (ws.readyState !== 1 || ws.send(buffer.buffer) === 0) {
        throw new Error("WebSocket send failed");
      }
    },
    end() {
      ws.close();
    },
    drain() {
      return Promise.resolve();
    },
    dispose() {
      ws.close();
    },
  };

  return {
    socket,
    receive(data: Uint8Array) {
      onData.fire(VSBuffer.wrap(data));
    },
    close() {
      if (closed) return;
      closed = true;
      onClose.fire();
      onEnd.fire();
      onData.dispose();
      onClose.dispose();
      onEnd.dispose();
    },
  };
}

const log = (...args: unknown[]) =>
  console.log(formatLogPrefix("zcode-mock-server:http", process.pid), ...args);

/** 为一条 WebSocket 连接装配 ChannelServer 并暴露全部 mock 服务。 */
function setupChannelServer(
  socket: ISocket,
  services: ServiceCollection,
  identity: AIReqIdentity,
): void {
  const protocol = new SocketProtocol(socket);
  const rawServer = new ChannelServer(protocol, "server");
  // 日志中间件：与真实 server 相同的 RPC 调用日志口径，便于对照调试。
  const loggedServer = new LoggingChannelServer(rawServer, log);
  const overrides = getConnectionServices(services, identity);
  const agentService = overrides.get(IZCodeAgentService.channelName) as
    | IZCodeAgentService
    | undefined;
  const connectionScope = agentService
    ? createZCodeAgentConnectionScope(agentService, {
        connectionId: `mock-ws-${crypto.randomUUID()}`,
        clientMode: "web-remote-replayable",
        role: "terminal-client",
      })
    : undefined;
  if (connectionScope) {
    overrides.set(IZCodeAgentService.channelName, connectionScope.service);
  }
  services.exposeOnChannelServer(loggedServer, overrides);
  socket.onClose(() => {
    void connectionScope?.dispose();
    rawServer.dispose();
  });
}

export interface MockHttpServerOptions {
  serverId?: string;
  name?: string;
  host?: string;
  port?: number;
  authToken?: string;
  /** 生产模式：托管 packages/web 构建产物并开启 SPA fallback。 */
  staticRoot?: string;
  spaFallback?: boolean;
}

function createServerInfo(options: MockHttpServerOptions, workspacePath: string): ServerRemoteInfo {
  return serverRemoteInfoOutputSchema.parse({
    serverId: options.serverId?.trim() || hostname() || "zcode-mock-server",
    ...(options.name?.trim() ? { name: options.name.trim() } : {}),
    version: ZCODE_VERSION,
    protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
    authRequired: Boolean(options.authToken),
    workspaces: [
      {
        path: workspacePath,
        label: basename(workspacePath) || workspacePath,
        workspaceIdentity: workspaceIdentityOf(workspacePath),
      },
    ],
    compatibility: ZCODE_COMPATIBILITY_MANIFEST,
    migration: { failedPathCount: 0 },
    identity: { osUser: resolveServerOsUser(), hostname: hostname() },
    // 能力位按 wire schema 是字面量合同（desktopContinuous/websocketRpc 必须为 true）；
    // 模拟后端沿用同一合同以保持 UI 判定逻辑不变。
    capabilities: {
      desktopContinuous: true,
      websocketRpc: true,
      virtualProjects: true,
      processResourceTelemetry: false,
      remoteConversationTelemetry: false,
    },
  });
}

const zcodeLiteTokenCookieName = "zcode_lite_token";

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function hasValidLiteToken(c: Context, token: string): boolean {
  const authorization = c.req.header("authorization");
  if (
    authorization?.startsWith("Bearer ") &&
    authorization.slice("Bearer ".length).trim() === token
  ) {
    return true;
  }
  const url = new URL(c.req.url);
  if (url.searchParams.get("token") === token) {
    c.header(
      "Set-Cookie",
      `${zcodeLiteTokenCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`,
    );
    return true;
  }
  return parseCookieHeader(c.req.header("cookie")).get(zcodeLiteTokenCookieName) === token;
}

function isTokenProtectedPath(pathname: string): boolean {
  return pathname === "/ws" || pathname.startsWith("/ws/") || pathname.startsWith("/api/");
}

const staticMimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// 盘符路径（"Z:/x"、"Z:\x"、"Z:x"）在 Windows 的 path.resolve 下会被当作绝对/盘符相对
// 路径解析到另一块盘（含 subst 虚拟盘与映射的网络盘），一律拒绝，不做静态资源解析。
const DRIVE_QUALIFIED_PATH_PATTERN = /^[a-zA-Z]:/;

function isPathDriveQualified(pathname: string): boolean {
  return DRIVE_QUALIFIED_PATH_PATTERN.test(pathname);
}

// pathApi 可注入便于跨平台测试。Windows 跨盘时 path.relative 返回的是绝对路径（如
// "Z:\marker.txt"），不以 ".." 开头，曾因此被误判为「在静态根内」导致越盘读取；
// relative 结果为绝对路径的一律视为越界，posix 语义不受影响。
function isInsideDirectory(
  root: string,
  candidate: string,
  pathApi: Pick<typeof nodePath, "relative" | "isAbsolute" | "sep"> = nodePath,
): boolean {
  const diff = pathApi.relative(root, candidate);
  if (pathApi.isAbsolute(diff)) return false;
  return diff === "" || (!diff.startsWith("..") && !diff.includes(`..${pathApi.sep}`));
}

async function resolveStaticFile(
  staticRoot: string,
  pathname: string,
  spaFallback: boolean,
): Promise<string | null> {
  const root = resolve(staticRoot);
  const normalizedPathname = pathname === "/" ? "/index.html" : pathname;
  const relativePath = decodeURIComponent(normalizedPathname).replace(/^\/+/, "");
  // 盘符路径必须在 resolve 之前拦截（含 %3A 解码后的形式），否则 Windows 上会解析到
  // 静态根所在盘之外的路径；直接 404，也不进入 SPA fallback。
  if (isPathDriveQualified(relativePath)) {
    return null;
  }
  let candidate = resolve(root, relativePath);
  if (!isInsideDirectory(root, candidate)) {
    return null;
  }

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = resolve(candidate, "index.html");
      if (!isInsideDirectory(root, candidate)) {
        return null;
      }
      const indexStat = await stat(candidate);
      return indexStat.isFile() ? candidate : null;
    }
    if (candidateStat.isFile()) {
      return candidate;
    }
  } catch {
    // 未命中静态文件时进入 SPA fallback。
  }
  if (!spaFallback || isTokenProtectedPath(pathname)) {
    return null;
  }
  try {
    const indexStat = await stat(resolve(root, "index.html"));
    return indexStat.isFile() ? resolve(root, "index.html") : null;
  } catch {
    return null;
  }
}

function staticContentType(filePath: string): string {
  return staticMimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function createMockHttpServer(
  services: ServiceCollection,
  workspacePath: string,
  options: MockHttpServerOptions = {},
) {
  const app = new Hono<{ Bindings: { server: Bun.Server<ConnectionData> } }>();

  const authToken = options.authToken?.trim();
  if (authToken) {
    app.use("*", async (c, next) => {
      const pathname = new URL(c.req.url).pathname;
      if (!isTokenProtectedPath(pathname) || hasValidLiteToken(c, authToken)) {
        await next();
        return;
      }
      return c.json({ error: "Unauthorized" }, 401);
    });
  }

  app.get("/api/server-info", (c) => c.json(createServerInfo(options, workspacePath)));

  // 纯 Web 形态下客户端配置由本机 mock 提供，避免浏览器直连外部 ZCode endpoint。
  app.get("/api/v1/client/configs", (c) =>
    c.json({ code: 0, data: { configs: { feedbackUrl: localAppConfig } } }),
  );

  // Web 端启动期（canOpenCommunity/openFeedback）按同源 /api/v1/client/configs 读取
  // help/community 配置。mock 是自洽站点：返回内存态配置，与 config/default.json 同形，
  // HTTP/HTTPS 部署下浏览器都能直接消费，不再指向生产 endpoint。
  app.get("/api/v1/client/configs", (c) =>
    c.json({
      community_urls: {
        "zh-CN":
          "https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=47ag983c-8fcb-4d6d-814b-5395193a712c&qr_code=true",
        "en-US": "https://discord.gg/z9aBcQXZQ3",
      },
      feedback_url: "https://zhipu-ai.feishu.cn/share/base/form/shrcnrXlh93cJIUFYBFndnnL7pe",
      feedback_use_external_form: false,
    }),
  );

  app.get("/ws", (c) => {
    const query = new URL(c.req.url).searchParams;
    const identity = validateAIReqIdentity({
      employeeId: query.get("employeeId") ?? "",
      clientId: query.get("clientId") ?? "",
      ...(query.get("demo") ? { demo: query.get("demo")! } : {}),
    });
    if (c.env.server.upgrade(c.req.raw, { data: { identity }, headers: c.res.headers })) {
      return new Response(null);
    }
    return c.text("WebSocket upgrade required", 400);
  });

  if (options.staticRoot?.trim()) {
    const staticRoot = options.staticRoot.trim();
    app.get("*", async (c) => {
      const pathname = new URL(c.req.url).pathname;
      const filePath = await resolveStaticFile(staticRoot, pathname, options.spaFallback ?? true);
      if (!filePath) {
        return c.notFound();
      }
      return c.body(await readFile(filePath), 200, {
        "Cache-Control": filePath.endsWith("index.html")
          ? "no-cache"
          : "public, max-age=31536000, immutable",
        "Content-Type": staticContentType(filePath),
      });
    });
  }

  const server = Bun.serve<ConnectionData>({
    port: options.port ?? 3030,
    hostname: options.host,
    fetch(request, server) {
      return app.fetch(request, { server });
    },
    websocket: {
      // 保持原长连接语义：不能用 Bun 默认空闲超时中断无人发言的 RPC 订阅。
      idleTimeout: 0,
      open(ws) {
        ws.binaryType = "uint8array";
        const transport = wrapWebSocket(ws);
        ws.data.transport = transport;
        setupChannelServer(transport.socket, services, ws.data.identity);
      },
      message(ws, message) {
        if (typeof message === "string") {
          ws.close(1003, "Binary RPC frames required");
          return;
        }
        ws.data.transport?.receive(message);
      },
      close(ws) {
        ws.data.transport?.close();
      },
    },
  });
  log(`http://${options.host?.trim() || "localhost"}:${server.port}`);

  return server;
}
