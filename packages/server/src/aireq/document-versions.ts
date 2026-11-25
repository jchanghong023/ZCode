import { fileVersions, type AIReqMaterialView } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { production } from "./production-store.js";
import { projectSystemRequirement } from "./workflow-queries.js";
import type { NativeDocumentOutput, RequirementGroup, WorkflowState } from "./workflow-state.js";

export function requirementMaterialsFor(state: WorkflowState, requirement: RequirementGroup) {
  const local = state.materials.filter(
    (file) => file.projectId === requirement.projectId && file.irId === requirement.id,
  );
  const imported = state.importedRequirements?.find(
    (file) => file.projectId === requirement.projectId && file.irId === requirement.id,
  );
  if (!imported) return local;
  // 导入文档与红区自有文件可同名。投影区分路径，不移动、覆盖任一所有者的正文。
  const collision = local.some((file) => file.path === imported.path);
  const importedPath = imported.path.replace(/[^/]+$/, "imports/requirements.md");
  return local.concat(collision ? { ...imported, path: importedPath } : imported);
}

export function confirmationMaterialsFor(state: WorkflowState, requirement: RequirementGroup) {
  const files = requirementMaterialsFor(state, requirement);
  return production?.zone === "yellow"
    ? files.filter(
        (file) => file.path === requirement.documentPath && file.kind === "ir" && !file.srId,
      )
    : files;
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
    materials: structuredClone(confirmationMaterialsFor(state, requirement)),
    srs:
      production?.zone === "yellow"
        ? []
        : state.srs
            .filter((row) => row.projectId === requirement.projectId && row.irId === requirement.id)
            .map(projectSystemRequirement),
  };
  requirement.revision += 1;
  return true;
}

function advanceVersion(requirement: RequirementGroup, digest: string): void {
  const version = requirement.documentVersion;
  if (version && "materials" in version) {
    requirement.documentHistory.push(version);
    requirement.documentVersion = { number: version.number + 1 };
  } else if (!version) {
    requirement.documentVersion = { number: 1 };
  }
  requirement.revision += 1;
  for (const review of requirement.documentReviews) {
    review.stale =
      review.version !== requirement.documentVersion!.number || digest !== review.materialDigest;
  }
}

export function updateImportedRequirement(
  state: WorkflowState,
  requirement: RequirementGroup,
  file: AIReqMaterialView,
): boolean {
  const imports = (state.importedRequirements ??= []);
  const index = imports.findIndex(
    (item) => item.projectId === file.projectId && item.irId === file.irId,
  );
  if (index >= 0) {
    if (imports[index]!.sha256 === file.sha256) return false;
    imports[index] = file;
  } else imports.push(file);
  advanceVersion(requirement, fileVersions(requirementMaterialsFor(state, requirement)));
  return true;
}

/** 先根据完整文件清单识别实际变更，再写材料及对应的版本事实。 */
export function saveDocumentChanges(
  state: WorkflowState,
  requirement: RequirementGroup,
  output: NativeDocumentOutput,
): boolean {
  const belongs = ({ projectId, irId }: Pick<AIReqMaterialView, "projectId" | "irId">) =>
    projectId === requirement.projectId && irId === requirement.id;
  const previousMaterials = state.materials.filter(belongs);
  const filesByPath = new Map(previousMaterials.map((file) => [file.path, file]));
  for (const path of output.removedPaths ?? []) filesByPath.delete(path);
  for (const file of output.materials) filesByPath.set(file.path, file);
  const nextMaterials = [...filesByPath.values()];
  const digest = fileVersions(nextMaterials);
  // SR 标题也属于交付快照，正文未改时不能丢弃一次真实的 SR 变更。
  const previousSrs =
    output.srs &&
    state.srs.filter(
      (row) => row.irId === requirement.id && row.projectId === requirement.projectId,
    );
  if (
    digest === fileVersions(previousMaterials) &&
    JSON.stringify(previousSrs) === JSON.stringify(output.srs)
  )
    return false;

  state.materials = state.materials.filter((file) => !belongs(file)).concat(nextMaterials);
  if (output.srs) {
    const { srs } = output;
    state.srs = state.srs.filter((row) => !belongs(row)).concat(srs);
    requirement.srIds = srs.map(({ id }) => id);
  }
  advanceVersion(requirement, fileVersions(requirementMaterialsFor(state, requirement)));
  return true;
}
