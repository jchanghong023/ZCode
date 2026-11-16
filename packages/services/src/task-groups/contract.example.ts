import type { ITaskGroupService, GroupTaskRef } from "./contract.js";

/** Native creation admits its task once without rewriting conversation facts. */
export async function exampleTaskGroupAdmission(service: ITaskGroupService, task: GroupTaskRef) {
  await service.admit({ tasks: [task] });
}
