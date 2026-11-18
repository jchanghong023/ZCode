import { createHash } from "node:crypto";
import type {
  AIReqAnalysisFilter,
  AIReqAnalysisRun,
  AIReqAnalysisRunSummary,
  AIReqAnalysisTask,
  AIReqProgressAnalysis,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
import { srProgress } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import { prototypeDefaultCommit } from "./fixture-builders.js";

/** 输入只含材料/代码/合并事实，绝不把分析时间、评分和人工验收反写进指纹。 */
export function prototypeProgressFingerprint(
  state: AIReqWorkflowView,
  group: AIReqRequirementGroup,
  sr: AIReqSystemRequirement,
): string {
  const materials = state.materials
    .filter(
      (item) =>
        item.projectId === sr.projectId &&
        item.irId === sr.irId &&
        (!item.srId || item.srId === sr.id),
    )
    .map((item) => ({
      path: item.path,
      sha256: item.sha256,
      content: item.content,
      valid: item.valid,
      error: item.error,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: [sr.projectId, group.releaseId, group.id, sr.id],
        requirements: [group.snapshot?.digest, group.files, sr.documentPath, sr.title],
        // tasks.md 正文和其版本与其他 SR 独立材料一起进入快照，不执行任务/勾选数。
        materials: [materials, sr.materialDigest, sr.materials],
        code: [
          sr.trackingBranch?.name,
          sr.trackingBranch?.baseCommit,
          sr.trackingBranch?.pushedAt,
          sr.trackingBranch?.status,
          sr.progress?.activity[0]?.commit,
          sr.codeMerge?.commit,
          sr.codeMerge?.branch,
          state.projects.find((project) => project.id === sr.projectId)?.defaultBranch,
          prototypeDefaultCommit(state, sr.projectId),
        ],
      }),
    )
    .digest("hex");
}

export function prototypeAnalysisReport(
  sr: AIReqSystemRequirement,
  fingerprint: string,
  analysedAt: string,
  defaultVersion?: string,
): AIReqProgressAnalysis {
  const existing = sr.progress;
  // 明确的确定性模拟评分，绝不宣称读取了真实代码、执行了任务或测试。
  const aiPercent =
    sr.codeMerge || existing?.activity.length
      ? 20 + (parseInt(fingerprint.slice(0, 4), 16) % 76)
      : 0;
  const report: AIReqProgressAnalysis = {
    percent: aiPercent,
    aiPercent,
    merged: Boolean(sr.codeMerge),
    certain: existing?.certain ?? false,
    branch: sr.trackingBranch?.name ?? "",
    analysedAt,
    codeVersion:
      sr.codeMerge?.commit ??
      existing?.activity[0]?.commit ??
      sr.trackingBranch?.baseCommit ??
      "未记录",
    defaultVersion:
      defaultVersion ??
      sr.codeMerge?.commit ??
      existing?.defaultVersion ??
      sr.trackingBranch?.baseCommit ??
      "未记录",
    implemented: existing?.implemented ?? [],
    remaining: existing?.remaining ?? ["尚无独立代码证据，请核对代码与任务完成情况。"],
    issues: existing?.issues ?? [],
    activity: existing?.activity ?? [],
    inputFingerprint: fingerprint,
  };
  report.percent = srProgress({ ...sr, progress: report });
  return report;
}

export function matches(
  row: { projectId: string; releaseId?: string; irId: string; srId: string; srTitle: string },
  filter: AIReqAnalysisFilter,
): boolean {
  const search = filter.srSearch?.trim().toLowerCase();
  return (
    (!filter.projectId || row.projectId === filter.projectId) &&
    (!filter.releaseId || row.releaseId === filter.releaseId) &&
    (!filter.irId || row.irId === filter.irId) &&
    (!filter.srId || row.srId === filter.srId) &&
    (!search ||
      row.srId.toLowerCase().includes(search) ||
      row.srTitle.toLowerCase().includes(search))
  );
}

export function pageBounds(total: number, requestedPage: number, requestedSize: number) {
  if (
    ![25, 50].includes(requestedSize) ||
    !Number.isSafeInteger(requestedPage) ||
    requestedPage < 1
  )
    throw businessRule("分页参数无效。");
  const pageSize = requestedSize;
  const page = Math.min(
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
    Math.max(1, Math.ceil(total / pageSize)),
  );
  return { page, pageSize, start: (page - 1) * pageSize };
}

export const matchesState = (task: AIReqAnalysisTask, filter: AIReqAnalysisFilter) =>
  !filter.taskState || task.state === filter.taskState;

export const newestFirst = (a: AIReqAnalysisRunSummary, b: AIReqAnalysisRunSummary) =>
  b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id);

export const summary = (run: AIReqAnalysisRun): AIReqAnalysisRunSummary => ({
  id: run.id,
  batchId: run.batchId,
  taskId: run.taskId,
  projectId: run.projectId,
  releaseId: run.releaseId,
  irId: run.irId,
  srId: run.srId,
  srTitle: run.srTitle,
  branch: run.branch,
  trigger: run.trigger,
  status: run.status,
  startedAt: run.startedAt,
  endedAt: run.endedAt,
  message: run.message,
  before: run.before,
  after: run.after,
});
