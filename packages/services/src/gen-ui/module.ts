/**
 * gen-ui-service 模块清单（architecture-governance managed 模块）。
 * 层：domain < app < adapters。执行 Host 读片段，桌面 Host 存 widget 状态。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const genUiServiceModule = {
  id: "gen-ui-service",
  requires: ["services", "shared", "rpc", "gen-ui-protocol", "mcp-apps-protocol"],
  provides: ["gen-ui"],
  publicEntrypoints: ["contract.ts"],
} as const;
