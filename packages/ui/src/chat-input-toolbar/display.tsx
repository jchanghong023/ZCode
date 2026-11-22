import { useMemo } from "react";
import {
  zcodeProviderRuntimeHeadersErrorCode,
  type ZCodeApiRetryStatus,
  type ZCodeConfigOption,
  type ZCodeConfigSelectValue,
  type ZCodeProvider,
} from "@zcode/shared";
import type { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  HandIcon,
  NotepadText,
  ShieldAlertIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { ZCODE_MODE_OPTION_DESCRIPTION_IDS, ZCODE_MODE_OPTION_LABEL_IDS } from "./display-help.js";

export { ChatContextUsage } from "@/chat-input-toolbar/contextUsage.js";

const HIGH_PERMISSION_MODE_VALUES = new Set([
  "bypassPermissions",
  "full-access",
  // Bugfix: Agent 0.0.44 将旧 full-access mode id 改为 agent-full-access。
  // 高权限视觉提示必须跟随协议 id，否则用户选中全权限后工具栏不再显示 warning 状态。
  "agent-full-access",
  "yolo",
]);

export function ChatApiRetryStatus({
  apiRetry,
  intl,
  locale,
}: {
  apiRetry: ZCodeApiRetryStatus | null;
  intl: ReturnType<typeof useZCodeIntl>["intl"];
  locale: string;
}) {
  const retryLabel = useMemo(() => {
    if (!apiRetry) {
      return null;
    }

    // 当前 ZCode Agent 只会推送某一刻的 retryDelayMs 快照，不会每秒递减。
    // 继续把这个值渲染成“X 秒后继续”会给用户造成倒计时在卡住的错觉。
    // 这里先收敛成稳定的重试状态文案，只展示第几次重试。
    const formatter = new Intl.NumberFormat(locale);
    return intl.formatMessage(
      {
        id:
          apiRetry.error === zcodeProviderRuntimeHeadersErrorCode.configNetwork
            ? "chat.configReadRetryStatus"
            : "chat.apiRetryStatus",
      },
      {
        attempt: formatter.format(apiRetry.attempt),
        maxRetries: formatter.format(apiRetry.maxRetries),
      },
    );
  }, [apiRetry, intl, locale]);

  if (!apiRetry || !retryLabel) {
    return null;
  }

  const retryTitle =
    apiRetry.errorStatus == null ? retryLabel : `${retryLabel} · HTTP ${apiRetry.errorStatus}`;

  return (
    <span
      className="inline-flex h-7 items-center whitespace-nowrap px-1 text-ui-base"
      title={retryTitle}
    >
      {/* 样式修复原因：Retry 需要保留 ToolCall/Thinking 的字号、扫光节奏和低透明度移动低谷，
      但作为次级运行状态不应使用同等的纯黑/纯白峰值；这里只将峰值降到 secondary 文本色。 */}
      <span className="animated-gradient-text animated-gradient-text-subtle font-medium">
        {retryLabel}
      </span>
    </span>
  );
}

export function getModeOptionDisplayLabel(
  intl: ReturnType<typeof useZCodeIntl>["intl"],
  provider: ZCodeProvider | undefined,
  entry: Pick<ZCodeConfigSelectValue, "name" | "value">,
): string {
  const labelMessageId = getModeOptionLabelMessageId(provider, entry);
  if (!labelMessageId) {
    return entry.name;
  }

  return intl.formatMessage({ id: labelMessageId });
}

export function getModeOptionLabelMessageId(
  provider: ZCodeProvider | undefined,
  entry: Pick<ZCodeConfigSelectValue, "value">,
): string | null {
  if (!provider) {
    return null;
  }

  return ZCODE_MODE_OPTION_LABEL_IDS[provider]?.[entry.value] ?? null;
}

export function getModeOptionDescriptionMessageId(
  provider: ZCodeProvider | undefined,
  entry: Pick<ZCodeConfigSelectValue, "value">,
): string | null {
  if (!provider) {
    return null;
  }

  return ZCODE_MODE_OPTION_DESCRIPTION_IDS[provider]?.[entry.value] ?? null;
}

export function getConfigOptionEntryLabel(
  intl: ReturnType<typeof useZCodeIntl>["intl"],
  provider: ZCodeProvider | undefined,
  option: ZCodeConfigOption,
  entry: ZCodeConfigSelectValue,
): string {
  if (option.category === "mode") {
    return getModeOptionDisplayLabel(intl, provider, entry);
  }

  return entry.name;
}

export function isHighPermissionModeValue(value: unknown): boolean {
  return typeof value === "string" && HIGH_PERMISSION_MODE_VALUES.has(value);
}

export function resolveModeOptionIcon(value: unknown): LucideIcon {
  if (isHighPermissionModeValue(value)) {
    return ShieldAlertIcon;
  }

  // Bugfix: build 会被本地化成“默认模式”，和 default 一样应使用常规确认图标。
  if (typeof value === "string" && /^(default|build)$/i.test(value)) return HandIcon;
  if (typeof value === "string" && value.toLocaleLowerCase() === "plan") return NotepadText;

  if (
    typeof value === "string" &&
    /^(auto|acceptEdits|agent|autoEdit|dontAsk|edit|guarded)$/i.test(value)
  ) {
    return ShieldCheckIcon;
  }

  return HandIcon;
}
