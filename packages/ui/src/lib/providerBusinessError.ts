/** 与 core `model-errors.ts` 中 anomaly guard 文案保持一致。 */
export const SUSPICIOUS_EMPTY_MODEL_RESULT_MESSAGE =
  "Model returned no text, no tool calls, and no usage before completing the turn.";

export {
  resolveRequestVerificationBusinessCode,
  isRequestVerificationTerminalError,
  isRequestVerificationRejectedMessage,
  REQUEST_VERIFICATION_REJECTED_MESSAGE,
} from "@/request-security-edition/errors.js";
/**
 * zcode-plan / Coding Plan 业务错误码与前端处理约定。
 *
 * | 场景           | code | HTTP | 前端处理 |
 * |----------------|------|------|----------|
 * | JWT 缺失/失效  | 1006 | 200  | 跳登录或重新授权 |
 * | 配额不足       | 1005 | 200  | 禁用入口，刷新配额 |
 * | 模型不可用     | 3006 | 400  | 切换到 Built-in Provider 中的其他模型 |
 * | 参数错误       | 3001 | 400  | 检查请求体 |
 * | 安全校验拒绝   | 3007 | 403  | 客户端无法完成安全校验，提示联系支持 |
 * | 模型并发上限   | 3010 | 429  | Start Plan 下走升级横幅 |
 * | 请求过频       | 3002/429 | 429 | 限流提示，稍后重试 |
 * | 闲时票据过期 | 3102 | 400  | 过号或旧版过期，提示手动新建任务 |
 * | 闲时运行超时 | 3106 | 400  | 单次运行时间到顶，提示手动新建任务 |
 * | 上游 HTTP 异常 | 2007 | 500  | 可重试；刷新配额，勿本地扣额度 |
 */
import { isOffPeakTicketExpiredError, OFF_PEAK_TICKET_EXPIRED_MARKER } from "@zcode/shared";

export const PROVIDER_BUSINESS_ERROR_CODES = [
  "1006",
  "1005",
  "3006",
  "3001",
  "3007",
  "3008",
  "3009",
  "3010",
  "3002",
  "3102",
  "3106",
  "2007",
  "429",
] as const;

export type ProviderBusinessErrorCode = (typeof PROVIDER_BUSINESS_ERROR_CODES)[number];

export const PROVIDER_BUSINESS_ERROR_MESSAGE_IDS: Record<ProviderBusinessErrorCode, string> = {
  "1006": "zcode.error.providerBusiness.1006",
  "1005": "zcode.error.providerBusiness.1005",
  "3006": "zcode.error.providerBusiness.3006",
  "3002": "zcode.error.providerBusiness.3002",
  "3001": "zcode.error.providerBusiness.3001",
  "3007": "zcode.error.providerBusiness.3007",
  "3008": "zcode.error.providerBusiness.3008",
  "3009": "zcode.error.providerBusiness.3009",
  "3010": "zcode.error.providerBusiness.3010",
  "3102": "zcode.error.providerBusiness.3102",
  "3106": "zcode.error.providerBusiness.3106",
  "2007": "zcode.error.providerBusiness.2007",
  "429": "zcode.error.providerBusiness.429",
};

export function isProviderBusinessErrorCode(
  code: string | undefined,
): code is ProviderBusinessErrorCode {
  if (!code) {
    return false;
  }
  return (PROVIDER_BUSINESS_ERROR_CODES as readonly string[]).includes(code);
}

export function getProviderBusinessErrorMessageId(code: string | undefined): string | undefined {
  if (code === OFF_PEAK_TICKET_EXPIRED_MARKER) {
    return "zcode.error.offPeakTicketExpired";
  }
  if (!isProviderBusinessErrorCode(code)) {
    return undefined;
  }
  return PROVIDER_BUSINESS_ERROR_MESSAGE_IDS[code];
}

/**
 * 只有明确的 3102 才能提示额度返还；历史标记也包含运行超时，不能当成 3102。
 */
export function resolveOffPeakTicketExpiredBusinessCode(
  code: string | undefined,
  message: string | undefined,
): "3102" | "3106" | typeof OFF_PEAK_TICKET_EXPIRED_MARKER | undefined {
  const normalized = code?.trim();
  if (normalized === "3102" || normalized === "3106") {
    return normalized;
  }
  return isOffPeakTicketExpiredError(message) ? OFF_PEAK_TICKET_EXPIRED_MARKER : undefined;
}

export function isSuspiciousEmptyModelResultMessage(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes(SUSPICIOUS_EMPTY_MODEL_RESULT_MESSAGE) ||
    message.includes("Model returned no text")
  );
}
