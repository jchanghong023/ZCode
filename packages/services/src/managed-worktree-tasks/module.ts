/**
 * managed-worktree-tasks 模块清单（architecture-governance managed 模块）。
 * 层：app（受管 worktree 的任务编排；创建记录与删除租约只在内存）。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const managedWorktreeTasksModule = {
  id: "managed-worktree-tasks",
  requires: ["managed-worktree-shared", "project-storage", "rpc", "services", "shared"],
  provides: ["managed-worktrees"],
  publicEntrypoints: ["contract.ts"],
} as const;
