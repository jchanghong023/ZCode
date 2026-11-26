/**
 * Zustand Store —— 全局状态管理
 *
 * 需要跨窗口同步的状态通过 BroadcastService 广播。
 * 广播频道前缀 "state:" 表示状态同步类消息。
 */
import { create } from "zustand";
import type { WebBroadcastMessage, WebBroadcastService } from "@zcode/services";
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
import type { Theme } from "../useTheme.js";
import { applyTheme, DEFAULT_THEME, isTheme, normalizeThemePreference } from "../useTheme.js";

import {
  INTERFACE_MODE_STORAGE_KEY,
  normalizeInterfaceMode,
  type InterfaceMode,
} from "@/lib/interfaceMode.js";
import { loadPerformanceMode, PERFORMANCE_MODE_STORAGE_KEY } from "@/lib/performanceMode.js";
import { logger } from "@/logger.js";

// v4 重构：类型与默认值下沉到 @/lib/codePreviewSettings.ts，
// 让纯展示组件不依赖 store；这里保留 re-export 兼容既有 import 路径。
export type { CodePreviewSettings } from "@/lib/codePreviewSettings.js";
export { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";

const CODE_PREVIEW_SETTINGS_KEY = "zcode-code-preview-settings";

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

  /** UI 字号 token 的基准值（px），不改变根 rem。 */
  uiFontSizePx: number;
  setUiFontSizePx: (fontSizePx: number) => void;

  /** 是否启用性能模式 */
  performanceMode: boolean;
  setPerformanceMode: (enabled: boolean) => void;

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

const BROADCAST_FIELDS = new Set(["theme", "uiFontSizePx", "interfaceMode"]);

type BroadcastField = "theme" | "uiFontSizePx" | "interfaceMode";

/** 广播频道名前缀 */
const STATE_CHANNEL_PREFIX = "state:";

// ============================================================================
// Store 创建工厂
// ============================================================================

/**
 * 创建 Zustand store；由 Provider 在挂载后连接广播并在卸载时释放。
 *
 * @param broadcastService - 当前 Web 连接的广播服务，由宿主转发给其他连接。
 */
export function createZCodeStore(
  broadcastService: WebBroadcastService,
  options: {
    initialUser?: UserInfo | null;
    initialTheme?: Theme;
  } = {},
) {
  /** 标记：正在应用来自广播的更新，此时不再重复广播（防止循环） */
  let applyingBroadcast = false;
  let localThemeChoice: Theme | null = null;
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
    theme: options.initialTheme ?? DEFAULT_THEME,
    setTheme: (theme: Theme) => {
      const normalizedTheme = normalizeThemePreference(theme);
      if (!applyingBroadcast) {
        localThemeChoice = normalizedTheme;
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
  const receiveBroadcast = (msg: WebBroadcastMessage) => {
    if (!msg.channel.startsWith(STATE_CHANNEL_PREFIX)) return;

    const field = msg.channel.slice(STATE_CHANNEL_PREFIX.length) as BroadcastField;
    if (!BROADCAST_FIELDS.has(field)) return;

    applyingBroadcast = true;
    try {
      const state = useStore.getState();
      if (field === "theme" && isTheme(msg.payload)) {
        const theme = normalizeThemePreference(msg.payload);
        // 当前页面的主动选择优先于会话广播，刷新时随 store 一起重置。
        if (localThemeChoice && localThemeChoice !== theme) return;
        state.setTheme(theme);
      } else if (
        field === "interfaceMode" &&
        (msg.payload === "office" || msg.payload === "coding")
      ) {
        state.setInterfaceMode(normalizeInterfaceMode(msg.payload));
      } else if (field === "uiFontSizePx" && typeof msg.payload === "number") {
        state.setUiFontSizePx(msg.payload);
      }
    } finally {
      applyingBroadcast = false;
    }
  };

  let disconnectBroadcast = () => {};
  const connectBroadcastService = (service: WebBroadcastService) => {
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

  return Object.assign(useStore, { connectBroadcastService });
}

export type ZCodeStore = ReturnType<typeof createZCodeStore>;
