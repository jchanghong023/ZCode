import type { AIReqRemoteCall, AIReqRemotePath } from "@zcode/services/aireq";
import { argumentSchemas, selectionSchema } from "./wire-schemas.js";
import { businessRule } from "./errors.js";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateAIReqRemoteCall(input: unknown): AIReqRemoteCall {
  if (!object(input) || typeof input.path !== "string" || !Array.isArray(input.args))
    throw businessRule("操作参数无效，请刷新页面后重试。");
  if (!Object.hasOwn(argumentSchemas, input.path))
    throw Object.assign(businessRule("此操作不可用，请刷新页面后重试。"), { code: "UNKNOWN_PATH" });
  const path = input.path as AIReqRemotePath;
  if (
    !argumentSchemas[path].safeParse(input.args).success ||
    (input.selection !== undefined && !selectionSchema.safeParse(input.selection).success) ||
    Object.keys(input).some((key) => !["path", "args", "selection"].includes(key))
  )
    throw businessRule("操作参数无效，请检查输入并重试。");
  return input as unknown as AIReqRemoteCall;
}
