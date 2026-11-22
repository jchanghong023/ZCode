import type { AIReqRemotePath } from "@zcode/services/aireq";
import { argumentSchemas } from "./wire-schemas.js";
import { businessRule } from "./errors.js";

export function validateAIReqRemoteCall(path: unknown, args: unknown): void {
  if (typeof path !== "string" || !Array.isArray(args))
    throw businessRule("操作参数无效，请刷新页面后重试。");
  if (!Object.hasOwn(argumentSchemas, path))
    throw Object.assign(businessRule("此操作不可用，请刷新页面后重试。"), { code: "UNKNOWN_PATH" });
  if (!argumentSchemas[path as AIReqRemotePath].safeParse(args).success)
    throw businessRule("操作参数无效，请检查输入并重试。");
}
