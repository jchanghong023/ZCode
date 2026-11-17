/**
 * task-groups 模块清单（architecture-governance managed 模块）。
 * 层：纯展示 DTO；当前电脑 Web 不装配任务分组 RPC。
 * 修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const taskGroupsModule = {
  id: "task-groups",
  requires: ["shared"],
  provides: ["task-groups"],
  publicEntrypoints: ["contract.ts"],
} as const;
