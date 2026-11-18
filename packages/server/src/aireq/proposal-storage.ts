import {
  proposalVersion,
  type AIReqMaterialHistory,
  type AIReqMaterialView,
  type AIReqRequirementGroup,
  type AIReqWorkflowView,
} from "@zcode/services/aireq";
import { readPrototypeMaterial } from "./recovery.js";
import { readPrototypeProjectSettings } from "./project-settings.js";

export function capturePrototypeMaterialHistory(
  state: AIReqWorkflowView,
  proposal: AIReqRequirementGroup,
  materials: AIReqMaterialView[],
  reason: string,
): AIReqMaterialHistory {
  return {
    version: proposalVersion(proposal),
    reason,
    changedAt: new Date().toISOString(),
    documentPath: proposal.documentPath,
    proposalRound: proposal.proposalRound ?? 1,
    srs: state.srs
      .filter((row) => row.projectId === proposal.projectId && row.irId === proposal.id)
      .map(({ id, title, documentPath }) => ({ id, title, documentPath })),
    materials: materials.map((item) => ({ ...readPrototypeMaterial(item) })),
    requirementsCheck: structuredClone(proposal.requirementsCheck),
    solutionCheck: structuredClone(proposal.solutionCheck),
  };
}

/** Stable business IDs own their material directories; titles and operators never rename them. */
export function prototypeChangeRoot(srId: string): string {
  return `openspec/changes/${srId}`;
}
export function prototypeIrRoot(irId: string): string {
  return `docs/requirements/${irId}`;
}
export function prototypeSpecPath(_irId: string, srId: string): string {
  return `${prototypeChangeRoot(srId)}/specs/${srId}/spec.md`;
}

// 每个 IR 记录同一 OMP 项目 dir；只返回内存材料路径，不写业务文件。
export function prototypeProposalLocation(projectId: string, employeeId: string) {
  const project = readPrototypeProjectSettings().projects.find((item) => item.id === projectId);
  if (!project) throw new Error("提案所属项目不存在。");
  return { projectName: project.storageName ?? project.name, employeeId, directory: project.root };
}
