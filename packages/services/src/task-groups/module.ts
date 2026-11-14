/**
 * task-groups 模块清单（architecture-governance managed 模块）。
 * 层：adapters（tasks-index 分组表；控制端 Host 独占写入）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const taskGroupsModule = {
  id: "task-groups",
  requires: ["services", "session", "shared"],
  provides: ["task-groups"],
  publicEntrypoints: ["contract.ts"],
} as const;
