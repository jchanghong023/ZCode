import { pluginInstallRequestPayloadSchema } from "./contract.js";
/** 只校验历史协议载荷，不构成安装入口或执行授权。 */
export function readHistoricalInstallPayload(payload: unknown) {
  return pluginInstallRequestPayloadSchema.safeParse(payload);
}
