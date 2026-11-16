import type { IProjectService, ProjectTaskRef } from "./contract.js";

/** Native conversation preparation reads the owning backend's existing project facts. */
export async function exampleProjectDirectories(service: IProjectService, task: ProjectTaskRef) {
  const tree = await service.readTree({ includeDeleted: false });
  const directories = await service.resolveSessionDirectories(task);
  return { tree, directories };
}
