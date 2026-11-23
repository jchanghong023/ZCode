import type { AIReqMaterialView, AIReqRequirementGroup } from "./types.js";

interface AIReqSrDependencyDocument {
  srs: {
    srId: string;
    estimate?: { workingDays: number; assumptions: string };
    prerequisites: { srId: string; reason: string }[];
  }[];
}

/** Read the dependency document as the single source for dependencies and estimates. */
export function readSrDependencies(
  group: Pick<AIReqRequirementGroup, "id" | "srIds">,
  material: AIReqMaterialView | undefined,
  requireEstimates = true,
): { document: AIReqSrDependencyDocument; issue?: never } | { document?: never; issue: string } {
  const root = `docs/requirements/${group.id}/`;
  if (
    !material ||
    material.path !== `${root}sr-dependencies.json` ||
    !material.valid ||
    material.error ||
    !material.content
  )
    return { issue: "sr-dependencies.json 缺失、无效或不可读取。" };
  let value: AIReqSrDependencyDocument;
  try {
    value = JSON.parse(material.content);
  } catch {
    return { issue: "sr-dependencies.json 不是有效 JSON。" };
  }
  if (
    !value ||
    !Array.isArray(value.srs) ||
    value.srs.length !== group.srIds.length ||
    new Set(value.srs.map((row) => row?.srId)).size !== group.srIds.length ||
    value.srs.some(
      (row) =>
        !row ||
        !group.srIds.includes(row.srId) ||
        !Array.isArray(row.prerequisites) ||
        row.prerequisites.some(
          (item) =>
            !item ||
            typeof item.srId !== "string" ||
            !group.srIds.includes(item.srId) ||
            typeof item.reason !== "string" ||
            !item.reason.trim(),
        ) ||
        new Set(row.prerequisites.map((item) => item.srId)).size !== row.prerequisites.length,
    )
  )
    return {
      issue: "sr-dependencies.json 必须覆盖全部 SR，并使用本 IR 的稳定 SR ID 和非空依赖原因。",
    };
  if (
    requireEstimates &&
    value.srs.some(
      (row) =>
        !row.estimate ||
        !Number.isFinite(row.estimate.workingDays) ||
        row.estimate.workingDays <= 0 ||
        typeof row.estimate.assumptions !== "string" ||
        !row.estimate.assumptions.trim(),
    )
  )
    return { issue: "sr-dependencies.json 中每个 SR 须包含正数工期预估（工作日）及预估假设。" };
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const inspect = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (value.srs.find((row) => row.srId === id)!.prerequisites.some((item) => inspect(item.srId)))
      return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (group.srIds.some(inspect))
    return { issue: "SR 依赖存在循环或自依赖，请修正 sr-dependencies.json。" };
  return { document: value };
}
