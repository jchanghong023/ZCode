import type { ProjectCatalogPort, ProjectCatalogSnapshot } from "#src/project-catalog/contract.js";
export type { ProjectCatalogPort, ProjectCatalogSnapshot } from "#src/project-catalog/contract.js";
export { projectSelectionId } from "#src/project-catalog/selection-id.js";

export async function readProjectCatalog(
  port: ProjectCatalogPort,
): Promise<ProjectCatalogSnapshot> {
  // 配置目录复用 mention 的安全投影，不另开绕过身份隔离的项目枚举端口。
  const { projects } = await port.projectService.readTree();
  return { projects: projects.filter((project) => !project.deleted) };
}
