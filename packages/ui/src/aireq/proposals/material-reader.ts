import {
  fullReviewReadyBlocker,
  proposalAlignmentCurrent,
  readSrDependencies,
  requirementsReviewBlocker,
  type AIReqMaterialHistory,
  type AIReqMaterialReadRequest,
  type AIReqMaterialView,
  type AIReqRequirementGroup,
} from "../contract.js";

export function readMaterialSelection(
  group:
    | Pick<
        AIReqRequirementGroup,
        "id" | "projectId" | "documentPath" | "materialHistory" | "proposalRound"
      >
    | undefined,
  currentMaterials: readonly AIReqMaterialView[],
  currentRows: NonNullable<AIReqMaterialHistory["srs"]>,
  options: {
    path?: string;
    srId?: string;
    historyIndex?: number;
    preferDesign?: boolean;
  },
) {
  const { historyIndex } = options;
  const viewingHistory = historyIndex !== undefined;
  const historical = viewingHistory ? group?.materialHistory?.[historyIndex] : undefined;
  const materials = (viewingHistory ? (historical?.materials ?? []) : currentMaterials).filter(
    (item) => item.projectId === group?.projectId && item.irId === group?.id,
  );
  const rows = viewingHistory ? historical?.srs : currentRows;
  const proposalRound = viewingHistory ? historical?.proposalRound : (group?.proposalRound ?? 1);
  const design = materials.find((item) => item.path.endsWith("/design.md"));
  const selected = materials.find((item) => item.path === options.path);
  let material = selected;
  if (!material) {
    for (const path of [
      rows?.find((item) => item.id === options.srId)?.documentPath,
      viewingHistory || options.preferDesign ? design?.path : undefined,
      viewingHistory ? historical?.documentPath : group?.documentPath,
    ]) {
      material = materials.find((item) => item.path === path);
      if (material) break;
    }
  }
  return {
    historical,
    materials,
    rows,
    proposalRound,
    design,
    selected,
    material: material ?? materials[0],
  };
}

export function isCurrentMaterialConfirmed(
  group: AIReqRequirementGroup | undefined,
  material: AIReqMaterialView | undefined,
): boolean {
  if (
    !group ||
    !material?.valid ||
    material.projectId !== group.projectId ||
    material.irId !== group.id
  )
    return false;
  const matchesFile = (file: Pick<AIReqMaterialView, "path" | "sha256" | "size">) =>
    file.path === material.path && file.sha256 === material.sha256 && file.size === material.size;
  if (!group.files.some(matchesFile)) return false;

  if (group.merge) {
    // Git history records only the paths changed by each accepted sync. A later sync
    // of another path leaves this file's accepted version in place.
    const accepted = group.materialHistory?.findLast(
      ({ event }) =>
        event?.type === "git-sync" && event.files.some(({ path }) => path === material.path),
    );
    // Unchanged paths retain the exact file version verified at intake.
    return (accepted?.materials ?? group.merge.files).some(matchesFile);
  }

  // Approval of requirements covers just the IR; any current alignment covers the
  // full review input. History alone is never evidence of current human approval.
  if (material.path === group.documentPath && !requirementsReviewBlocker(group)) return true;
  return (
    !fullReviewReadyBlocker(group) &&
    (group.alignment?.some((entry) => proposalAlignmentCurrent(group, entry)) ?? false)
  );
}

export type MaterialReadFeedback = { request: AIReqMaterialReadRequest; message?: string };

export function materialReadFeedback(
  current: AIReqMaterialReadRequest | undefined,
  feedback: MaterialReadFeedback | undefined,
): string | undefined {
  if (!current || !feedback) return undefined;
  const previous = feedback.request;
  if (
    previous.projectId === current.projectId &&
    previous.releaseId === current.releaseId &&
    previous.irId === current.irId &&
    previous.path === current.path &&
    previous.sha256 === current.sha256 &&
    previous.round === current.round
  ) {
    return feedback.message;
  }
  return undefined;
}

export function readMaterialDependencies(
  material: AIReqMaterialView,
  rows: readonly { id: string; title: string }[] | undefined,
  proposalRound: number | undefined,
) {
  const raw = material.content ?? "";
  if (!rows) return { issue: "历史快照缺少 SR 清单，无法绘制依赖图。", raw };
  if (proposalRound === undefined) return { issue: "历史快照缺少方案轮次，无法绘制依赖图。", raw };
  if (rows.some(({ title }) => !title?.trim()))
    return { issue: "SR 清单缺少节点名称，无法绘制依赖图。", raw };
  const result = readSrDependencies(
    { id: material.irId, srIds: rows.map(({ id }) => id), proposalRound },
    material,
    false,
  );
  if (!result.document) return { issue: result.issue, raw };
  const titles = new Map(rows.map(({ id, title }) => [id, title]));
  return { rows: result.document.srs.map((row) => ({ ...row, title: titles.get(row.srId)! })) };
}
