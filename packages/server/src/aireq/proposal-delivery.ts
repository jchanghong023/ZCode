import {
  alignmentBlocker,
  completeProposalPaths,
  proposalDeliveryCurrent,
  proposalDependencyMaterialIssue,
  proposalVersion,
} from "@zcode/services/aireq";
import { contentVersion } from "./content-digest.js";
import { businessRule } from "./errors.js";
import { prototypeMaterialIssue } from "./recovery.js";
import { freezePrototypeRequirement } from "./requirement-freeze.js";
import type { RequirementGroup, WorkflowState } from "./workflow-state.js";

/** 最后一方确认生成候选清单，归档仍需要用户明确提交。 */
export function preparePrototypeProposalCandidate(
  group: RequirementGroup,
  candidate: string,
  employeeId: string,
  confirmedAt: string,
): void {
  if (alignmentBlocker(group) || proposalDeliveryCurrent(group)) return;
  group.proposalDelivery = {
    candidate,
    version: proposalVersion(group),
    files: structuredClone(group.files),
    confirmedBy: employeeId,
    confirmedAt,
  };
}

/** Compare the candidate's exact required set and recompute evidence from the readable body. */
function prototypeProposalMaterialsIssue(
  view: WorkflowState,
  group: RequirementGroup,
): string | undefined {
  const expected = new Set(completeProposalPaths(group));
  const files = group.proposalDelivery!.files;
  if (files.length !== expected.size || files.some((file) => !expected.delete(file.path)))
    return "交付候选的文件清单不完整或包含重复文件。";
  const materials = new Map(
    view.materials
      .filter((item) => item.projectId === group.projectId && item.irId === group.id)
      .map((item) => [item.path, item]),
  );
  for (const file of files) {
    const material = materials.get(file.path);
    if (!material) return `${file.path}：当前材料缺失。`;
    const readIssue = prototypeMaterialIssue(material) ?? material.error;
    if (readIssue) return `${file.path}：${readIssue}`;
    if (!material.valid || !material.content?.trim())
      return `${file.path}：当前材料无效或不可读取。`;
    const actual = contentVersion(material.content);
    if (
      file.sha256 !== actual.sha256 ||
      file.size !== actual.size ||
      file.sha256 !== material.sha256 ||
      file.size !== material.size
    )
      return `${file.path}：材料与交付候选的版本不一致。`;
  }
  return proposalDependencyMaterialIssue(group, view.materials);
}

export function validatePrototypeProposalArchive(
  view: WorkflowState,
  group: RequirementGroup,
  candidate: string,
): void {
  const blocker = alignmentBlocker(group);
  if (blocker) throw businessRule(blocker);
  if (group.proposalDelivery?.candidate !== candidate || !proposalDeliveryCurrent(group))
    throw businessRule("交付候选已失效，请重新查看当前版本的文件清单。");
  const issue = prototypeProposalMaterialsIssue(view, group);
  if (issue) throw businessRule(issue);
}

export function archivePrototypeProposal(
  state: WorkflowState,
  group: RequirementGroup,
  archivedBy: string,
  archivedAt: string,
) {
  group.status = "formal";
  group.archive = { archivedBy, archivedAt, files: structuredClone(group.files) };
  state.drafts = state.drafts.filter(
    (item) => item.id !== group.id || item.projectId !== group.projectId,
  );
  if (!state.groups.some((item) => item.id === group.id && item.projectId === group.projectId))
    state.groups.push(group);
  const revision = group.proposalRevisions?.at(-1);
  if (revision && !revision.completedAt) revision.completedAt = archivedAt;
  freezePrototypeRequirement(group, archivedBy, archivedAt);
}
