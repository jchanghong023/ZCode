import type { ProjectTaskRef, WebProjectService } from "./contract.js";

/** Native conversation preparation reads the owning backend's existing project facts. */
export async function exampleProjectDirectories(service: WebProjectService, task: ProjectTaskRef) {
  const tree = await service.readTree();
  const directories = await service.resolveSessionDirectories(task);
  return { tree, directories };
}
