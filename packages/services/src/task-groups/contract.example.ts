import type { ITaskGroupService, MoveGroupNode, TaskGroupColor } from "./contract.js";

/**
 * 侧栏把任务拖进新建分组的真实调用：先建组，再以单节点相对位置 move；结构读取本身不写数据。
 * 来源 groupId 用于发现另一客户端已整理，不用可见快照覆盖全库。
 */
export async function exampleTaskGroupOrganize(
  service: ITaskGroupService,
  input: { title: string; color: TaskGroupColor; move: Omit<MoveGroupNode, "groupId"> },
) {
  const group = await service.save({ title: input.title, color: input.color });
  await service.move({ ...input.move, groupId: group.id });
  return service.read();
}
