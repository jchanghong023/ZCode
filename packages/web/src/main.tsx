// Web 应用运行在用户自己的浏览器里，版本不受我们控制。
// ZCT-2118215639243444224：Chrome 109 没有 Array.prototype.toSorted，Hook 详情组件渲染时抛
// TypeError，区域错误边界显示“这块界面出了点问题”。Vite 只降级语法、不补运行时 API，
// 这里只补产物实际用到、且高于构建语法基线的 API；core-js 会先检测原生实现，不覆盖新版浏览器。
// 必须放在最前面：ES module 按 import 顺序求值，其他模块执行前 API 需已就绪。
import "core-js/stable/array/to-sorted";
import "core-js/stable/array/to-reversed";
import "core-js/stable/object/group-by";
import { createWebPlatform } from "#src/platform/index.js";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import {
  AppErrorBoundary,
  Root,
  ZCodeIntlProvider,
  generateMobileDeviceFingerprint,
  logger,
  setStreamClientId,
  type Theme,
} from "@zcode/ui";
import "./styles.css";
import { connectViaWebSocket } from "@zcode/client";

import { EmployeeEntry, createEmployeeEntry } from "./auth/index.js";
import type { ServerRemoteInfo } from "@zcode/shared";

function resolveWebThemePreference(): Theme {
  const stored = localStorage.getItem("zcode-theme");
  // 语义沿用既有主题偏好：dark/light 归一为 zai-*，
  // 合法值原样保留（含 system），缺省或非法值回 zai-dark。
  if (stored === "dark") return "zai-dark";
  if (stored === "light") return "zai-light";
  if (stored === "zai-dark" || stored === "zai-light" || stored === "system") return stored;
  return "zai-dark";
}

// 初始化主题：默认 Zai dark，后续由 useTheme hook 接管
// system 模式下需要查询系统偏好；非 system 模式直接用存储值
{
  const saved = resolveWebThemePreference();
  const resolved =
    saved === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : saved === "dark" || saved === "zai-dark"
        ? "dark"
        : "light";
  const appliedTheme =
    saved === "system"
      ? resolved === "dark"
        ? "zai-dark"
        : "zai-light"
      : saved === "dark"
        ? "zai-dark"
        : saved === "light"
          ? "zai-light"
          : saved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle("theme-zai-light", appliedTheme === "zai-light");
  document.documentElement.classList.toggle("theme-zai-dark", appliedTheme === "zai-dark");
}

const root = createRoot(document.getElementById("root")!);
const employeeEntry = createEmployeeEntry();
let stopConnection: (() => void) | null = null;
let entryGeneration = 0;

function renderEntry(content: ReactNode = null): void {
  root.render(<div className="flex h-dvh flex-col"><EmployeeEntry owner={employeeEntry}>{content}</EmployeeEntry></div>);
}
// 初始化 Web 端流式 clientId，确保所有 hook 在首次渲染前就使用稳定 ID
{
  setStreamClientId(generateMobileDeviceFingerprint());
}

interface WebBootstrapResult {
  wsUrl: string;
  initialWorkspaceAbsPath?: string;
  initialWorkspaceIdentity?: string;
  initialTaskId?: string;
  restoreSession?: boolean;
  allowOpenWorkspace?: boolean;
}

function renderWebBootstrapFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  document.title = "ZCode - Web";
  renderEntry(
    <div
      style={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary, #888)",
      }}
    >
      <p>Bootstrap failed: {message}</p>
    </div>,
  );
}

/** 断线重建 accessor 的退避序列（毫秒）；用尽后停留在显式断线屏。 */
const WEB_RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000];

function renderWebDisconnected(message: string, onRetry?: () => void): void {
  document.title = "ZCode - Web (disconnected)";
  renderEntry(
    <div
      style={{
        display: "flex",
        height: "100vh",
        flexDirection: "column",
        gap: 12,
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary, #888)",
      }}
    >
      <p>Connection lost: {message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Reconnect
        </button>
      ) : (
        <p>Reconnecting…</p>
      )}
    </div>,
  );
}

function resolveDefaultWsOrigin(): string {
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
}

async function resolveWebBootstrap(): Promise<WebBootstrapResult> {
  const wsUrl = `${resolveDefaultWsOrigin()}/ws`;

  try {
    const response = await fetch("/api/server-info", {
      cache: "no-store",
    });
    if (!response.ok) {
      return { wsUrl };
    }
    const serverInfo = (await response.json()) as Partial<ServerRemoteInfo>;
    const workspace = Array.isArray(serverInfo.workspaces) ? serverInfo.workspaces[0] : undefined;
    return {
      wsUrl,
      ...(workspace?.path ? { initialWorkspaceAbsPath: workspace.path } : {}),
      ...(workspace?.workspaceIdentity
        ? { initialWorkspaceIdentity: workspace.workspaceIdentity }
        : {}),
    };
  } catch {
    return { wsUrl };
  }
}

async function bootstrapWebApp(generation: number) {
  const isCurrentEntry = () => generation === entryGeneration && employeeEntry.employeeNumber !== null;
  let bootstrap: WebBootstrapResult;
  try {
    bootstrap = await resolveWebBootstrap();
  } catch (error) {
    if (isCurrentEntry()) renderWebBootstrapFailure(error);
    return;
  }
  if (!isCurrentEntry()) return;

  const platform = createWebPlatform();
  // 每次重建连接都换 key：Root 及其 store/订阅整体重挂载，v4 走 fresh-subscribe，
  // 不在旧 accessor 上原地续传（等价刷新恢复路径，见 docs/v4-refactor/05 §8.2）。
  let connectionGeneration = 0;

  const renderApp = (services: Awaited<ReturnType<typeof connectViaWebSocket>>) => {
    connectionGeneration += 1;
    document.title = "ZCode - Web + Server";
    renderEntry(
      <AppErrorBoundary>
        <ZCodeIntlProvider>
          <Root
            key={connectionGeneration}
            services={services}
            platform={platform}
            operator={{ employeeNumber: employeeEntry.employeeNumber!, leave: () => employeeEntry.leave() }}
            initialWorkspaceAbsPath={bootstrap.initialWorkspaceAbsPath}
            initialWorkspaceIdentity={bootstrap.initialWorkspaceIdentity}
            initialTaskId={bootstrap.initialTaskId}
            restoreSession={bootstrap.restoreSession}
            allowOpenWorkspace={bootstrap.allowOpenWorkspace}
          />
        </ZCodeIntlProvider>
      </AppErrorBoundary>,
    );
  };

  // 修复原因（P0-1）：原实现 onClose 传空函数，断线后 UI 无感知、请求永久挂起。
  // 现在断线进入显式 disconnected 状态，按退避重建 accessor；ChannelClient 已保证
  // 旧连接上的 pending 请求全部 fail-closed，这里只负责生命周期与可见状态。
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connecting = false;
  let closed = false;
  let activeSocket: WebSocket | null = null;
  let attemptGeneration = 0;
  let disposed = false;
  const closeActiveSocket = () => {
    activeSocket?.close();
    activeSocket = null;
  };
  stopConnection = () => {
    disposed = true;
    attemptGeneration += 1;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeActiveSocket();
    window.removeEventListener("online", handleOnline);
  };

  const scheduleReconnect = () => {
    if (disposed || !isCurrentEntry() || reconnectTimer !== null || connecting) {
      return;
    }
    if (reconnectAttempt >= WEB_RECONNECT_DELAYS_MS.length) {
      renderWebDisconnected("server unreachable", () => {
        reconnectAttempt = 0;
        void connect();
      });
      return;
    }
    const delay = WEB_RECONNECT_DELAYS_MS[reconnectAttempt];
    reconnectAttempt += 1;
    renderWebDisconnected("reconnecting");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async (): Promise<void> => {
    if (disposed || !isCurrentEntry() || connecting || activeSocket !== null) {
      return;
    }
    connecting = true;
    const attempt = ++attemptGeneration;
    let retry = false;
    let attemptClosed = false;
    try {
      const services = await connectViaWebSocket(bootstrap.wsUrl, {
        onOpenSocket: (ws) => {
          if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) {
            ws.close();
            return;
          }
          activeSocket = ws;
        },
        onClose: (event) => {
          // 只处理当前活跃 socket 的关闭；被替换的旧 socket 迟到事件不再触发重连。
          if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) {
            return;
          }
          attemptClosed = true;
          activeSocket = null;
          closed = true;
          logger.warn(
            `[web] RPC transport closed (code=${event.code}, reason=${event.reason || "none"})`,
          );
          if (!connecting) scheduleReconnect();
        },
      });
      if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) return;
      if (attemptClosed) { retry = true; return; }
      closed = false;
      reconnectAttempt = 0;
      renderApp(services);
    } catch (error) {
      if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) return;
      // 本轮失败即撤销关闭事件资格，异步 close 到达时不能再启动第二条恢复路径。
      attemptGeneration += 1;
      closeActiveSocket();
      closed = true;
      if (connectionGeneration === 0) {
        renderWebDisconnected(error instanceof Error ? error.message : String(error), () => {
          reconnectAttempt = 0;
          void connect();
        });
      } else {
        logger.warn("[web] RPC reconnect failed", error);
        retry = true;
      }
    } finally {
      connecting = false;
      // Bug 原因：connecting 尚为 true 时安排重试会被准入守卫丢弃。
      // 必须先释放本轮连接资格，再安排唯一 timer；旧 attempt 的关闭回调不能污染下一轮。
      if (retry || (attemptClosed && connectionGeneration > 0)) scheduleReconnect();
    }
  };

  function handleOnline() {
    if (!disposed && closed && reconnectTimer === null && !connecting) {
      reconnectAttempt = 0;
      void connect();
    }
  }
  window.addEventListener("online", handleOnline);

  await connect();
}

// 旧 remote/授权回调不再是产品入口，不读取其中的 Host 或账号参数。
if (window.location.pathname.startsWith("/remote") || new URLSearchParams(window.location.search).has("remote")) {
  window.history.replaceState(null, "", "/");
}
function handleEntryChange() {
  entryGeneration += 1;
  stopConnection?.();
  stopConnection = null;
  renderEntry();
  if (employeeEntry.employeeNumber) void bootstrapWebApp(entryGeneration);
}
employeeEntry.subscribe(handleEntryChange);
handleEntryChange();
