import { businessRule } from "./errors.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AIReqIdentity } from "@zcode/services/aireq";
const requests = new AsyncLocalStorage<AIReqIdentity>();
export function isEmployeeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][0-9]{8}$/.test(value);
}
export function validateAIReqIdentity(value: AIReqIdentity): AIReqIdentity {
  if (!value || !isEmployeeId(value.employeeId)) throw businessRule("请输入有效工号。");
  if (typeof value.clientId !== "string" || !value.clientId.trim() || value.clientId.length > 200)
    throw businessRule("连接身份无效，请重新进入工作区。");
  // 身份只接受业务标识，旧场景参数不能经RPC偷偷恢复故障注入。
  if (Object.keys(value).some((key) => !["employeeId", "clientId"].includes(key)))
    throw businessRule("连接参数无效，请刷新页面后重试。");
  return { employeeId: value.employeeId, clientId: value.clientId };
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
