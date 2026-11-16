/* eslint-disable max-lines -- platform contract 集中声明浏览器本机端口与已裁撤能力的类型事实，保留既有跨端 DTO 不拆分。 */
import type {
  DockerConnectOptions,
  RemoteTarget,
  SSHConnectOptions,
  WSLConnectOptions,
} from "./remoteTarget.js";
import type { PluginSandboxPlatformPort } from "./mcp-apps/contract.js";
import type { Locale } from "./protocol.js";
import type {
  ExtensionNotificationClick,
  ExtensionNotificationPayload,
  NotificationsShowResult,
} from "#src/extension-host/notifications.js";
import type { ArmsCustomEventPayload, RendererTelemetryEventPayload } from "./telemetry.js";
import type { BrowserViewportSize } from "./browser-use/command-metadata.js";
export interface AppNavigationTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}
export type AppNavigationResult =
  | { status: "opened"; uiTarget?: string }
  | { status: "unavailable"; reason?: string; uiTarget?: string };
export type AppNavigationHandler = (
  target: AppNavigationTarget,
  signal: AbortSignal,
) => Promise<AppNavigationResult>;

export interface TaskNotificationPayload {
  taskId: string;
  status: "completed" | "failed" | "permission_request" | "elicitation_request" | "feedback_update";
  requestId?: string;
  title: string;
  body: string;
}

/** Main 将一次能够定位真实 tab 的 browser-use 操作投递给其 origin renderer。 */
export interface BrowserViewOperationPayload {
  workspaceKey: string;
  remoteSessionId?: string;
  sessionId: string;
  tabId: string;
  browserId: string;
  browserGeneration: number;
  /** 当前模型命令会打开、激活或改变 Browser 布局，renderer 应重建 resize observation baseline。 */
  resetsResizeBaseline?: boolean;
}

export type BrowserTabResidencyState =
  | "live-visible"
  | "live-background"
  | "suspend-pending"
  | "suspended"
  | "restoring";

/** 仅用于创建尚未提交首个 navigation entry 的 residency restore guest。 */
export const BROWSER_VIEW_RESTORE_BOOTSTRAP_URL = "zcode-browser-restore://pending";

/** Renderer 上报 tab shell 的展示事实；windowId 必须由 main 绑定可信 IPC sender。 */
export interface BrowserViewResidencyReportPayload {
  tabId: string;
  workspaceKey: string;
  remoteSessionId?: string;
  sessionId: string;
  selected: boolean;
  visible: boolean;
  currentTask: boolean;
  loading: boolean;
  restoreUrl?: string | null;
  title?: string | null;
  faviconUrl?: string | null;
}

export interface BrowserViewResidencyTransitionPayload {
  tabId: string;
  workspaceKey: string;
  remoteSessionId: string | undefined;
  sessionId: string;
  browserId: string;
  browserGeneration: number;
  generation: number;
  residency: Extract<
    BrowserTabResidencyState,
    "live-visible" | "live-background" | "suspended" | "restoring"
  >;
}

export interface BrowserViewCloseTabRequest {
  tabId: string;
  workspaceKey: string;
  remoteSessionId?: string;
  sessionId: string;
}

export const BROWSER_VIEW_DRAFT_SESSION_ID = "unscoped";

export interface BrowserViewPromoteDraftTabsRequest {
  tabIds: string[];
  workspaceKey: string;
  remoteSessionId?: string;
  sessionId: string;
}

export const LOCAL_MEDIA_PREVIEW_SCHEME = "zcode-media";
export const BROWSER_LOCAL_PREVIEW_SCHEME = "zcode-html";

/** 仅还原展示/外部打开地址；目录授权和签名校验始终由 main 执行。 */
export function browserPreviewSourceUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.protocol !== `${BROWSER_LOCAL_PREVIEW_SCHEME}:`) return input;
    const [, directory, ...segments] = url.pathname.split("/");
    const root = new URL(decodeURIComponent(directory ?? ""));
    if (root.protocol !== "file:" || root.host || !root.pathname.endsWith("/")) return input;
    const source = new URL(segments.join("/"), root);
    if (!source.href.startsWith(root.href)) return input;
    source.search = url.search;
    source.hash = url.hash;
    return source.href;
  } catch {
    return input;
  }
}

export function buildLocalMediaPreviewUrl(path: string): string {
  const url = new URL(`${LOCAL_MEDIA_PREVIEW_SCHEME}://local/preview`);
  url.searchParams.set("path", path);
  return url.toString();
}

/**
 * main→renderer 的关闭通知。
 *
 * 旧 payload 只有 tabId，renderer 只能在“当前活跃 workspace”的 side pane 状态里查找；
 * 用户已切到别的 workspace 时通知会被静默丢弃，原 workspace 的持久化状态里留下关不掉的幽灵 tab。
 * 带上 owner scope 后，renderer 可以直接定位到对应 workspace 的 side pane 内存删除该 tab。
 * scope 字段可缺省：recovery-orphan 等内部路径只有 tabId，renderer 此时退回“仅当前 workspace”语义。
 */
export interface BrowserViewCloseTabNotification {
  tabId: string;
  workspaceKey?: string;
  remoteSessionId?: string;
  sessionId?: string;
  reason?: "recovery-orphan";
}

/** 跨重启先恢复 logical shell；renderer 初始不得一次 mount 全部 guest。 */
export interface BrowserViewRestoredTabShell {
  tabId: string;
  workspaceKey: string;
  remoteSessionId?: string;
  sessionId: string;
  browserId: string;
  browserGeneration: number;
  origin: "agent" | "user";
  restoreUrl: string | null;
  title: string | null;
  faviconUrl: string | null;
  openedAt: number;
  lastSelectedAt: number | null;
}

export interface BrowserViewRestoreTabsRequest {
  workspaceKey: string;
  remoteSessionId?: string;
  sessionId?: string;
}

/** Main 将 Agent viewport 变更定向投递给目标 tab 的 origin renderer。 */
export interface BrowserViewViewportChangedPayload extends BrowserViewOperationPayload {
  viewport: BrowserViewportSize | null;
}

// 旧默认预算 1500ms 在慢机器或后台窗口中不足以等待连续稳定帧；main 与 renderer
// 共用这个默认值，并由 prepare payload 传递实际覆盖值，避免两端 deadline 再次漂移。
export const BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS = 3_000;

/** 截图/录制握手对 renderer 预览比例的瞬时要求；缺失时沿用用户当前预览。 */
export type BrowserViewSurfaceScaleMode = "current" | "unscaled";

/** Main 请求 owner renderer 在截图前准备后台 guest 合成表面。 */
export interface BrowserViewScreenshotSurfacePreparePayload extends BrowserViewOperationPayload {
  requestId: string;
  webContentsId: number;
  viewport: BrowserViewportSize;
  /** 自然 viewport 不使用 metrics 的 guest 布局补偿；缺失时保持原仿真行为（含录制）。 */
  viewportMode?: "natural" | "emulated";
  /** `unscaled` 只在 lease 生命周期内强制真实 100% surface，不写回用户的 Fit/固定比例。 */
  surfaceScaleMode?: BrowserViewSurfaceScaleMode;
  /** Main 当前实际使用的 prepare 超时；旧 payload 缺失时 renderer 回退到共享默认值。 */
  timeoutMs?: number;
}

/** Owner renderer 确认目标 guest 的逻辑 viewport 与原生预览 surface 比例均已稳定。 */
export interface BrowserViewScreenshotSurfaceReadyPayload extends BrowserViewScreenshotSurfacePreparePayload {
  surfaceScale: number;
}

/** Main 通知 owner renderer 释放临时后台截图合成表面。 */
export type BrowserViewScreenshotSurfaceReleasePayload = Omit<
  BrowserViewScreenshotSurfacePreparePayload,
  "viewport" | "viewportMode" | "surfaceScaleMode" | "timeoutMs"
>;

export type BrowserGuestAttachRejectReason =
  | "not-found"
  | "destroyed"
  | "not-webview"
  | "closed"
  | "window-mismatch"
  | "workspace-mismatch"
  | "session-mismatch"
  | "remote-session-mismatch"
  | "residency-suspended"
  | "residency-generation-mismatch";

/** Renderer 上报 guest 后 main 返回的绑定结果；拒绝不能再被伪装成无返回的 ready timeout。 */
export type BrowserGuestAttachResult =
  | { ok: true; guestGeneration: number }
  | { ok: false; reason: BrowserGuestAttachRejectReason; recoveryRequested: boolean };

/** 已安装的编辑器/终端信息 */
export interface EditorInfo {
  /** 编辑器标识 (e.g. "vscode", "zed", "terminal") */
  id: string;
  /** 显示名 */
  name: string;
  /** 图标 base64 data URL */
  iconDataUrl: string;
}

/** 系统对当前文件类型注册的应用；id 仅由宿主解析，不能当作命令执行。 */
export interface FileApplicationInfo {
  id: string;
  name: string;
  iconDataUrl?: string;
  isDefault: boolean;
}

export interface FileApplicationTarget {
  path: string;
  pathKind: "file" | "directory";
  workspaceIdentity?: string;
  remoteTarget?: OpenInEditorRemoteTarget;
}

export interface ApplicationIconInfo {
  iconDataUrl: string;
}

export type ApplicationIconLocator =
  | { kind: "darwin-bundle-id"; value: string }
  | { kind: "windows-executable-path"; value: string }
  | { kind: "windows-aumid"; value: string };

export interface ApplicationIconRequest {
  locators: ApplicationIconLocator[];
}

export type OpenInEditorRemoteTarget =
  | Pick<SSHConnectOptions, "kind" | "host" | "port" | "username" | "sshConfigAlias">
  | Pick<WSLConnectOptions, "kind" | "distro" | "user">
  | Pick<DockerConnectOptions, "kind" | "container">;

export interface OpenInEditorOptions {
  remoteTarget?: OpenInEditorRemoteTarget;
  workspaceIdentity?: string;
  pathKind?: "file" | "directory";
}

export interface CreateTempTextAttachmentRequest {
  text: string;
  filename?: string;
}

export interface CreateTempTextAttachmentResult {
  filename: string;
  localPath: string;
  mimeType: "text/plain";
  sizeBytes: number;
}

/**
 * dwf 产物「作为文件打开」：把某一版产物的字节落成宿主本机上的一份副本
 * （docs/dynamic-workflow/authoring.md「How the user sees them」）。
 *
 * ⚠ 术语：artifact = 脚本经 `artifact.*` 发布给用户看的产出，不是引擎的 `RunSettlement.artifact`。
 */
export interface MaterializeWorkflowArtifactFileRequest {
  runId: string;
  artifactId: string;
  /** 这份字节属于哪一版；副本按版本分目录，一版一份。 */
  version: number;
  /** 期望的文件名（含扩展名，扩展名决定系统用哪个 App 打开）；宿主会再清洗一次。 */
  fileName: string;
  bytes: Uint8Array;
}

export interface MaterializeWorkflowArtifactFileResult {
  /** 副本在宿主本机上的绝对路径。 */
  localPath: string;
}

export type SaveFileRequest =
  | {
      data: ArrayBuffer;
      sourceUrl?: never;
      suggestedName: string;
    }
  | {
      data?: never;
      sourceUrl: string;
      suggestedName: string;
    };

export interface SaveFileResult {
  /** 桌面表示已写入文件；Web 仅表示已将下载交给浏览器，不确认最终落盘。 */
  canceled?: boolean;
  error?: string;
  path?: string;
  success: boolean;
}

export interface PrintPageToPdfResult {
  success: boolean;
  /** PDF 字节；success 时存在 */
  data?: ArrayBuffer;
  /** "print_in_progress" | "print_failed" */
  error?: string;
}

/**
 * 系统麦克风权限检查结果（docs/chat/composer-voice-input.md「麦克风权限」）。
 * - granted：可以调用 getUserMedia
 * - denied：系统拒绝，需要用户到系统设置开启
 * - unsupported：系统没有权限接口（Linux），由 getUserMedia 的错误决定
 */
export type MicrophoneAccessResult = "granted" | "denied" | "unsupported";

/**
 * macOS「重新授权」结果（docs/chat/composer-voice-input.md「权限引导浮层」）。
 * - granted：已获得权限
 * - denied：重置后系统弹框中用户仍选择拒绝
 * - restart-required：重置后当前进程仍读到 denied，重启 ZCode 后才会弹框
 * - failed：不能重置（非 macOS、MDM 限制、tccutil 失败），改由系统设置页开启
 */
export type MicrophoneAccessResetResult = "granted" | "denied" | "restart-required" | "failed";

/** privacy：系统麦克风隐私页；sound：系统声音输入设备页 */
export type MicrophoneSettingsTarget = "privacy" | "sound";

/** guest 视口内的裁剪区域，全部是 guest CSS px；视口宽高用于换算实际帧的像素比例。 */
export interface CaptureBrowserGuestPageClip {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface CaptureBrowserGuestPageRequest {
  /** 内置浏览器 `<webview>` 的 guest webContents id（renderer 由 `getWebContentsId()` 取得） */
  webContentsId: number;
  /** 只要视口内某一块（选元素截图）；不传时返回整个可见视口 */
  clip?: CaptureBrowserGuestPageClip;
}

export interface CaptureBrowserGuestPageResult {
  success: boolean;
  /** PNG 字节；success 时存在 */
  data?: ArrayBuffer;
  /** "guest_not_found" | "guest_not_owned" | "capture_in_progress" | "capture_timeout" | "capture_failed" | "clip_out_of_view" */
  error?: string;
}

export function createOpenInEditorRemoteTarget(
  target: RemoteTarget,
): OpenInEditorRemoteTarget | undefined {
  switch (target.kind) {
    case "ssh":
      // openInEditor 只需要构造 VS Code Remote-SSH URI 的连接标识，
      // 不应该把 password/privateKeyPassphrase 等凭据字段继续穿过 renderer/preload/main IPC。
      return {
        kind: "ssh",
        host: target.host,
        port: target.port,
        username: target.username,
        ...(target.sshConfigAlias?.trim() ? { sshConfigAlias: target.sshConfigAlias.trim() } : {}),
      };
    case "wsl": {
      const user = target.user?.trim();
      return {
        kind: "wsl",
        distro: target.distro,
        ...(user ? { user } : {}),
      };
    }
    case "docker":
      return {
        kind: "docker",
        container: target.container,
      };
    case "server":
      return undefined;
  }
}

export interface ZCodeStdioTapDevState {
  enabled: boolean;
  visible: boolean;
  logDir: string;
  statePath: string;
}

export type DesktopTitleBarTheme = "light" | "dark" | "system";

export interface WindowScreenshotResult {
  dataBase64: string;
  filename: string;
  contentType: string;
  size: number;
}

export type ChromeBrowserDataImportError =
  | "chrome_profile_not_found"
  | "chrome_profile_ambiguous"
  | "chrome_executable_not_found"
  | "chrome_cookie_access_denied"
  | "chrome_cookie_elevation_required"
  | "chrome_cookie_elevation_cancelled"
  | "chrome_cookie_helper_verification_failed"
  | "chrome_cookie_app_bound_decryption_failed"
  | "chrome_cookie_protection_unsupported"
  | "chrome_profile_locked"
  | "chrome_local_storage_import_failed"
  | "chrome_import_not_supported"
  | "chrome_browser_data_import_unavailable"
  | "chrome_data_import_failed"
  | "chrome_default_profile_not_found";

export interface ChromeBrowserDataImportOptions {
  /** Windows App-Bound Cookie 只能在本次显式确认后触发 UAC；不得持久化为全局授权。 */
  allowElevatedChromeDecryption?: boolean;
}

/** Chrome 浏览器数据导入只返回数量和状态；Cookie/LocalStorage 值和解密材料不得跨进程。 */
export interface ChromeBrowserDataImportResult {
  success: boolean;
  cookies: {
    imported: number;
    skipped: number;
    failed: number;
  };
  localStorage: {
    originsImported: number;
    entriesImported: number;
    originsSkipped: number;
    originsFailed: number;
    error?: ChromeBrowserDataImportError;
  };
  /** 部分成功时保留可操作问题；不得包含 Profile 绝对路径或站点数据。 */
  issues?: ChromeBrowserDataImportError[];
  error?: ChromeBrowserDataImportError;
}

export interface EmbeddedBrowserDataClearResult {
  success: boolean;
  error?: string;
}

export interface WindowControlsOverlayMetrics {
  leftPaddingPx?: number;
  rightPaddingPx?: number;
  titleBarHeightPx?: number;
}

export interface WindowControlsOverlayReadyPayload {
  zoomLevel: number;
  metrics: WindowControlsOverlayMetrics;
}

export interface DesktopZoomState {
  zoomLevel: number;
}

/**
 * 桌面端"关闭驻留托盘"能力（spec：docs/desktop/linux-close-to-tray.md）。
 * Linux 上取决于 session DBus 是否有 StatusNotifierWatcher（KDE/XFCE 原生有，
 * GNOME 需 AppIndicator 扩展）；Windows 固定 supported=true；macOS/Web 不查询。
 */
export interface DesktopCloseToTrayCapability {
  /** 关闭驻留托盘是否可用 */
  supported: boolean;
  /** 是否为 GNOME 系桌面且无托盘；设置页据此追加"安装 AppIndicator 扩展"提示 */
  gnomeLikeWithoutTray: boolean;
}

export interface DesktopWindowChromeState {
  isMaximized: boolean;
  /** 本机 macOS 主版本；非 macOS 或无法解析时为 null。 */
  macOSMajorVersion?: number | null;
  supportsNativeRoundedCorners: boolean;
}

export interface RemoteServiceSession {
  sessionId: string;
}

export interface RemoteSessionClosedEvent {
  sessionId: string;
  reason: "host-exit";
  exitCode: number | null;
  signal: string | null;
  error?: string;
  /** true = Source transport 仍在自动恢复预算内，UI 不得做终态失败收口。 */
  recoverable?: boolean;
  recoveryAttempt?: number;
  recoveryLimit?: number;
  recoveryBudgetExhausted?: boolean;
  reasonCode?: string;
  retryable?: boolean;
}

export interface RemoteSessionReconnectedEvent {
  previousSessionId: string;
  sessionId: string;
  workspacePath: string;
  workspaceIdentity: string;
}

export interface EmbeddedBrowserOpenUrlRequest {
  url: string;
  disposition: "default" | "foreground-tab" | "background-tab" | "new-window" | "other";
  /** 触发 popup 的 browser-use tab 归属；旧版事件缺失时由 renderer 按当前 scope 兼容处理。 */
  workspaceKey?: string;
  remoteSessionId?: string;
  sessionId?: string;
  browserId?: string;
  browserGeneration?: number;
  sourceTabId?: string;
}

export interface EmbeddedBrowserPermissionDeviceOption {
  deviceId: string;
  name?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
}

export interface EmbeddedBrowserPermissionScreenOption {
  sourceId: string;
  name: string;
  /** 源类型：整个屏幕 / 窗口，由 main 按 desktopCapturer source id 前缀判定。 */
  kind: "screen" | "window";
  thumbnailDataUrl?: string;
}

/** Main → Renderer 的内置浏览器权限弹窗请求；kind 决定 renderer 渲染哪类弹窗。 */
export type EmbeddedBrowserPermissionPromptEvent =
  | {
      requestId: string;
      kind: "permission";
      origin: string;
      permission: string;
      mediaTypes?: string[];
      /** 发起请求的 guest webContents id；renderer 据此只在归属 tab 渲染，
       *  避免后台 tab 的请求显示在当前 tab 造成误批准。 */
      guestWebContentsId?: number;
    }
  | {
      requestId: string;
      kind: "screen-share";
      origin: string;
      screens: EmbeddedBrowserPermissionScreenOption[];
      /** 屏幕共享无 tab 锚定语义，恒缺省（兜底渲染）。 */
      guestWebContentsId?: number;
    }
  | {
      requestId: string;
      kind: "device";
      origin: string;
      /** select-hid-device / select-usb-device / select-serial-port / select-bluetooth-device */
      permission: string;
      devices: EmbeddedBrowserPermissionDeviceOption[];
      /** 发起请求的 guest webContents id（serial/蓝牙可取到；hid/usb 受 frame 限制
       *  缺省，renderer 兜底渲染）。 */
      guestWebContentsId?: number;
    };

export type EmbeddedBrowserPermissionResolution =
  | { action: "allow-always" }
  | { action: "allow-session" }
  | { action: "block-always" }
  | { action: "dismiss" }
  | { action: "share-screen"; sourceId: string }
  | { action: "select-device"; deviceId: string }
  | { action: "cancel" };

export interface EmbeddedBrowserPermissionResolveRequest {
  requestId: string;
  resolution: EmbeddedBrowserPermissionResolution;
}

export type EmbeddedBrowserSitePermissionsSnapshot = Record<
  string,
  Record<string, "allow" | "deny">
>;

export interface EmbeddedBrowserSitePermissionUpdateRequest {
  origin: string;
  permission: string;
  /** "ask" 表示删除该条记录，回到每次询问。 */
  state: "allow" | "deny" | "ask";
}

export interface EmbeddedBrowserSitePermissionResetRequest {
  origin: string;
}

export interface BindRemoteWorkspaceSessionContextRequest {
  remoteSessionId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  workspacePurpose?: import("./workspacePurpose.js").WorkspacePurpose;
}

export interface BindRemoteWorkspaceSessionContextResult {
  sourceServerId?: string;
  remoteSessionId: string;
  workspacePath: string;
  workspaceIdentity: string;
  workspacePurpose?: import("./workspacePurpose.js").WorkspacePurpose;
  /** Desktop 专用的 tab 原地换代提示；不是任务路由身份，手机 replayable 客户端忽略。 */
  previousWorkspaceIdentity?: string;
}

export type BindRemoteWorkspaceSessionContextIpcResult =
  | { success: true; result: BindRemoteWorkspaceSessionContextResult }
  | {
      success: false;
      error: string;
      reasonCode?: string;
      retryable?: boolean;
    };

/**
 * 把 bind IPC 的结构化结果还原成成功结果，或带 code/retryable 的 Error。
 * Bug 原因：preload 抛出的 Error 跨 contextBridge 会丢失自定义属性，renderer 只剩 message；
 * 必须由 preload 原样返回结构化结果，在 renderer 一侧调用本函数。
 */
export function unwrapRemoteWorkspaceBindResult(
  result: BindRemoteWorkspaceSessionContextIpcResult,
): BindRemoteWorkspaceSessionContextResult {
  if (result.success) return result.result;
  const error = new Error(result.error) as Error & { code?: string; retryable?: boolean };
  if (result.reasonCode) error.code = result.reasonCode;
  if (result.retryable !== undefined) error.retryable = result.retryable;
  throw error;
}

export const DesktopCommandIds = {
  NewTask: "newTask",
  OpenWorkspace: "openWorkspace",
  CloseActiveContext: "closeActiveContext",
  CloseWindow: "closeWindow",
  MinimizeWindow: "minimizeWindow",
  ToggleMaximizeWindow: "toggleMaximizeWindow",
  ToggleFullScreen: "toggleFullScreen",
  ResetWindowSize: "resetWindowSize",
  ResetZoom: "resetZoom",
  ZoomIn: "zoomIn",
  ZoomOut: "zoomOut",
  ShowAbout: "showAbout",
  OpenChangelog: "openChangelog",
  CheckForUpdates: "checkForUpdates",
  RelaunchApp: "relaunchApp",
  OpenFeedback: "openFeedback",
  OpenCommunity: "openCommunity",
  ExportLogs: "exportLogs",
  PullMobileLogs: "pullMobileLogs",
  ToggleDevTools: "toggleDevTools",
  OpenResourceManager: "openResourceManager",
  ToggleZCodeStdioTapDevProxy: "toggleZCodeStdioTapDevProxy",
  SetZCodeEndpointProduction: "setZCodeEndpointProduction",
  SetZCodeEndpointTest: "setZCodeEndpointTest",
  SetZCodeEndpointCustom: "setZCodeEndpointCustom",
  ResetZCodeEndpoint: "resetZCodeEndpoint",
  ClearAllData: "clearAllData",
  ClearCodingPlanWebviewStorage: "clearCodingPlanWebviewStorage",
  GetCuaOsSupport: "getCuaOsSupport",
} as const;

export type DesktopCommandId = (typeof DesktopCommandIds)[keyof typeof DesktopCommandIds];

/**
 * CUA Helper 的操作系统支持态（macOS 版本门槛判定结果，主进程经
 * GetCuaOsSupport 下发给 renderer）。
 * - supported：满足门槛（含非版本因素，如解析失败时按宽松处理）。
 * - macos-below-minimum：macOS 低于承诺地板（Helper LSMinimumSystemVersion 12.0），
 *   低版本上 Helper 会被 LaunchServices -10825 拒启，表象是授权反复无响应。
 * - not-applicable：非 darwin 平台，无 macOS 版本门槛概念。
 */
export type CuaOsSupport =
  | { kind: "supported" }
  | { kind: "macos-below-minimum"; minimumMacOs: string; currentMacOs: string }
  | { kind: "not-applicable" };

/**
 * 平台操作接口 —— 替代直接访问 window.zcode
 *
 * 定义浏览器下载、外链、通知等本机交互，由 Web 入口提供实现。
 * 工作区文件、MCP、Git 等业务能力通过 IServiceAccessor 的 RPC 通道访问，
 * 不在这里模拟桌面进程、原生对话框或窗口管理。
 */
export interface IPlatformService {
  /**
   * 插件 UI 沙箱平台端口。浏览器不具备隔离沙箱宿主，故 Web 端省略；
   * plugin-ui 据此回退到普通 MCP 工具卡片。
   */
  pluginSandbox?: PluginSandboxPlatformPort;

  /** 浏览器下载端口：把字节或同源/HTTP(S)/data/blob URL 交给当前浏览器下载器。 */
  saveFile(payload: SaveFileRequest): Promise<SaveFileResult>;

  /** 用户触发的文本复制；支持 HTTP IP，复制被拒绝时 reject，不报告虚假成功。 */
  writeClipboardText(text: string): Promise<void>;

  /** 应用内整页缩放：每步 10%，范围 50%–200%；reset 恢复 100%，不修改根字号。 */
  changeInterfaceZoom(command: "in" | "out" | "reset"): void;

  /** 用系统浏览器新标签打开外部 URL；Web 端只允许 http/https。 */
  openExternal(url: string): void;

  /** 打开反馈入口，由平台自行解析最终地址。 */
  openFeedback(): Promise<void>;

  /** 打开用户社群入口，由平台自行解析当前语言对应渠道。 */
  openCommunity(): Promise<void>;

  /** 查询当前语言下是否存在可用的用户社群入口。 */
  canOpenCommunity(locale: Locale): Promise<boolean>;

  /** 触发任务状态对应的浏览器通知；用户未授权时由平台自行忽略。 */
  showTaskNotification(payload: TaskNotificationPayload): void;

  /** 用户点击任务通知后回调要打开的任务；由浏览器通知实现绑定点击。 */
  onTaskNotificationClick(handler: (taskId: string) => void): () => void;

  /**
   * 扩展系统通知（docs/plugins/extension-host.md §18.1 H8）：宿主判断窗口焦点与平台支持后弹出，
   * 返回是否弹出与原因。Web 端由浏览器 Notification API 实现。
   */
  showExtensionNotification?(
    payload: ExtensionNotificationPayload,
  ): Promise<NotificationsShowResult>;

  /** 用户点了扩展通知：浏览器聚焦窗口后回调，带要打开的视图。返回 disposer。 */
  onExtensionNotificationClick?(handler: (click: ExtensionNotificationClick) => void): () => void;

  /** 上报 UI 遥测并等待接收端接纳；失败 reject，仅表示接收，不承诺外部送达或持久化。 */
  reportTelemetryEvent(payload: RendererTelemetryEventPayload): Promise<void>;

  /** 上报 ARMS 自定义事件并等待接收端接纳；失败 reject，不等同于第三方上传成功。 */
  reportArmsCustomEvent(payload: ArmsCustomEventPayload): Promise<void>;

  /** 获取当前浏览器实例的稳定标识符（物理属性指纹，抗语言/时区变化）。 */
  getDeviceId(): string;
}
