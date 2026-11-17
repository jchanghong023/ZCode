/**
 * gen-ui-service 模块清单（architecture-governance managed 模块）。
 * 层：只读状态投影契约；不再发布文档、沙箱或写入能力。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const genUiServiceModule = {
  id: "gen-ui-service",
  requires: ["services", "shared", "gen-ui-protocol"],
  provides: ["gen-ui"],
  publicEntrypoints: ["contract.ts"],
} as const;
