/**
 * provider-provisioning-status 模块清单（architecture-governance managed 模块）。
 * 层：app（读取 / 重试 Main 协调器的 Provisioning lane，不缓存）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const providerProvisioningStatusModule = {
  id: "provider-provisioning-status",
  requires: ["services", "shared"],
  provides: ["provider-provisioning-status"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
