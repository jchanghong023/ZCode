import { SUPPORTED_AIREQ_DEMOS } from "./scenarios.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AIReqIdentity } from "@zcode/services/aireq";
const requests = new AsyncLocalStorage<AIReqIdentity>();
export function isEmployeeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][0-9]{8}$/.test(value);
}
export function validateAIReqIdentity(value: AIReqIdentity): AIReqIdentity {
  if (!value || !isEmployeeId(value.employeeId))
    throw Object.assign(new Error("请输入有效工号。"), { code: "INVALID_IDENTITY" });
  if (typeof value.clientId !== "string" || !value.clientId.trim() || value.clientId.length > 200)
    throw Object.assign(new Error("客户端身份无效。"), { code: "INVALID_CLIENT" });
  if (
    value.demo !== undefined &&
    (typeof value.demo !== "string" ||
      !(SUPPORTED_AIREQ_DEMOS as readonly string[]).includes(value.demo))
  )
    throw new Error("INVALID_SCENARIO");
  const startupOnly = [
    "analysis-scale",
    "review-chat",
    "proposal-feedback",
    "proposal-intake",
    "requirements-review",
    "empty-projects",
    "empty-releases",
    "empty-requirements",
    "missing-requirement",
    "missing-sr",
  ];
  if (value.demo && startupOnly.includes(value.demo) && process.env.AIREQ_DEMO !== value.demo)
    throw Object.assign(
      new Error("此初始数据样例须通过服务端 AIREQ_DEMO 配置后启动，当前实例不会回退到其他样例。"),
      { code: "INVALID_SCENARIO" },
    );
  return { ...value };
}
export function withAIReqIdentity<T>(identity: AIReqIdentity, operation: () => T): T {
  return requests.run(validateAIReqIdentity(identity), operation);
}
export function getEmployeeId(): string {
  return requests.getStore()?.employeeId ?? "";
}
export function currentIdentity(): AIReqIdentity | undefined {
  return requests.getStore();
}
