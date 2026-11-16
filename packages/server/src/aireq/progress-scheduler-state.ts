import { createHash } from "node:crypto";
import type {
  AIReqProgressAnalysis,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
import { srProgress } from "@zcode/services/aireq";
import { withPrototypeProgress } from "./progress.js";
import { prototypeDefaultCommit } from "./fixture-builders.js";

/** 输入只含材料/代码/合并事实，绝不把分析时间、评分和人工验收反写进指纹。 */
export function prototypeProgressFingerprint(
  state: AIReqWorkflowView,
  group: AIReqRequirementGroup,
  source: AIReqSystemRequirement,
): string {
  const sr = withPrototypeProgress({ ...state, groups: [group], srs: [source] }).srs[0]!;
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
        requirements: [
          group.snapshot?.digest,
          group.revision,
          group.files,
          sr.documentPath,
          sr.title,
        ],
        // tasks.md 正文和其版本与其他 SR 独立材料一起进入快照，不执行任务/勾选数。
        materials: [materials, sr.materialDigest, sr.materials],
        code: [
          sr.trackingBranch?.name,
          sr.trackingBranch?.baseCommit,
          sr.codeMerge,
          sr.codeMerge?.commit ?? sr.progress?.codeVersion ?? sr.trackingBranch?.baseCommit,
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
      sr.codeMerge?.commit ?? existing?.codeVersion ?? sr.trackingBranch?.baseCommit ?? "未记录",
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
    manual: existing?.manual,
  };
  report.percent = srProgress({ ...sr, progress: report });
  return report;
}
