import type {
  AIReqFileVersion,
  AIReqProjectRole,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "./types.js";

export const AIREQ_ROLE_ADMINISTRATOR = "y00000000";

export function hasProjectRole(
  view: Pick<AIReqWorkflowView, "projectRoleMembers"> | undefined,
  projectId: string | undefined,
  employeeId: string,
  role: AIReqProjectRole,
): boolean {
  return (
    (Boolean(projectId) && employeeId === AIREQ_ROLE_ADMINISTRATOR) ||
    Boolean(
      view?.projectRoleMembers.some(
        (entry) =>
          entry.projectId === projectId && entry.employeeId === employeeId && entry.role === role,
      ),
    )
  );
}

export const MATERIAL_KIND_LABELS = {
  ir: "IR 原始需求",
  sr: "SR 规格",
  solution: "方案材料",
  plan: "开发计划",
  "test-plan": "测试方案",
};

export function requirementMaterialName(
  path: string,
  srs: readonly AIReqSystemRequirement[] = [],
): string | undefined {
  if (path.endsWith("/design.md")) return "技术方案";
  if (path.endsWith("/sr-dependencies.json")) return "SR 依赖";
  if (path.endsWith("/requirements.md")) return "业务需求";
  if (path.endsWith("/proposal.md")) return "SR 提案";
  if (path.endsWith("/tasks.md")) return "开发任务";
  if (path.endsWith("/test-plan.md")) return "测试方案";
  if (path.endsWith("/spec.md")) {
    const sr = srs.find((item) => item.documentPath === path);
    return sr ? `SR 需求 · ${sr.title}` : "SR 需求";
  }
}

export function fileVersions(files: readonly AIReqFileVersion[]): string {
  return JSON.stringify(
    files
      .map(({ path, sha256, size }) => ({ path, sha256, size }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
}
