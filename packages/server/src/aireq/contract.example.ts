import type { MockAIReqOwner } from "./contract.js";

/** One read returns scoped workflow objects plus all-project summaries; no mutation is replayed. */
export async function readSharedProject(service: MockAIReqOwner) {
  const identity = { employeeId: "j00808874", clientId: "contract-example" };
  const bootstrap = await service.bootstrap(identity);
  const workflow = await service.call(identity, "readWorkflow", [bootstrap.initialSelection]);
  return {
    workflow,
    projects: workflow.view.projectDocuments,
    currentProject: workflow.view.projectDocuments?.find(
      (project) => project.projectId === workflow.view.currentProjectId,
    ),
  };
}
