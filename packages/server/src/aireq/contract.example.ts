import type { MockAIReqOwner } from "./contract.js";

/** One read returns scoped workflow objects plus the global Release directory. */
export async function readSharedProject(service: MockAIReqOwner) {
  const identity = { employeeId: "j00808874", clientId: "contract-example" };
  const bootstrap = await service.bootstrap(identity);
  const workflow = await service.call(identity, "readWorkflow", [
    { projectId: bootstrap.initialProjectId },
  ]);
  return {
    workflow,
    projects: workflow.view.projects,
    releases: workflow.view.releases,
    projectReleases: workflow.view.releases.filter(
      (release) => release.projectId === bootstrap.initialProjectId,
    ),
  };
}
