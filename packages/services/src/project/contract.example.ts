import type { IProjectService, SaveProjectInput } from "./contract.js";

/**
 * 侧栏新建项目的真实调用序列：保存目录 → 读投影树 → 为首个会话准备目录。
 * 项目组织态的唯一写者是当前 Host；UI 只读 readTree/readProjects 投影，不写 session cwd。
 */
export async function exampleProjectCreate(service: IProjectService, input: SaveProjectInput) {
  const project = await service.saveProject(input);
  const tree = await service.readTree({ includeDeleted: false });
  const directories = await service.prepareSession({
    projectId: project.id,
    hostId: project.hostId,
  });
  return { project, tree, directories };
}
