// Web 应用运行在用户自己的浏览器里，版本不受我们控制。
// ZCT-2118215639243444224：Chrome 109 没有 Array.prototype.toSorted，Hook 详情组件渲染时抛
// TypeError，区域错误边界显示“这块界面出了点问题”。Vite 只降级语法、不补运行时 API，
// 这里只补产物实际用到、且高于构建语法基线的 API；core-js 会先检测原生实现，不覆盖新版浏览器。
// 必须放在最前面：ES module 按 import 顺序求值，其他模块执行前 API 需已就绪。
import "core-js/stable/array/to-sorted";
import "core-js/stable/array/to-reversed";
import "core-js/stable/object/group-by";
import { createWebPlatform } from "#src/platform/index.js";
import { deploymentToken } from "#src/deploymentAccess.js";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { getV4ClientId, logger } from "@zcode/ui";
import "./styles.css";
import { connectViaWebSocket } from "@zcode/client";
import { createUuid } from "@zcode/shared";

import { EmployeeEntry, createEmployeeEntry, type EmployeeEntryConnection } from "./auth/index.js";
import { AIReqApplication as AIReqWebApplication } from "@zcode/ui/aireq";

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
let entryConnection: EmployeeEntryConnection | null = null;

function renderEntry(): void {
  root.render(
    <div className="flex h-dvh flex-col">
      <EmployeeEntry owner={employeeEntry} connection={entryConnection}>
        <div className="flex min-h-0 flex-1 flex-col">{application}</div>
        {connectionNotice}
      </EmployeeEntry>
    </div>,
  );
}
// 连接与原生命令共用同一稳定 ID。
const webClientId = getV4ClientId();
// 页面加载才生成新标识，同一页面的重连保留云龙快照。
const pageId = createUuid();

interface WebBootstrapResult {
  wsUrl: string;
}

function renderWebEntryConnection(connection: EmployeeEntryConnection): void {
  entryConnection = connection;
  document.title = connection.status === "failed" ? "AIReq · 连接失败" : "AIReq · 正在连接";
  renderEntry();
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

async function bootstrapWebApp(generation: number, employeeNumber: string) {
  const isCurrentEntry = () =>
    generation === entryGeneration && employeeEntry.employeeNumber === employeeNumber;
  if (!isCurrentEntry()) return;
  renderWebEntryConnection({ status: "connecting" });
  let bootstrap: WebBootstrapResult;
  try {
    bootstrap = await resolveWebBootstrap();
  } catch (error) {
    if (isCurrentEntry()) {
      // 原始连接异常可能含内部地址或协议细节；入口只呈现可执行的恢复提示。
      logger.error("[web] Application bootstrap failed", error);
      renderWebEntryConnection({
        status: "failed",
        message: "暂时无法准备工作台连接，请重新连接。",
        retry: () => void bootstrapWebApp(generation, employeeNumber),
      });
    }
    return;
  }
  if (!isCurrentEntry()) return;

  // 修复原因：断线只替换 accessor 并重读，不卸载未发送草稿与业务工作区。
  let currentServices: Awaited<ReturnType<typeof connectViaWebSocket>> | undefined;

  const renderApp = (connected: boolean) => {
    if (!currentServices) return;
    connectionNotice = null;
    application = (
      <AIReqWebApplication
        key={employeeNumber}
        services={currentServices}
        platform={platform}
        clientId={webClientId}
        connected={connected}
        operator={{
          employeeNumber,
          leave: () => employeeEntry.leave(),
        }}
      />
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
  const connectionLifetime = new AbortController();
  const closeActiveSocket = () => {
    activeSocket?.close();
    activeSocket = null;
  };
  stopConnection = () => {
    disposed = true;
    attemptGeneration += 1;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    // 切换工号也可以发生在 open 之前，旧 socket 尚未成为 activeSocket。
    connectionLifetime.abort();
    activeSocket = null;
    window.removeEventListener("online", handleOnline);
  };

  const scheduleReconnect = () => {
    if (disposed || !isCurrentEntry() || reconnectTimer !== null || connecting) {
      return;
    }
    renderApp(false);
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
    if (!currentServices && entryConnection?.status === "failed") {
      renderWebEntryConnection({ status: "connecting" });
    }
    const attempt = ++attemptGeneration;
    let retry = false;
    let attemptClosed = false;
    try {
      const nativeUrl = new URL(bootstrap.wsUrl);
      const token = deploymentToken();
      if (token) nativeUrl.searchParams.set("token", token);
      nativeUrl.searchParams.set("employeeId", employeeNumber);
      nativeUrl.searchParams.set("clientId", webClientId);
      nativeUrl.searchParams.set("pageId", pageId);
      const services = await connectViaWebSocket(nativeUrl.toString(), {
        signal: connectionLifetime.signal,
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
        // 握手完成前关闭也属于连接失败，首次进入应回到入口恢复动作。
        throw new Error("The connection closed before the workbench was ready.");
      }
      closed = false;
      reconnectAttempt = 0;
      currentServices = services;
      entryConnection = null;
      document.title = "AIReq · 需求管理";
      renderApp(true);
      renderEntry();
    } catch (error) {
      if (disposed || attempt !== attemptGeneration || !isCurrentEntry()) return;
      // 本轮失败即撤销关闭事件资格，异步 close 到达时不能再启动第二条恢复路径。
      attemptGeneration += 1;
      closeActiveSocket();
      closed = true;
      if (!currentServices) {
        logger.warn("[web] Initial connection failed", error);
        renderWebEntryConnection({
          status: "failed",
          message: "暂时无法连接工作台。请检查网络后重新连接。",
          retry: () => void connect(),
        });
      } else {
        logger.warn("[web] RPC reconnect failed", error);
        retry = true;
      }
    } finally {
      connecting = false;
      // Bug 原因：connecting 尚为 true 时安排重试会被准入守卫丢弃。
      // 必须先释放本轮连接资格，再安排唯一 timer；旧 attempt 的关闭回调不能污染下一轮。
      if (retry || (attemptClosed && currentServices)) scheduleReconnect();
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

function handleEntryChange() {
  entryGeneration += 1;
  stopConnection?.();
  stopConnection = null;
  application = null;
  connectionNotice = null;
  entryConnection = null;
  const employeeNumber = employeeEntry.employeeNumber;
  if (employeeNumber) {
    void bootstrapWebApp(entryGeneration, employeeNumber);
  } else {
    document.title = "AIReq · 工号入口";
    renderEntry();
  }
}
employeeEntry.subscribe(handleEntryChange);
handleEntryChange();
