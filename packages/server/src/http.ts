// HTTP + WebSocket 宿主：/api/server-info 元信息、/ws 上的二进制 RPC ChannelServer、
// 生产模式静态资源托管。传输层与真实 server 完全同构（packages/rpc SocketProtocol），
// 业务层全部来自 mock 服务集合。
import { hostname } from "node:os";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WebSocket } from "ws";
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

function wrapWebSocket(ws: WebSocket): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();

  ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    onData.fire(VSBuffer.wrap(new Uint8Array(buf)));
  });
  ws.on("close", () => {
    onClose.fire();
    onEnd.fire();
  });
  ws.on("error", () => {
    onClose.fire();
    onEnd.fire();
  });

  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write(buffer: VSBuffer) {
      if (ws.readyState === ws.OPEN) {
        ws.send(buffer.buffer);
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
}

const log = (...args: unknown[]) =>
  console.log(formatLogPrefix("zcode-mock-server:http", process.pid), ...args);

/** 为一条 WebSocket 连接装配 ChannelServer 并暴露全部 mock 服务。 */
function setupChannelServer(ws: WebSocket, services: ServiceCollection): void {
  const socket = wrapWebSocket(ws);
  const protocol = new SocketProtocol(socket);
  const rawServer = new ChannelServer(protocol, "server");
  // 日志中间件：与真实 server 相同的 RPC 调用日志口径，便于对照调试。
  const loggedServer = new LoggingChannelServer(rawServer, log);
  const agentService = services.getOptional(IZCodeAgentService);
  const connectionScope = agentService
    ? createZCodeAgentConnectionScope(agentService, {
        connectionId: `mock-ws-${crypto.randomUUID()}`,
        clientMode: "web-remote-replayable",
        role: "terminal-client",
      })
    : undefined;
  const overrides = new Map<string, unknown>();
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
    workspaces: [{ path: workspacePath, label: basename(workspacePath) || workspacePath }],
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

async function resolveStaticFile(
  staticRoot: string,
  pathname: string,
  spaFallback: boolean,
): Promise<string | null> {
  const root = resolve(staticRoot);
  const normalizedPathname = pathname === "/" ? "/index.html" : pathname;
  const relativePath = decodeURIComponent(normalizedPathname).replace(/^\/+/, "");
  let candidate = resolve(root, relativePath);
  const diff = relativePath === "" ? "" : relativePath;
  if (diff.startsWith("..")) {
    return null;
  }
  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = resolve(candidate, "index.html");
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
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

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

  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        setupChannelServer(ws.raw as WebSocket, services);
      },
    })),
  );

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

  const port = options.port ?? 3030;
  const server = serve({ fetch: app.fetch, hostname: options.host, port }, () => {
    const address = server.address();
    const listenPort = typeof address === "object" && address ? address.port : port;
    const listenHost = options.host?.trim() || "localhost";
    log(`http://${listenHost}:${listenPort}`);
  });

  injectWebSocket(server);

  return server;
}
