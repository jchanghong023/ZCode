import type { ProjectCatalogPort, ProjectCatalogSnapshot } from "#src/project-catalog/contract.js";
export type { ProjectCatalogPort, ProjectCatalogSnapshot } from "#src/project-catalog/contract.js";
export { projectSelectionId } from "#src/project-catalog/selection-id.js";

export async function readProjectCatalog(
  port: ProjectCatalogPort,
): Promise<ProjectCatalogSnapshot> {
  const projects = await port.projectService.readProjects();
  return { projects: projects.filter((project) => !project.deleted) };
}
