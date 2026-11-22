// HTTP + WebSocket 宿主：当前帮助配置、/ws 上的二进制 RPC ChannelServer、
// 生产模式静态资源托管。传输层与真实 server 完全同构（packages/rpc SocketProtocol），
// 业务层全部来自 mock 服务集合。
import { readFile, stat } from "node:fs/promises";
import localAppConfig from "../../../config/default.json" with { type: "json" };
import * as nodePath from "node:path";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
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
  IAIReqService,
  IBroadcastService,
  IFileService,
  IModelSelectionService,
  IProjectService,
  ISettingService,
  IZCodeAgentService,
  WEB_MODEL_SELECTION_METHODS,
  type ServiceDescriptor,
  type ServiceExposurePolicy,
  type WebBroadcastMessage,
  type WebBroadcastService,
  type WebProjectService,
  createZCodeAgentConnectionScope,
} from "@zcode/services";
import {
  WEB_AIREQ_AGENT_EVENTS,
  WEB_AIREQ_AGENT_METHODS,
  WEB_CHAT_AGENT_METHODS,
} from "@zcode/services/zcode-agent";
import {
  formatLogPrefix,
  sanitizeTelemetryEventRequest,
  telemetryEventRequestSchema,
} from "@zcode/shared";
import { PROTOCOL_V4_LIMITS } from "@zcode/shared/zcode-protocol-v4";
import {
  getConnectionServices,
  registerAIReqConnection,
  presenceIP,
  validateAIReqIdentity,
  withAIReqIdentity,
} from "./aireq/contract.js";
import type { AIReqIdentity } from "@zcode/services/aireq";
import { bindWebChatConnection } from "./chat/service.js";

type ConnectionData = (
  | { kind: "aireq"; identity: AIReqIdentity; ip: string | null }
  | { kind: "chat"; clientId: string }
) & {
  leavePresence?: () => void;
  transport?: ReturnType<typeof wrapWebSocket>;
};

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

/** 成员名称在编译期对齐服务契约；部署列表不从实现类反射，避免公开 private 方法。 */
function publicService<T>(
  descriptor: ServiceDescriptor<T>,
  methods: readonly (keyof T & string)[],
  events: readonly (keyof T & string)[] = [],
) {
  return [
    descriptor.channelName,
    { methods: new Set<string>(methods), events: new Set<string>(events) },
  ] as const;
}

// 收口原因：白名单与当前契约逐项对齐；退役能力不能仅从 SDK 隐藏后仍可手写 RPC 调用。
const publicMembers = new Map([
  publicService(IAIReqService, ["bootstrap", "call"], ["onDidChange"]),
  publicService(IZCodeAgentService, WEB_AIREQ_AGENT_METHODS, WEB_AIREQ_AGENT_EVENTS),
  publicService(IFileService, [
    "searchWorkspaceFiles",
    "stat",
    "checkFilesExist",
    "readMediaPreview",
    "readFileRange",
  ]),
  publicService(IProjectService, ["resolveSessionDirectories", "readTree"]),
  publicService(IBroadcastService, ["send"], ["onMessage"]),
  publicService(ISettingService, ["get", "update"]),
  publicService(IModelSelectionService, WEB_MODEL_SELECTION_METHODS),
]);
const publicExposure: ServiceExposurePolicy = { allowedMembers: publicMembers };
const chatExposure: ServiceExposurePolicy = {
  allowedMembers: new Map([
    publicService(IModelSelectionService, WEB_MODEL_SELECTION_METHODS),
    publicService(IZCodeAgentService, WEB_CHAT_AGENT_METHODS, WEB_AIREQ_AGENT_EVENTS),
  ]),
};

let nextBroadcastSourceId = 0;

/** 为一条 WebSocket 连接装配 ChannelServer，只暴露产品公开成员。 */
function setupChannelServer(
  socket: ISocket,
  services: ServiceCollection,
  overrides: Map<string, unknown>,
  exposure: ServiceExposurePolicy,
): void {
  const protocol = new SocketProtocol(socket);
  const rawServer = new ChannelServer(protocol, "server");
  // 日志中间件：与真实 server 相同的 RPC 调用日志口径，便于对照调试。
  const loggedServer = new LoggingChannelServer(rawServer, log);
  const agentService = overrides.get(IZCodeAgentService.channelName) as IZCodeAgentService;
  const connectionScope = createZCodeAgentConnectionScope(
    agentService,
    {
      connectionId: `web-ws-${crypto.randomUUID()}`,
      clientMode: "web-remote-replayable",
      role: "terminal-client",
    },
    {
      allowCommandQueriesAcrossWorkspaces: exposure === chatExposure,
      // 不展开作用域代理：订阅和会话方法通过它转发，不能从可枚举属性重建。
      webProtocol: true,
    },
  );
  overrides.set(IZCodeAgentService.channelName, connectionScope.service);
  services.exposeOnChannelServer(loggedServer, overrides, exposure);
  socket.onClose(() => {
    void connectionScope.dispose();
    rawServer.dispose();
  });
}

function setupAIReqChannelServer(
  socket: ISocket,
  services: ServiceCollection,
  identity: AIReqIdentity,
) {
  const overrides = getConnectionServices(services, identity);
  // 项目读取复用 AIReq 的可信连接身份，防止 mention 投影越权读取他人的私有会话。
  const project = services.get<WebProjectService>(IProjectService);
  const connectionIdentity = Object.freeze(validateAIReqIdentity(identity));
  const connectionProject: WebProjectService = {
    resolveSessionDirectories: (request, ...extra: unknown[]) => {
      if (extra.length !== 0) {
        throw Object.assign(new Error("会话目录查询只接收会话引用。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      return withAIReqIdentity(connectionIdentity, () => project.resolveSessionDirectories(request));
    },
    readTree: (...args: unknown[]) => {
      if (args.length !== 0) {
        throw Object.assign(new Error("项目树查询不接收参数。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      return withAIReqIdentity(connectionIdentity, () => project.readTree());
    },
  };
  overrides.set(IProjectService.channelName, connectionProject);
  const broadcast = services.get(IBroadcastService);
  const sourceWindowId = ++nextBroadcastSourceId;
  const incoming = new Emitter<WebBroadcastMessage>();
  let closed = false;
  // 来源归连接而非客户端正文；同 clientId 的两个标签页也必须互相收到。
  const broadcastListener = broadcast.onMessage(({ sourceWindowId: source, channel, payload }) => {
    if (!closed && source !== sourceWindowId) incoming.fire({ channel, payload });
  });
  const connectionBroadcast: WebBroadcastService = {
    send: (message) => {
      if (closed) return Promise.reject(new Error("广播连接已关闭。"));
      if ("sourceWindowId" in message) {
        return Promise.reject(
          Object.assign(new Error("Web 广播不接收窗口来源 ID。"), {
            code: "INVALID_ARGUMENT",
            publicMessage: true,
          }),
        );
      }
      const { channel, payload } = message;
      return broadcast.send({ channel, payload, sourceWindowId });
    },
    onMessage: incoming.event,
  };
  overrides.set(IBroadcastService.channelName, connectionBroadcast);
  socket.onClose(() => {
    closed = true;
    broadcastListener.dispose();
    incoming.dispose();
  });
  setupChannelServer(socket, services, overrides, publicExposure);
}

export interface MockHttpServerOptions {
  host?: string;
  port?: number;
  authToken?: string;
  chatServices: ServiceCollection;
  /** Exact proxy IPs allowed to supply X-Forwarded-For; empty means direct peers only. */
  trustedProxyIPs?: readonly string[];
  /** 生产模式：托管 packages/web 构建产物并开启 SPA fallback。 */
  staticRoot?: string;
  spaFallback?: boolean;
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
  // 发布目录可能残留开发产物；不能通过静态入口公开源码映射。
  if (relativePath.toLowerCase().endsWith(".map")) return null;
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

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

function negotiateStaticEncoding(
  acceptEncoding: string | undefined,
): "br" | "gzip" | "identity" | null {
  const qualities = new Map<string, number>();
  for (const entry of acceptEncoding?.split(",") ?? []) {
    const match =
      /^\s*(br|gzip|identity|\*)\s*(?:;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(
        entry,
      );
    if (match) {
      qualities.set(match[1]!.toLowerCase(), match[2] === undefined ? 1 : Number(match[2]));
    }
  }

  // 原处理器始终返回原文；必须按权重协商，且显式 q=0 不能被通配符覆盖。
  let selected: "br" | "gzip" | "identity" | null = null;
  let bestQuality = 0;
  for (const encoding of ["br", "gzip"] as const) {
    const quality = qualities.get(encoding) ?? qualities.get("*") ?? 0;
    if (quality > bestQuality) {
      selected = encoding;
      bestQuality = quality;
    }
  }
  const identityQuality = qualities.get("identity");
  if (identityQuality !== undefined && identityQuality > bestQuality) {
    return "identity";
  }
  if (selected) {
    return selected;
  }
  return (identityQuality ?? (qualities.get("*") === 0 ? 0 : 1)) > 0 ? "identity" : null;
}

export function createMockHttpServer(services: ServiceCollection, options: MockHttpServerOptions) {
  const app = new Hono<{ Bindings: { server: Bun.Server<ConnectionData> } }>();
  app.onError((error, c) => {
    console.error("[http] request failed", error);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "请求未能完成，请稍后重试。" } },
      500,
    );
  });

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

  // 纯 Web 形态下客户端配置由本机 mock 提供，避免浏览器直连外部 ZCode endpoint。
  app.get("/api/v1/client/configs", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ code: 0, data: { configs: { feedbackUrl: localAppConfig } } });
  });

  app.post("/api/v1/telemetry/events", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: "遥测事件格式无效。" } }, 400);
    }
    const parsed = telemetryEventRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: "遥测事件格式无效。" } }, 400);
    }
    // 接收 owner 在 202 前交给真实服务诊断；只记录清洗副本，不公开读取或持久化承诺。
    log("telemetry:accepted", sanitizeTelemetryEventRequest(parsed.data));
    return c.body(null, 202);
  });

  app.get("/ws", (c) => {
    const query = new URL(c.req.url).searchParams;
    const allowedQuery = new Set(["employeeId", "clientId", "token"]);
    if ([...query.keys()].some((key) => !allowedQuery.has(key) || query.getAll(key).length !== 1)) {
      return c.json({ error: { code: "INVALID_ARGUMENT", message: "连接参数无效。" } }, 400);
    }
    let identity: AIReqIdentity;
    try {
      identity = validateAIReqIdentity({
        employeeId: query.get("employeeId") ?? "",
        clientId: query.get("clientId") ?? "",
      });
    } catch {
      return c.json(
        { error: { code: "INVALID_IDENTITY", message: "工号或客户端身份无效。" } },
        400,
      );
    }
    const ip = presenceIP(
      c.env.server.requestIP(c.req.raw)?.address,
      c.req.header("x-forwarded-for"),
      options.trustedProxyIPs ?? [],
    );
    if (
      c.env.server.upgrade(c.req.raw, {
        data: { kind: "aireq", identity, ip },
        headers: c.res.headers,
      })
    ) {
      return new Response(null);
    }
    return c.text("WebSocket upgrade required", 400);
  });

  app.get("/ws/chat", (c) => {
    const query = new URL(c.req.url).searchParams;
    const clientId = query.get("clientId") ?? "";
    if (
      [...query.keys()].some(
        (key) => !["clientId", "token"].includes(key) || query.getAll(key).length !== 1,
      ) ||
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(clientId)
    )
      return c.json({ error: "Invalid chat connection" }, 400);
    if (
      c.env.server.upgrade(c.req.raw, { data: { kind: "chat", clientId }, headers: c.res.headers })
    ) {
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
      c.header("Vary", "Accept-Encoding");
      const encoding = negotiateStaticEncoding(c.req.header("Accept-Encoding"));
      if (!encoding) {
        return c.text("Not Acceptable", 406);
      }
      c.header(
        "Cache-Control",
        filePath.endsWith("index.html")
          ? "no-cache"
          : /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]{8,}\.[^/\\]+$/.test(filePath)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=0, must-revalidate",
      );
      c.header("Content-Type", staticContentType(filePath));
      if (encoding !== "identity") {
        c.header("Content-Encoding", encoding);
      }
      if (c.req.method === "HEAD") {
        return c.body(null);
      }
      const content = await readFile(filePath);
      const body =
        encoding === "br"
          ? await compressBrotli(content, {
              params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
            })
          : encoding === "gzip"
            ? await compressGzip(content)
            : content;
      return c.body(body);
    });
  }

  const server = Bun.serve<ConnectionData>({
    port: options.port ?? 3031,
    hostname: options.host,
    fetch(request, server) {
      return app.fetch(request, { server });
    },
    websocket: {
      // ping/pong 保持无人操作的订阅，同时清理断网后没有 close 帧的失联连接。
      idleTimeout: 60,
      sendPings: true,
      // 逻辑快照会成批发送；base64 后可超过 Bun 默认的 16 MiB 写缓冲。
      backpressureLimit: 2 * PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes,
      closeOnBackpressureLimit: true,
      open(ws) {
        ws.binaryType = "uint8array";
        const transport = wrapWebSocket(ws);
        ws.data.transport = transport;
        try {
          if (ws.data.kind === "chat") {
            const agent = bindWebChatConnection(
              options.chatServices.get(IZCodeAgentService),
              ws.data.clientId,
            );
            const overrides = new Map([[IZCodeAgentService.channelName, agent]]);
            setupChannelServer(transport.socket, options.chatServices, overrides, chatExposure);
          } else {
            ws.data.leavePresence = registerAIReqConnection(services, ws.data.identity, ws.data.ip);
            setupAIReqChannelServer(transport.socket, services, ws.data.identity);
          }
        } catch (error) {
          ws.data.leavePresence?.();
          ws.close(1011, "Connection setup failed");
          throw error;
        }
      },
      message(ws, message) {
        if (typeof message === "string") {
          ws.close(1003, "Binary RPC frames required");
          return;
        }
        ws.data.transport?.receive(message);
      },
      close(ws) {
        // 先释放该连接的 RPC 订阅，再广播离线，避免向已经关闭的 socket 写自身离线事件。
        try {
          ws.data.transport?.close();
        } finally {
          ws.data.leavePresence?.();
        }
      },
    },
  });
  log(`http://${options.host?.trim() || "localhost"}:${server.port}`);

  return server;
}
