import type { IProjectService, VirtualProject } from "#src/project/contract.js";
export type { VirtualProject };
export interface ProjectCatalogPort {
  projectService: Pick<IProjectService, "readTree">;
}
export interface ProjectCatalogSnapshot {
  projects: VirtualProject[];
}
