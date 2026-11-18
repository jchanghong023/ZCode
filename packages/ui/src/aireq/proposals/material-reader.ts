import {
  readSrDependencies,
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
    materialPath?: string;
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
      options.materialPath,
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
