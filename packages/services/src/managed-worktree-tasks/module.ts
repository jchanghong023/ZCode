/** Pure presentation DTOs; no managed-worktree service or RPC channel remains. */
export const managedWorktreeTasksModule = {
  id: "managed-worktree-tasks",
  requires: ["shared"],
  provides: ["managed-worktree-presentation"],
  publicEntrypoints: ["contract.ts"],
} as const;
