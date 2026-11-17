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
  generateMobileDeviceFingerprint,
  getV4ClientId,
  logger,
  setStreamClientId,
} from "@zcode/ui";
import { applyTheme, readThemePreference } from "@zcode/ui/useTheme";
import "./styles.css";
import { connectViaWebSocket } from "@zcode/client";

import { EmployeeEntry, createEmployeeEntry } from "./auth/index.js";
import { AIReqApplication as AIReqWebApplication } from "@zcode/ui/aireq";

// 初始化与工号页 hook 共用主题 owner，避免入口安全读取后 hook 再次访问存储导致白屏。
// 默认动效深色；已有偏好保留，system 由 hook 继续监听，工作台挂载后由 StoreProvider 接管。
applyTheme(readThemePreference());

const root = createRoot(document.getElementById("root")!);
const employeeEntry = createEmployeeEntry();
const platform = createWebPlatform();
// 页面只注册一次；登录／重连和 footer 重挂载不能叠加快捷键或执行两次缩放。
window.addEventListener("keydown", (event) => {
  const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const primary = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!primary || event.altKey || event.defaultPrevented) return;
  const command =
    event.key === "+" || event.key === "="
      ? "in"
      : event.key === "-"
        ? "out"
        : event.key === "0"
          ? "reset"
          : null;
  if (!command) return;
  event.preventDefault();
  platform.changeInterfaceZoom(command);
});
let stopConnection: (() => void) | null = null;
let entryGeneration = 0;
let application: ReactNode = null;
let connectionNotice: ReactNode = null;

function renderEntry(content: ReactNode = null): void {
  root.render(
    <div className="flex h-dvh flex-col">
      <EmployeeEntry owner={employeeEntry}>
        <div className="flex min-h-0 flex-1 flex-col">{application ?? content}</div>
        {connectionNotice}
      </EmployeeEntry>
    </div>,
  );
}
// 设备标识仅供既有设备级消费者使用，不作为业务连接或原生命令身份。
setStreamClientId(generateMobileDeviceFingerprint());
// 连接与原生命令共用同一稳定 ID；设备指纹会使合法发送被可信连接校验拒绝。
const webClientId = getV4ClientId();

interface WebBootstrapResult {
  wsUrl: string;
}

function renderWebBootstrapFailure(error: unknown): void {
  // 原始连接异常可能含内部地址或协议细节；产品界面只提供稳定的恢复提示。
  logger.error("[web] Application bootstrap failed", error);
  document.title = "AIReq · 启动失败";
  renderEntry(
    <div role="alert" className="m-auto p-6 text-ui-base text-destructive">
      暂时无法启动工作台，请刷新页面重试。
    </div>,
  );
}

/** 断线重建 accessor 的退避序列（毫秒）；用尽后停留在显式断线屏。 */
const WEB_RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000];

function renderWebDisconnected(message: string, onRetry?: () => void): void {
  document.title = "AIReq · 连接中断";
  connectionNotice = (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-popover p-4 text-ui-base text-foreground shadow-lg"
    >
      <p>连接中断：{message}</p>
      {onRetry ? (
        <button className="mt-2 underline" type="button" onClick={onRetry}>
          重新连接
        </button>
      ) : (
        <p>正在重新连接…</p>
      )}
    </div>
  );
  renderEntry();
}

function resolveDefaultWsOrigin(): string {
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
}

async function resolveWebBootstrap(): Promise<WebBootstrapResult> {
  return { wsUrl: `${resolveDefaultWsOrigin()}/ws` };
}

async function bootstrapWebApp(generation: number) {
  const isCurrentEntry = () =>
    generation === entryGeneration && employeeEntry.employeeNumber !== null;
  let bootstrap: WebBootstrapResult;
  try {
    bootstrap = await resolveWebBootstrap();
  } catch (error) {
    if (isCurrentEntry()) renderWebBootstrapFailure(error);
    return;
  }
  if (!isCurrentEntry()) return;

  // 修复原因：断线只替换 accessor 并重读，不卸载未发送草稿与业务工作区。
  let hasConnected = false;

  const renderApp = (services: Awaited<ReturnType<typeof connectViaWebSocket>>) => {
    hasConnected = true;
    document.title = "AIReq · 需求管理";
    connectionNotice = null;
    application = (
      <AIReqWebApplication
        key={employeeEntry.employeeNumber}
        services={services}
        platform={platform}
        operator={{
          employeeNumber: employeeEntry.employeeNumber!,
          leave: () => employeeEntry.leave(),
        }}
      />
    );
    renderEntry();
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
      renderWebDisconnected("服务暂时不可用，请检查网络后重试。", () => {
        reconnectAttempt = 0;
        void connect();
      });
      return;
    }
    const delay = WEB_RECONNECT_DELAYS_MS[reconnectAttempt];
    reconnectAttempt += 1;
    renderWebDisconnected("网络或服务暂时不可用。");
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
      const nativeUrl = new URL(bootstrap.wsUrl);
      nativeUrl.searchParams.set("employeeId", employeeEntry.employeeNumber!);
      nativeUrl.searchParams.set("clientId", webClientId);
      const services = await connectViaWebSocket(nativeUrl.toString(), {
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
          // 原因：刷新时的正常关闭/端点离开不是传输异常；保留生命周期日志、断线提示与重连。
          const message = `[web] RPC transport closed (code=${event.code}, reason=${event.reason || "none"})`;
          if (event.code === 1000 || event.code === 1001) logger.info(message);
          else logger.warn(message);
          if (!connecting) scheduleReconnect();
        },
      });
      if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) return;
      if (attemptClosed) {
        retry = true;
        return;
      }
      closed = false;
      reconnectAttempt = 0;
      renderApp(services);
    } catch (error) {
      if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) return;
      // 本轮失败即撤销关闭事件资格，异步 close 到达时不能再启动第二条恢复路径。
      attemptGeneration += 1;
      closeActiveSocket();
      closed = true;
      if (!hasConnected) {
        logger.warn("[web] Initial connection failed", error);
        renderWebDisconnected("暂时无法连接服务，请重试。", () => {
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
      if (retry || (attemptClosed && hasConnected)) scheduleReconnect();
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
if (
  window.location.pathname.startsWith("/remote") ||
  new URLSearchParams(window.location.search).has("remote")
) {
  window.history.replaceState(null, "", "/");
}
function handleEntryChange() {
  entryGeneration += 1;
  stopConnection?.();
  stopConnection = null;
  application = null;
  connectionNotice = null;
  renderEntry();
  if (employeeEntry.employeeNumber) void bootstrapWebApp(entryGeneration);
}
employeeEntry.subscribe(handleEntryChange);
handleEntryChange();
