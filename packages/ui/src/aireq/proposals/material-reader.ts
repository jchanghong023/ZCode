import {
  readSrDependencies,
  type AIReqMaterialView,
  type AIReqRequirementGroup,
} from "../contract.js";

type MaterialRow = { id: string; title: string; documentPath: string };

export function readMaterialSelection(
  group: Pick<AIReqRequirementGroup, "id" | "projectId" | "documentPath" | "documentHistory">,
  currentMaterials: readonly AIReqMaterialView[],
  currentRows: readonly MaterialRow[],
  options: { path?: string; srId?: string; version?: number; preferDesign?: boolean },
) {
  const viewingHistory = options.version !== undefined;
  const historical = group.documentHistory.find((entry) => entry.number === options.version);
  const materials = (viewingHistory ? (historical?.materials ?? []) : currentMaterials).filter(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  );
  const rows = viewingHistory ? (historical?.srs ?? []) : currentRows;
  const selected = materials.find((item) => item.path === options.path);
  const srPath = rows.find((row) => row.id === options.srId)?.documentPath;
  const srDocument = materials.find((item) => item.path === srPath);
  const srDesign = materials.find(
    (item) => item.srId === options.srId && item.path.endsWith("/design.md"),
  );
  const solutionDocument =
    srDesign ??
    srDocument ??
    materials.find((item) => item.path.endsWith("/design.md")) ??
    materials.find((item) => item.srId);
  const material =
    selected ??
    (options.preferDesign ? solutionDocument : srDocument) ??
    materials.find((item) => item.path === group.documentPath) ??
    materials.find((item) => !item.srId && item.kind === "ir") ??
    materials[0];
  return { historical, materials, rows, selected, material };
}

export function readMaterialDependencies(
  material: AIReqMaterialView,
  rows: readonly { id: string; title: string }[],
) {
  const raw = material.content ?? "";
  if (rows.some(({ title }) => !title.trim()))
    return { issue: "SR 清单缺少节点名称，无法绘制依赖图。", raw };
  const result = readSrDependencies(
    { id: material.irId, srIds: rows.map(({ id }) => id) },
    material,
    false,
  );
  if (!result.document) return { issue: result.issue, raw };
  const titles = new Map(rows.map(({ id, title }) => [id, title]));
  return { rows: result.document.srs.map((row) => ({ ...row, title: titles.get(row.srId)! })) };
}
