import type { IProjectService, VirtualProject } from "#src/project/contract.js";
export type { VirtualProject };
export interface ProjectCatalogPort {
  projectService: Pick<IProjectService, "readProjects">;
}
export interface ProjectCatalogSnapshot {
  projects: VirtualProject[];
}
