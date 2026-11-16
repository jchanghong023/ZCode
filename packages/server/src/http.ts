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
  IBotsService,
  IBroadcastService,
  IClientConfigService,
  IFileService,
  IFileWatcherService,
  IGenUiService,
  IGitService,
  IMcpSyncService,
  IMediaPreviewService,
  IModelSelectionService,
  IProjectService,
  IProviderSettingsService,
  ISettingService,
  ISkillsService,
  ISubagentsService,
  ISystemService,
  IUsageStatsService,
  IZCodeAgentService,
  IZCodeSessionService,
  IZCodeTaskService,
  type ServiceDescriptor,
  type ServiceExposurePolicy,
  createZCodeAgentConnectionScope,
} from "@zcode/services";
import {
  formatLogPrefix,
  sanitizeTelemetryEventRequest,
  telemetryEventRequestSchema,
} from "@zcode/shared";
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

// 这里只发布当前产品使用的契约成员；未列出的服务、写操作和宿主调试方法不可经 /ws 调用。
const publicMembers = new Map([
  publicService(IAIReqService, ["bootstrap", "call"], ["onDidChange"]),
  publicService(
    IZCodeAgentService,
    [
      "prepareStorage",
      "getStorageStartupState",
      "initialize",
      "syncAppRuntimePreferences",
      "getWorkspaceRuntimeIdentity",
      "listSessionSubagents",
      "supportsConversationQuoteComment",
      "getSkillReferenceCatalog",
      "closeSession",
      "helloConversationV4",
      "initializeConversationV4",
      "subscribeConversationV4",
      "resyncConversationV4",
      "unsubscribeConversationV4",
      "conversationRowsRangeV4",
      "conversationPlansV4",
      "conversationWorkflowRunEventsV4",
      "conversationWorkflowRunsV4",
      "conversationWorkflowRunArtifactsV4",
      "conversationWorkflowRunArtifactDataV4",
      "conversationWorkflowRunArtifactReadV4",
      "conversationWorkflowRunWorkspaceV4",
      "conversationWorkflowRunNodeResultV4",
      "backgroundBashOutputV4",
      "conversationFileChangesV4",
      "conversationFileRewindPreviewV4",
      "sendConversationCommandV4",
      "queryConversationCommandsV4",
      "attachmentBeginV4",
      "attachmentChunkV4",
      "attachmentCommitV4",
      "attachmentAbortV4",
      "attachmentPreviewSourceV4",
      "attachmentReadV4",
      "conversationAttachmentReadV4",
      "conversationAttachmentStatV4",
      "getSessionLifecycle",
      "ensureSessionReady",
      "stopSessionRuntime",
      "restartSessionRuntime",
      "reconcileSessionsIndexV4",
      "subscribeSessionsIndexV4",
      "resyncSessionsIndexV4",
      "unsubscribeSessionsIndexV4",
      "subscribeWorkspaceConfigV4",
      "resyncWorkspaceConfigV4",
      "unsubscribeWorkspaceConfigV4",
    ],
    [
      "onDynamicStorageStartupState",
      "onDynamicSessionLifecycle",
      "onDynamicConversationFrame",
      "onDynamicLocalTtftFacts",
      "onDynamicConversationTelemetryFact",
      "onDynamicSessionsIndexFrame",
      "onDynamicWorkspaceConfigFrame",
      "onAgentRuntimeRestarted",
      "onAgentRuntimeLifecycle",
      "onAgentRuntimeExited",
    ],
  ),
  publicService(IFileService, [
    "searchWorkspaceFiles",
    "readdir",
    "stat",
    "checkFilesExist",
    "readTextFile",
    "readMediaPreview",
    "readFileRange",
    "readBinaryPreview",
    "listWorkspaceFilesLength",
    "listWorkspaceFilesRange",
  ]),
  publicService(IFileWatcherService, ["watch", "unwatch"], ["onDynamicChange"]),
  publicService(IGitService, [
    "getRepositorySummary",
    "getWorkspaceRepositoryInfo",
    "getLocalBranches",
    "getCommitGraph",
    "getChanges",
    "getIgnoredPaths",
    "getDiff",
    "getBranchComparison",
    "getIdentity",
    "refresh",
  ]),
  publicService(ISystemService, ["info"]),
  publicService(IProjectService, ["resolveSessionDirectories"]),
  publicService(IMediaPreviewService, ["prepare", "refreshPlaybackUrl", "release"]),
  publicService(
    IBroadcastService,
    ["send", "acquireClaim", "commitClaim", "releaseClaim", "tryClaim"],
    ["onMessage"],
  ),
  publicService(ISettingService, ["get", "update"]),
  publicService(
    IZCodeTaskService,
    ["getTaskMeta", "restartWorkspaceProcess"],
    ["onDynamicWorkspaceEvent"],
  ),
  publicService(IZCodeSessionService, ["readWorkspacePresentation", "readSession"]),
  publicService(IProviderSettingsService, ["getView", "refresh"], ["onDidChange"]),
  publicService(IModelSelectionService, ["getView"], ["onDidChange"]),
  publicService(IUsageStatsService, [
    "getAppUsageSnapshot",
    "getCodingPlanUsageSnapshot",
    "getCodingPlanRegularTps",
    "getCodingPlanResetStatus",
    "getSnapshot",
    "getEntitlementSnapshot",
  ]),
  publicService(IClientConfigService, ["getSnapshot"]),
  publicService(ISkillsService, ["list"]),
  publicService(ISubagentsService, ["list"]),
  publicService(IMcpSyncService, ["loadMcpFromUserDirectory", "listWorkspaceMcpServerStatuses"]),
  publicService(IGenUiService, ["readDocument", "getState", "listState"], ["onStateChanged"]),
  publicService(IBotsService, [
    "syncAppRuntimePreferences",
    "getStatus",
    "getConfig",
    "listWorkspaceRefs",
    "getUserConfigOptions",
    "listBots",
    "getBotStates",
  ]),
]);
const publicExposure: ServiceExposurePolicy = { allowedMembers: publicMembers };

let nextBroadcastSourceId = 0;

/** 为一条 WebSocket 连接装配 ChannelServer，只暴露产品公开成员。 */
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
  // Web 产品不提供本机目录选择；保持读取契约但不下发真实主机 home 路径。
  overrides.set(ISystemService.channelName, {
    info: async () => ({ homedir: "", platform: process.platform }),
  });
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
  const broadcast = services.get(IBroadcastService);
  const sourceWindowId = ++nextBroadcastSourceId;
  const incoming = new Emitter<Parameters<IBroadcastService["send"]>[0]>();
  let closed = false;
  // 来源归连接而非客户端正文；同 clientId 的两个标签页也必须互相收到。
  const broadcastListener = broadcast.onMessage((message) => {
    if (!closed && message.sourceWindowId !== sourceWindowId) incoming.fire(message);
  });
  const connectionBroadcast: IBroadcastService = {
    send: (message) => {
      if (closed) return Promise.reject(new Error("广播连接已关闭。"));
      return broadcast.send({ channel: message.channel, payload: message.payload, sourceWindowId });
    },
    onMessage: incoming.event,
    acquireClaim: (key) => broadcast.acquireClaim(key),
    commitClaim: (lease) => broadcast.commitClaim(lease),
    releaseClaim: (lease) => broadcast.releaseClaim(lease),
    tryClaim: (key) => broadcast.tryClaim(key),
  };
  overrides.set(IBroadcastService.channelName, connectionBroadcast);
  services.exposeOnChannelServer(loggedServer, overrides, publicExposure);
  socket.onClose(() => {
    closed = true;
    broadcastListener.dispose();
    incoming.dispose();
    void connectionScope?.dispose();
    rawServer.dispose();
  });
}

export interface MockHttpServerOptions {
  host?: string;
  port?: number;
  authToken?: string;
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

export function createMockHttpServer(
  services: ServiceCollection,
  options: MockHttpServerOptions = {},
) {
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
