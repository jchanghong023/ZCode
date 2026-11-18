/**
 * Zustand Store —— 全局状态管理
 *
 * 需要跨窗口同步的状态通过 BroadcastService 广播。
 * 广播频道前缀 "state:" 表示状态同步类消息。
 */
import { create } from "zustand";
import type { IBroadcastService, BroadcastMessage } from "@zcode/services";
import type { UserInfo } from "@zcode/shared";
import type { CodePreviewSettings } from "@/lib/codePreviewSettings.js";
import { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";
import { resolveDocumentTheme } from "@/document-highlighting/index.js";
import { readSafeLocalStorage, writeSafeLocalStorage } from "@/lib/browserEnvironment.js";
import {
  applyUiFontSizePx,
  loadUiFontSizePx,
  normalizeUiFontSizePx,
  UI_FONT_SIZE_STORAGE_KEY,
} from "@/lib/uiFontSize.js";
import {
  isTaskNotificationEnabled,
  isTaskNotificationSoundPreferenceEnabled,
  persistTaskNotificationEnabled,
  persistTaskNotificationSoundEnabled,
} from "@/lib/taskNotificationPreferences.js";
import type { Theme } from "../useTheme.js";
import {
  applyTheme,
  DEFAULT_THEME,
  isTheme,
  normalizeThemePreference,
  persistThemePreference,
  readStoredThemePreference,
} from "../useTheme.js";

import {
  INTERFACE_MODE_STORAGE_KEY,
  normalizeInterfaceMode,
  type InterfaceMode,
} from "@/lib/interfaceMode.js";
import { logger } from "@/logger.js";

// v4 重构：类型与默认值下沉到 @/lib/codePreviewSettings.ts，
// 让纯展示组件不依赖 store；这里保留 re-export 兼容既有 import 路径。
export type { CodePreviewSettings } from "@/lib/codePreviewSettings.js";
export { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";

const CODE_PREVIEW_SETTINGS_KEY = "zcode-code-preview-settings";
const FONT_SMOOTHING_STORAGE_KEY = "zcode-macos-font-smoothing";

function applyFontSmoothing(enabled: boolean): void {
  // 仅设置展示标记；CSS 以本机 macOS desktop 为边界，远端设备与 Web 不受影响。
  document.documentElement.classList.toggle("font-smoothing-enabled", enabled);
}

const PERFORMANCE_MODE_STORAGE_KEY = "zcode-performance-mode";
const HIDE_PROJECT_DEVICE_NAMES_STORAGE_KEY = "zcode-hide-project-device-names";
export const FILE_MANAGER_NAVIGATION_PREFERENCES_STORAGE_KEY =
  "zcode-file-manager-navigation-preferences";

function loadFileManagerNavigationPreferences(): Record<string, boolean> {
  try {
    const raw = readSafeLocalStorage(FILE_MANAGER_NAVIGATION_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] =>
          entry[0].trim().length > 0 && typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

function loadCodePreviewSettings(): CodePreviewSettings {
  try {
    const raw = readSafeLocalStorage(CODE_PREVIEW_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_CODE_PREVIEW_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<CodePreviewSettings>;
    return {
      ...DEFAULT_CODE_PREVIEW_SETTINGS,
      ...parsed,
      lightTheme: resolveDocumentTheme(parsed.lightTheme, "light"),
      darkTheme: resolveDocumentTheme(parsed.darkTheme, "dark"),
      fontSizePx:
        typeof parsed.fontSizePx === "number"
          ? Math.min(20, Math.max(12, Math.round(parsed.fontSizePx)))
          : DEFAULT_CODE_PREVIEW_SETTINGS.fontSizePx,
    };
  } catch {
    return DEFAULT_CODE_PREVIEW_SETTINGS;
  }
}

function loadPerformanceMode(): boolean {
  return readSafeLocalStorage(PERFORMANCE_MODE_STORAGE_KEY) === "true";
}

// ============================================================================
// State 定义
// ============================================================================

export interface ZCodeState {
  /** 展示详情偏好，不改变 Agent 权限或执行能力。 */
  interfaceMode: InterfaceMode;
  setInterfaceMode: (mode: InterfaceMode) => void;

  /** 当前主题 */
  theme: Theme;
  setTheme: (theme: Theme) => void;

  /** 代码预览设置 */
  codePreviewSettings: CodePreviewSettings;
  setCodePreviewSettings: (patch: Partial<CodePreviewSettings>) => void;

  /** 各 workspace 的文件导航显隐偏好；缺席时默认展开。 */
  fileManagerNavigationOpenByWorkspace: Record<string, boolean>;
  setFileManagerNavigationOpen: (workspaceKey: string, open: boolean) => void;

  /** 本机 macOS 灰度字体平滑偏好。 */
  fontSmoothingEnabled: boolean;
  setFontSmoothingEnabled: (enabled: boolean) => void;
  /** UI 字号 token 的基准值（px），不改变根 rem。 */
  uiFontSizePx: number;
  setUiFontSizePx: (fontSizePx: number) => void;

  /** 是否启用性能模式 */
  performanceMode: boolean;
  setPerformanceMode: (enabled: boolean) => void;

  /** 仅桌面项目行消费；设备身份和其他入口的显示不受影响。 */
  hideProjectDeviceNames: boolean;
  setHideProjectDeviceNames: (hidden: boolean) => void;

  /** 是否启用任务通知（桌面通知；提示音由子开关控制） */
  notificationEnabled: boolean;
  setNotificationEnabled: (enabled: boolean) => void;

  /** 是否启用任务通知声音（依附于任务通知总开关） */
  notificationSoundEnabled: boolean;
  setNotificationSoundEnabled: (enabled: boolean) => void;

  /** 浏览器 owner 注入的当前操作者只读展示；不广播、不参与共享数据归属。 */
  readonly user: UserInfo | null;
  /** 本 Root 生命周期的模型额度请求代次；工号退出会卸载整个 Root。 */
  authSessionSeq: number;
  apiKeyLoginSuccessSeq: number;
  lastApiKeyLoginModel: string | null;
  markApiKeyLoginSuccess: (preferredModel?: string | null) => void;
}

// ============================================================================
// 需要广播的字段 —— 只有这些字段的变更会发送给其他窗口
// ============================================================================

const BROADCAST_FIELDS = new Set([
  "theme",
  "uiFontSizePx",
  "fontSmoothingEnabled",
  "interfaceMode",
  "notificationEnabled",
  "hideProjectDeviceNames",
]);

type BroadcastField =
  | "theme"
  | "uiFontSizePx"
  | "fontSmoothingEnabled"
  | "interfaceMode"
  | "hideProjectDeviceNames"
  // 任务通知开关跨窗口同步：角标是应用级表面，A 窗口关通知而 B 窗口仍上报未读时，
  // 主进程 max 聚合会让任务栏/托盘继续亮，设置与提醒状态错位。
  | "notificationEnabled";

/** 广播频道名前缀 */
const STATE_CHANNEL_PREFIX = "state:";

// ============================================================================
// Store 创建工厂
// ============================================================================

/**
 * 创建 Zustand store；由 Provider 在挂载后连接广播并在卸载时释放。
 *
 * @param broadcastService - 当前连接的正式广播服务；Desktop／Web 均经各自宿主转发到其他连接。
 */
export function createZCodeStore(
  broadcastService: IBroadcastService,
  options: {
    initialUser?: UserInfo | null;
  } = {},
) {
  /** 标记：正在应用来自广播的更新，此时不再重复广播（防止循环） */
  let applyingBroadcast = false;
  const initialThemePreference = readStoredThemePreference();
  let lastLocalTheme = initialThemePreference;
  let unsavedLocalTheme: Theme | null = null;
  let cleanupSystemThemeListener: (() => void) | null = null;
  let syncSystemThemeListener = (_theme: Theme) => {};

  const useStore = create<ZCodeState>()((set, get) => ({
    interfaceMode: normalizeInterfaceMode(readSafeLocalStorage(INTERFACE_MODE_STORAGE_KEY)),
    setInterfaceMode: (mode) => {
      const interfaceMode = normalizeInterfaceMode(mode);
      if (get().interfaceMode !== interfaceMode) {
        logger.debug("[InterfaceMode] 切换界面模式", {
          interfaceMode,
          source: applyingBroadcast ? "broadcast" : "local",
        });
      }
      writeSafeLocalStorage(INTERFACE_MODE_STORAGE_KEY, interfaceMode);
      set({ interfaceMode });
    },
    theme: initialThemePreference ?? DEFAULT_THEME,
    setTheme: (theme: Theme) => {
      const normalizedTheme = normalizeThemePreference(theme);
      if (!applyingBroadcast) {
        lastLocalTheme = normalizedTheme;
        unsavedLocalTheme = persistThemePreference(normalizedTheme) ? null : normalizedTheme;
      }
      syncSystemThemeListener(normalizedTheme);
      applyTheme(normalizedTheme);

      set({ theme: normalizedTheme });
    },

    codePreviewSettings: loadCodePreviewSettings(),
    setCodePreviewSettings: (patch: Partial<CodePreviewSettings>) =>
      set((state) => {
        const next = {
          ...state.codePreviewSettings,
          ...patch,
          lightTheme: resolveDocumentTheme(
            patch.lightTheme ?? state.codePreviewSettings.lightTheme,
            "light",
          ),
          darkTheme: resolveDocumentTheme(
            patch.darkTheme ?? state.codePreviewSettings.darkTheme,
            "dark",
          ),
          fontSizePx:
            typeof patch.fontSizePx === "number"
              ? Math.min(20, Math.max(12, Math.round(patch.fontSizePx)))
              : state.codePreviewSettings.fontSizePx,
        };
        writeSafeLocalStorage(CODE_PREVIEW_SETTINGS_KEY, JSON.stringify(next));
        return { codePreviewSettings: next };
      }),

    fileManagerNavigationOpenByWorkspace: loadFileManagerNavigationPreferences(),
    setFileManagerNavigationOpen: (workspaceKey, open) => {
      const normalizedWorkspaceKey = workspaceKey.trim();
      if (!normalizedWorkspaceKey) return;
      set((state) => {
        const next = {
          ...state.fileManagerNavigationOpenByWorkspace,
          [normalizedWorkspaceKey]: open,
        };
        writeSafeLocalStorage(
          FILE_MANAGER_NAVIGATION_PREFERENCES_STORAGE_KEY,
          JSON.stringify(next),
        );
        return { fileManagerNavigationOpenByWorkspace: next };
      });
    },

    fontSmoothingEnabled: readSafeLocalStorage(FONT_SMOOTHING_STORAGE_KEY) !== "false",
    setFontSmoothingEnabled: (enabled) => {
      writeSafeLocalStorage(FONT_SMOOTHING_STORAGE_KEY, String(enabled));
      applyFontSmoothing(enabled);
      set({ fontSmoothingEnabled: enabled });
    },

    uiFontSizePx: loadUiFontSizePx(),
    setUiFontSizePx: (fontSizePx: number) => {
      const normalizedFontSizePx = normalizeUiFontSizePx(fontSizePx);
      writeSafeLocalStorage(UI_FONT_SIZE_STORAGE_KEY, String(normalizedFontSizePx));
      applyUiFontSizePx(normalizedFontSizePx);
      set({ uiFontSizePx: normalizedFontSizePx });
    },

    performanceMode: loadPerformanceMode(),
    setPerformanceMode: (enabled: boolean) => {
      writeSafeLocalStorage(PERFORMANCE_MODE_STORAGE_KEY, enabled ? "true" : "false");
      set({ performanceMode: enabled });
    },

    hideProjectDeviceNames: readSafeLocalStorage(HIDE_PROJECT_DEVICE_NAMES_STORAGE_KEY) === "true",
    setHideProjectDeviceNames: (hidden) => {
      writeSafeLocalStorage(HIDE_PROJECT_DEVICE_NAMES_STORAGE_KEY, String(hidden));
      set({ hideProjectDeviceNames: hidden });
    },

    notificationEnabled: isTaskNotificationEnabled(),
    setNotificationEnabled: (enabled: boolean) => {
      persistTaskNotificationEnabled(enabled);
      set({ notificationEnabled: enabled });
    },

    notificationSoundEnabled: isTaskNotificationSoundPreferenceEnabled(),
    setNotificationSoundEnabled: (enabled: boolean) => {
      persistTaskNotificationSoundEnabled(enabled);
      set({ notificationSoundEnabled: enabled });
    },

    user: options.initialUser ?? null,
    authSessionSeq: 1,
    apiKeyLoginSuccessSeq: 0,
    lastApiKeyLoginModel: null,
    markApiKeyLoginSuccess: (preferredModel?: string | null) =>
      set((state) => ({
        apiKeyLoginSuccessSeq: state.apiKeyLoginSuccessSeq + 1,
        lastApiKeyLoginModel: preferredModel?.trim() || null,
      })),
  }));

  syncSystemThemeListener = (theme: Theme) => {
    cleanupSystemThemeListener?.();
    cleanupSystemThemeListener = null;

    if (theme !== "system" || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (useStore.getState().theme !== "system") {
        return;
      }

      // system 模式需要持续订阅系统亮暗变化，不能只在切换到 system 的瞬间应用一次。
      // 否则用户后续切系统主题时，DOM 上的 dark class 不会同步更新，看起来就像“跟随系统失效”。
      applyTheme("system");
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      cleanupSystemThemeListener = () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
      return;
    }

    // 某些 Electron / Chromium 组合仍然只支持旧版 MediaQueryList listener API。
    // 如果这里只调用 addEventListener，system 模式切系统主题时会完全收不到通知。
    mediaQuery.addListener(handleSystemThemeChange);
    cleanupSystemThemeListener = () => {
      mediaQuery.removeListener(handleSystemThemeChange);
    };
  };

  // Zustand v5 的 setState 在 replace=true/false 上使用了不同重载，
  // 之前直接包一层并透传 replace，会在严格类型下落到互不兼容的签名分支。
  // 这里改成订阅状态变化后再广播，只比较真正需要跨窗口同步的字段，逻辑更直观，也避免重载冲突。
  const subscribeStateChanges = () =>
    useStore.subscribe((state, prevState) => {
      if (applyingBroadcast) {
        return;
      }

      for (const field of BROADCAST_FIELDS as Set<BroadcastField>) {
        if (state[field] === prevState[field]) {
          continue;
        }

        // 断线中的本地偏好仍有效；RPC 拒绝必须被消费，不能让主题菜单触发未处理异常。
        void broadcastService
          .send({
            channel: `${STATE_CHANNEL_PREFIX}${field}`,
            payload: state[field],
          })
          .catch((error: unknown) => {
            logger.warn("[Store] 外观广播未发送，保留本地设置", { field, error });
          });
      }
    });

  // 监听来自其他窗口的广播
  const receiveBroadcast = (msg: BroadcastMessage) => {
    if (!msg.channel.startsWith(STATE_CHANNEL_PREFIX)) return;

    const field = msg.channel.slice(STATE_CHANNEL_PREFIX.length) as BroadcastField;
    if (!BROADCAST_FIELDS.has(field)) return;

    applyingBroadcast = true;
    try {
      const state = useStore.getState();
      if (field === "theme" && isTheme(msg.payload)) {
        const theme = normalizeThemePreference(msg.payload);
        // 同一浏览器其他标签页可能刚保存新选择；其他浏览器的会话广播不能覆盖它。
        const preferred = unsavedLocalTheme ?? readStoredThemePreference() ?? lastLocalTheme;
        if (preferred && preferred !== theme) return;
        lastLocalTheme = preferred;
        state.setTheme(theme);
      } else if (
        field === "interfaceMode" &&
        (msg.payload === "office" || msg.payload === "coding")
      ) {
        state.setInterfaceMode(normalizeInterfaceMode(msg.payload));
      } else if (field === "fontSmoothingEnabled" && typeof msg.payload === "boolean") {
        state.setFontSmoothingEnabled(msg.payload);
      } else if (field === "uiFontSizePx" && typeof msg.payload === "number") {
        state.setUiFontSizePx(msg.payload);
      } else if (field === "notificationEnabled" && typeof msg.payload === "boolean") {
        state.setNotificationEnabled(msg.payload);
      } else if (field === "hideProjectDeviceNames" && typeof msg.payload === "boolean") {
        state.setHideProjectDeviceNames(msg.payload);
      }
    } finally {
      applyingBroadcast = false;
    }
  };

  let disconnectBroadcast = () => {};
  const connectBroadcastService = (service: IBroadcastService) => {
    // Web 重连保留 Provider 和 Store；必须释放旧代理的订阅并替换发送目标，不能重置草稿。
    disconnectBroadcast();
    if (service !== broadcastService) {
      broadcastService = service;
    }
    const unsubscribe = subscribeStateChanges();
    const subscription = service.onMessage(receiveBroadcast);
    syncSystemThemeListener(useStore.getState().theme);
    disconnectBroadcast = () => {
      unsubscribe();
      subscription.dispose();
      cleanupSystemThemeListener?.();
      cleanupSystemThemeListener = null;
    };
    return disconnectBroadcast;
  };
  applyTheme(useStore.getState().theme);
  applyUiFontSizePx(useStore.getState().uiFontSizePx);
  applyFontSmoothing(useStore.getState().fontSmoothingEnabled);

  return Object.assign(useStore, { connectBroadcastService });
}

export type ZCodeStore = ReturnType<typeof createZCodeStore>;
