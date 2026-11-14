/**
 * project 模块清单（architecture-governance managed 模块）。
 * 层：adapters（Host 项目服务：目录校验、默认目录与项目组织态）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const projectModule = {
  id: "project",
  requires: ["project-storage", "services", "shared"],
  provides: ["project-service"],
  publicEntrypoints: ["contract.ts"],
} as const;
