import {
  sanitizeTelemetryEventRequest,
  telemetryEventRequestSchema,
  type TelemetryEventRequest,
  type IPlatformService,
} from "@zcode/shared";
import { deploymentAuthHeaders } from "#src/deploymentAccess.js";
import { writeClipboardText } from "#src/platform/writeClipboardText.js";
import { saveBrowserFile } from "#src/platform/saveBrowserFile.js";

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

async function reportBrowserTelemetryEvent(event: TelemetryEventRequest): Promise<void> {
  const payload = sanitizeTelemetryEventRequest(telemetryEventRequestSchema.parse(event));
  const response = await fetch("/api/v1/telemetry/events", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...deploymentAuthHeaders("/api/v1/telemetry/events"),
    },
    redirect: "error",
    body: JSON.stringify(payload),
  });
  // 202 仅表示接收边界已接纳，不代表第三方上传；错误不能被本地派发伪装成成功。
  if (response.status !== 202) throw new Error("遥测事件未被接收，请稍后重试。");
}

export function createWebPlatform(): IPlatformService {
  return {
    saveFile: saveBrowserFile,
    writeClipboardText,
    changeInterfaceZoom: (command) => {
      const root = document.documentElement;
      // 浏览器版没有桌面缩放命令；CSS zoom 同时缩放布局和控件，不能用改字号代替。
      const percent = Math.round((Number(root.style.zoom) || 1) * 100);
      const next = command === "reset" ? 100 : percent + (command === "in" ? 10 : -10);
      const factor = Math.max(50, Math.min(200, next)) / 100;
      root.style.zoom = String(factor);
      // dvh/vw 不随 CSS zoom 缩小；派生尺寸补偿避免放大后 footer 被挤出视口。
      root.style.setProperty("--interface-zoom", String(factor));
    },
    openExternal: openExternalUrl,
    reportTelemetryEvent: (payload) => reportBrowserTelemetryEvent({ kind: "ui", payload }),
    reportArmsCustomEvent: (payload) => reportBrowserTelemetryEvent({ kind: "arms", payload }),
  };
}
