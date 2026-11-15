import type { IAIReqService } from "./contract.js";
import type { AIReqIdentity, AIReqSelection } from "./types.js";

/** Reconnect reads facts and all-project progress in one call; it never repeats a mutation. */
export async function readAIReqProject(service: IAIReqService, identity: AIReqIdentity) {
  const bootstrap = await service.bootstrap(identity);
  const workflow = await service.call(identity, "readWorkflow", [bootstrap.initialSelection]);
  return { bootstrap, workflow, projectProgress: workflow.view.projectProgress };
}

export function subscribeAIReqProjection(service: IAIReqService, invalidate: () => void) {
  return service.onDidChange((event) => {
    if (event.type !== "error") invalidate();
  });
}

/** A Release selection only chooses that project's detail, never the other projects' totals. */
export async function readAIReqProjectProgress(
  service: IAIReqService,
  identity: AIReqIdentity,
  selection: AIReqSelection,
  releaseId?: string,
) {
  const workflow = await service.call(identity, "readWorkflow", [selection]);
  const projects = workflow.view.projectProgress;
  const project = projects?.find((item) => item.projectId === workflow.view.currentProjectId);
  const summary = releaseId
    ? project?.releases.find((release) => release.releaseId === releaseId)
    : project?.total;
  return { projects, summary };
}

/** Explicit save only: caller retains the same operation ID/baseline for a retry. No AI starts. */
export function createAIReqProposal(
  service: IAIReqService,
  identity: AIReqIdentity,
  selection: AIReqSelection,
  releaseId: string,
  originalText: string,
  operationId: string,
  expectedRevision: number,
) {
  return service.call(identity, "command", [
    {
      type: "createProposal",
      projectId: selection.projectId,
      releaseId,
      originalText,
      operationId,
      expectedRevision,
    },
    selection,
    expectedRevision,
  ]);
}
