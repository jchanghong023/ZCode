/** 工作流工具卡片使用的限流原因标签。 */
const I18N_PREFIX = "chat.toolCall.workflow.run.";

type FormatMessage = (descriptor: { id: string }, values?: Record<string, string>) => string;

/**
 * 限流原因 → 短标签的 i18n 键（reason 是开放字符串，这里只映射已知的几类，其余
 * 归入「瞬态错误」；完全陌生的值原样显示——不认识不等于不显示）。
 */
const REASON_LABEL_KEY: Readonly<Record<string, string>> = {
  rate_limited: "throttle.reason.rateLimited",
  provider_overloaded: "throttle.reason.overloaded",
  offpeak_queued: "throttle.reason.offpeak",
  server_error: "throttle.reason.transient",
  network_error: "throttle.reason.transient",
  timeout: "throttle.reason.transient",
  stream_idle_timeout: "throttle.reason.transient",
  stale_connection: "throttle.reason.transient",
  proxy_error: "throttle.reason.transient",
};

export function throttleReasonLabel(reason: string, formatMessage: FormatMessage): string {
  const key = REASON_LABEL_KEY[reason];
  return key === undefined ? reason : formatMessage({ id: `${I18N_PREFIX}${key}` });
}
