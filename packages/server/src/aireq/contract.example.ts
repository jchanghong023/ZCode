import type { MockAIReqOwner } from "./contract.js";
import type { AIReqIdentity, AIReqTestAcceptanceInput } from "@zcode/services/aireq";

/** One read returns scoped workflow objects plus all-project summaries; no mutation is replayed. */
export async function readSharedProject(service: MockAIReqOwner) {
  const identity = { employeeId: "j00808874", clientId: "contract-example" };
  const bootstrap = await service.bootstrap(identity);
  const workflow = await service.call(identity, "readWorkflow", [bootstrap.initialSelection]);
  return {
    workflow,
    projects: workflow.view.projectProgress,
    currentProject: workflow.view.projectProgress?.find(
      (project) => project.projectId === workflow.view.currentProjectId,
    ),
  };
}

/** Actual test action, not a direct percentage write; owner validates merged version/issues. */
export function recordSharedTest(
  service: MockAIReqOwner,
  identity: AIReqIdentity,
  projectId: string,
  irId: string,
  srId: string,
  input: AIReqTestAcceptanceInput,
) {
  return service.call(identity, "progress.recordTest", [projectId, irId, srId, input]);
}

/** Preview has no side effect; a later explicit cleanup must submit its captured revision/list. */
export function previewSharedBranchCleanup(
  service: MockAIReqOwner,
  identity: AIReqIdentity,
  projectId: string,
  irId: string,
) {
  return service.call(identity, "progress.cleanupPreview", [projectId, irId]);
}
