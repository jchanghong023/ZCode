import type { IManagedWorktreeService } from "./contract.js";

/**
 * 侧栏「在新 worktree 新建任务」的真实调用：启动创建后创建记录在后台推进，列表只读 git worktree 事实。
 * 创建记录是唯一数据源，renderer 不推算；worktree 是否可用由服务判断，不由 UI 猜目录。
 */
export async function exampleManagedWorktreeNewTask(
  service: IManagedWorktreeService,
  params: Parameters<IManagedWorktreeService["startNewTask"]>[0],
) {
  const started = await service.startNewTask(params);
  const { groups } = await service.listWorktrees({ projectId: params.projectId });
  return { creationId: started.ok ? started.creationId : null, groups };
}
