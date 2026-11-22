import { createServiceLogger } from "@zcode/services/logger";
const logger = createServiceLogger("aireq-errors");

/** 只用于已确认可向用户展示的领域规则失败；未知异常不得转换成该类型。 */
export function businessRule(message: string): Error & {
  code: "BUSINESS_RULE_VIOLATION";
  publicMessage: true;
} {
  return Object.assign(new Error(message), {
    code: "BUSINESS_RULE_VIOLATION" as const,
    publicMessage: true as const,
  });
}

/** 已接纳业务结果中的失败也必须脱敏；未知异常只写服务端日志。 */
export function businessFailureMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试。",
): string {
  if (
    error instanceof Error &&
    "publicMessage" in error &&
    error.publicMessage === true &&
    "code" in error &&
    error.code === "BUSINESS_RULE_VIOLATION"
  )
    return error.message;
  logger.error(undefined, "Unexpected business operation failure", {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
  });
  return fallback;
}
