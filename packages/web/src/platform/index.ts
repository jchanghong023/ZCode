import {
  resolveLocaleFromLanguageTag,
  toZhOrEnLocale,
  type IPlatformService,
  type TaskNotificationPayload,
} from "@zcode/shared";
import { playTaskNotificationSound } from "@zcode/ui";
import { resolveWebCommunityUrl, resolveWebHelpConfig } from "#src/communityUrl.js";
import { saveBrowserFile } from "#src/platform/saveBrowserFile.js";

async function resolveFeedbackUrl(): Promise<string | undefined> {
  return (await resolveWebHelpConfig()).feedback_url;
}

/** 浏览器通知的点击监听；平台实例持有唯一一份，避免每次弹通知重新绑定。 */
const taskNotificationClickHandlers = new Set<(taskId: string) => void>();
type BrowserExtensionNotificationClick = { pluginId: string; viewId?: string };
const extensionNotificationClickHandlers = new Set<
  (click: BrowserExtensionNotificationClick) => void
>();

const EXTENSION_NOTIFICATION_MIN_INTERVAL_MS = 60_000;
const EXTENSION_NOTIFICATION_DAILY_LIMIT = 20;
const extensionNotificationTimes = new Map<string, number[]>();

function canUseBrowserNotification(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.Notification !== "undefined" &&
    window.Notification.permission === "granted"
  );
}

function openExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return;
  }
  // 只允许可安全交给系统浏览器的新页面；javascript:/data: 等伪协议必须拒绝。
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return;
  }
  window.open(parsed.href, "_blank", "noopener,noreferrer");
}

function showBrowserNotification(input: {
  title: string;
  body: string;
  onClick?: () => void;
}): boolean {
  if (!canUseBrowserNotification()) {
    return false;
  }
  try {
    const notification = new window.Notification(input.title, {
      body: input.body,
      silent: true,
    });
    if (input.onClick) {
      notification.onclick = () => {
        window.focus();
        notification.close();
        input.onClick?.();
      };
    }
    return true;
  } catch {
    // 浏览器拒绝构造通知时按未展示处理，调用方据此返回 unsupported。
    return false;
  }
}

/** 扩展通知限额由宿主执行（每插件 60s 1 条、每日 20 条）；浏览器端口只保留内存计数。 */
function consumeExtensionNotificationQuota(pluginId: string, now: number): boolean {
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const recent = (extensionNotificationTimes.get(pluginId) ?? []).filter(
    (timestamp) => timestamp >= dayStart,
  );
  if (recent.length >= EXTENSION_NOTIFICATION_DAILY_LIMIT) {
    extensionNotificationTimes.set(pluginId, recent);
    return false;
  }
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < EXTENSION_NOTIFICATION_MIN_INTERVAL_MS) {
    extensionNotificationTimes.set(pluginId, recent);
    return false;
  }
  recent.push(now);
  extensionNotificationTimes.set(pluginId, recent);
  return true;
}

function emitBrowserTelemetryEvent(kind: "ui" | "arms", payload: unknown): void {
  // 模拟后端没有遥测接收端。浏览器端口不冒充服务端上报，只把清洗后的副本交给本机订阅方
  // （例如开发者控制台或未来接线的本地诊断），调用方语义保持 fire-and-forget。
  window.dispatchEvent(new CustomEvent("zcode:telemetry", { detail: { kind, payload } }));
}

export function createWebPlatform(): IPlatformService {
  return {
    saveFile: saveBrowserFile,
    openExternal: openExternalUrl,
    openFeedback: async () => {
      const feedbackUrl = await resolveFeedbackUrl();
      if (!feedbackUrl) {
        return;
      }
      openExternalUrl(feedbackUrl);
    },
    openCommunity: async () => {
      // openCommunity() 不带参数；ZCodeIntlProvider 会把当前界面语言同步到 <html lang>，
      // 这里按界面语言解析，再收敛成中/英（社群链接只配了中英）。
      const locale = toZhOrEnLocale(resolveLocaleFromLanguageTag(document.documentElement.lang));
      const communityUrl = await resolveWebCommunityUrl(locale);
      if (!communityUrl) {
        return;
      }
      openExternalUrl(communityUrl);
    },
    canOpenCommunity: async (locale) => {
      const communityUrl = await resolveWebCommunityUrl(locale);
      return typeof communityUrl === "string" && communityUrl.length > 0;
    },
    showTaskNotification: (payload: TaskNotificationPayload) => {
      if (document.hasFocus()) {
        return;
      }
      if (
        showBrowserNotification({
          title: payload.title,
          body: payload.body,
          onClick: () => {
            for (const handler of taskNotificationClickHandlers) {
              handler(payload.taskId);
            }
          },
        })
      ) {
        void playTaskNotificationSound();
      }
    },
    onTaskNotificationClick: (handler) => {
      taskNotificationClickHandlers.add(handler);
      return () => {
        taskNotificationClickHandlers.delete(handler);
      };
    },
    showExtensionNotification: async (payload) => {
      if (document.hasFocus()) {
        return { shown: false, reason: "focused" };
      }
      if (!consumeExtensionNotificationQuota(payload.pluginId, Date.now())) {
        return { shown: false, reason: "rate-limited" };
      }
      const shown = showBrowserNotification({
        title: payload.title,
        body: payload.body,
        onClick: () => {
          for (const handler of extensionNotificationClickHandlers) {
            handler({ pluginId: payload.pluginId, viewId: payload.viewId });
          }
        },
      });
      return shown ? { shown: true } : { shown: false, reason: "unsupported" };
    },
    onExtensionNotificationClick: (handler) => {
      extensionNotificationClickHandlers.add(handler);
      return () => {
        extensionNotificationClickHandlers.delete(handler);
      };
    },
    reportTelemetryEvent: async (payload) => {
      emitBrowserTelemetryEvent("ui", payload);
    },
    reportArmsCustomEvent: async (payload) => {
      emitBrowserTelemetryEvent("arms", payload);
    },
    getDeviceId: () => {
      const nav = globalThis.navigator as Navigator & { platform?: string };
      const platform = nav?.platform ?? "";
      const screenWidth = globalThis.screen?.width;
      const screenHeight = globalThis.screen?.height;
      const colorDepth = globalThis.screen?.colorDepth;
      const parts = [
        platform,
        screenWidth !== undefined ? String(screenWidth) : "",
        screenHeight !== undefined ? String(screenHeight) : "",
        colorDepth !== undefined ? String(colorDepth) : "",
      ];
      return parts.filter(Boolean).join("|");
    },
  };
}
