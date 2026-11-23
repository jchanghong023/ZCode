import { fileVersions, type AIReqMaterialView } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { projectSystemRequirement } from "./workflow-queries.js";
import type { NativeDocumentOutput, RequirementGroup, WorkflowState } from "./workflow-state.js";

export function requirementMaterialsFor(state: WorkflowState, requirement: RequirementGroup) {
  return state.materials.filter(
    (file) => file.projectId === requirement.projectId && file.irId === requirement.id,
  );
}

export function confirmDocumentVersion(
  state: WorkflowState,
  requirement: RequirementGroup,
  employeeId: string,
  confirmedAt: string,
): boolean {
  const version = requirement.documentVersion;
  if (!version) throw businessRule("当前需求还没有文档版本。");
  if (version.confirmation) return false;
  requirement.documentVersion = {
    number: version.number,
    confirmation: { employeeId, confirmedAt },
    materials: structuredClone(requirementMaterialsFor(state, requirement)),
    srs: state.srs
      .filter((row) => row.projectId === requirement.projectId && row.irId === requirement.id)
      .map(projectSystemRequirement),
  };
  requirement.revision += 1;
  return true;
}

/** 先根据完整文件清单识别实际变更，再写材料及对应的版本事实。 */
export function saveDocumentChanges(
  state: WorkflowState,
  requirement: RequirementGroup,
  output: NativeDocumentOutput,
): boolean {
  const previousMaterials = requirementMaterialsFor(state, requirement);
  const filesByPath = new Map(previousMaterials.map((file) => [file.path, file]));
  for (const path of output.removedPaths ?? []) filesByPath.delete(path);
  for (const file of output.materials) filesByPath.set(file.path, file);
  const nextMaterials = [...filesByPath.values()];
  const digest = fileVersions(nextMaterials);
  if (digest === fileVersions(previousMaterials)) return false;

  const version = requirement.documentVersion;
  if (version && "materials" in version) {
    requirement.documentHistory.push(version);
    requirement.documentVersion = { number: version.number + 1 };
  } else if (!version) {
    requirement.documentVersion = { number: 1 };
  }

  const belongs = ({ projectId, irId }: Pick<AIReqMaterialView, "projectId" | "irId">) =>
    projectId === requirement.projectId && irId === requirement.id;
  state.materials = state.materials.filter((file) => !belongs(file)).concat(nextMaterials);
  if (output.srs) {
    const { srs } = output;
    state.srs = state.srs.filter((row) => !belongs(row)).concat(srs);
    requirement.srIds = srs.map(({ id }) => id);
  }
  requirement.files = nextMaterials.map(({ path, sha256, size }) => ({ path, sha256, size }));
  requirement.revision += 1;
  for (const review of requirement.documentReviews) {
    review.stale =
      review.version !== requirement.documentVersion!.number || digest !== review.materialDigest;
  }
  return true;
}
