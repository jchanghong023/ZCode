/**
 * project-storage 模块清单（architecture-governance managed 模块）。
 * 层：adapters（App SQLite 迁移与仓储；调用者持有连接）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const projectStorageModule = {
  id: "project-storage",
  requires: ["shared", "services", "session", "task-groups"],
  provides: ["project-storage"],
  publicEntrypoints: ["repository-contract.ts"],
} as const;
