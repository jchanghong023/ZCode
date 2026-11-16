/**
 * data-sync-service 模块清单（architecture-governance managed 模块）。
 * 层：app（分类同步形状；两端注册同一实现，方向由调用方决定）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const dataSyncServiceModule = {
  id: "data-sync-service",
  requires: ["services", "shared"],
  provides: ["data-sync-category"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
