import type {
  AIReqRequirementGroup,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "./types.js";

import type { AIReqProgressSummary, AIReqProjectProgress } from "./progress-types.js";
export interface AIReqVersionedProgressInput {
  operationId: string;
  expectedRevision: number;
}
export interface AIReqTestAcceptanceInput extends AIReqVersionedProgressInput {
  expectedCodeVersion: string;
  outcome: "passed" | "failed";
  reason: string;
}
export interface AIReqCodeMergeInput extends AIReqVersionedProgressInput {
  fix: boolean;
}
export interface AIReqBranchCleanupInput extends AIReqVersionedProgressInput {
  branches: string[];
}
export interface AIReqBranchCleanupItem {
  srId: string;
  branch: string;
  status: "ready" | "failed" | "deleted";
  error?: string;
}

export const PROGRESS_STATUSES = ["待开发", "开发中", "待合入", "待验收", "已完成"] as const;
export type AIReqProgressStatus = (typeof PROGRESS_STATUSES)[number];

export function srProgress(sr: AIReqSystemRequirement): number {
  if (sr.codeMerge && sr.testAcceptance?.outcome === "passed" &&
      sr.testAcceptance.codeVersion === sr.codeMerge.commit) return 100;
  if (sr.codeMerge) return 99;
  return Math.max(0, Math.min(99, sr.progress?.aiPercent ?? sr.progress?.percent ?? 0));
}
export function progressLabel(percent: number): string {
  return `${percent === 100 ? 100 : Math.min(99.9, Math.round(percent * 10) / 10)}%`;
}
export function irSrs(
  view: AIReqWorkflowView,
  group: AIReqRequirementGroup,
): AIReqSystemRequirement[] {
  return view.srs.filter((sr) => sr.projectId === group.projectId && sr.irId === group.id);
}
export function irProgress(srs: AIReqSystemRequirement[]): number {
  return srs.length ? srs.reduce((sum, sr) => sum + srProgress(sr), 0) / srs.length : 0;
}

function emptyProgressSummary(): AIReqProgressSummary {
  return {
    proposalCount: 0,
    formalCount: 0,
    srCount: 0,
    unanalyzedCount: 0,
    percent: null,
    requirements: [],
  };
}

/** Pure projection; callers supply the same progress facts used by formal requirement rows. */
export function projectProgress(view: AIReqWorkflowView, projectId: string): AIReqProjectProgress {
  const total = emptyProgressSummary();
  const releases = view.releases
    .filter((release) => release.projectId === projectId)
    .map((release) => ({ releaseId: release.id, ...emptyProgressSummary() }));
  const byRelease = new Map(releases.map((release) => [release.releaseId, release]));
  const byIr = new Map<string, {
    requirement: AIReqProgressSummary["requirements"][number];
    release: AIReqProgressSummary | undefined;
    sum: number;
  }>();
  const sums = new Map<AIReqProgressSummary, number>([
    [total, 0],
    ...releases.map((release): [AIReqProgressSummary, number] => [release, 0]),
  ]);
  for (const proposal of view.drafts) {
    if (proposal.projectId !== projectId) continue;
    total.proposalCount++;
    const release = byRelease.get(proposal.releaseId);
    if (release) release.proposalCount++;
  }
  for (const group of view.groups) {
    if (group.projectId !== projectId) continue;
    const requirement = {
      irId: group.id,
      releaseId: group.releaseId,
      originalText: group.originalText,
      srCount: 0,
      unanalyzedCount: 0,
      percent: null as number | null,
    };
    const release = byRelease.get(group.releaseId);
    total.formalCount++;
    total.requirements.push(requirement);
    if (release) {
      release.formalCount++;
      release.requirements.push(requirement);
    }
    byIr.set(group.id, { requirement, release, sum: 0 });
  }
  for (const sr of view.srs) {
    if (sr.projectId !== projectId) continue;
    const ir = byIr.get(sr.irId);
    if (!ir) continue;
    const percent = srProgress(sr);
    const unanalyzed = !sr.progress && !sr.codeMerge ? 1 : 0;
    ir.sum += percent;
    ir.requirement.srCount++;
    ir.requirement.unanalyzedCount += unanalyzed;
    total.srCount++;
    total.unanalyzedCount += unanalyzed;
    sums.set(total, sums.get(total)! + percent);
    if (ir.release) {
      ir.release.srCount++;
      ir.release.unanalyzedCount += unanalyzed;
      sums.set(ir.release, sums.get(ir.release)! + percent);
    }
  }
  for (const { requirement, sum } of byIr.values()) {
    requirement.percent = requirement.srCount ? sum / requirement.srCount : null;
  }
  for (const [summary, sum] of sums) {
    summary.percent = summary.srCount ? sum / summary.srCount : null;
  }
  return { projectId, total, releases };
}
export function srProgressStatus(sr: AIReqSystemRequirement): AIReqProgressStatus {
  const percent = srProgress(sr);
  if (percent === 100) return "已完成";
  if (sr.codeMerge) return "待验收";
  if (percent === 0) return "待开发";
  return sr.progress?.certain ? "待合入" : "开发中";
}
export function irProgressStatus(srs: AIReqSystemRequirement[]): AIReqProgressStatus {
  if (!srs.length || srs.every((sr) => srProgress(sr) === 0)) return "待开发";
  const statuses = srs.map(srProgressStatus);
  if (statuses.every((status) => status === "已完成")) return "已完成";
  if (statuses.some((status) => status === "待开发" || status === "开发中")) return "开发中";
  return statuses.includes("待合入") ? "待合入" : "待验收";
}

/** 完成来自已合入版本的人工测试；原始 AI 评分不是验收前置条件。 */
export function srCompletionBlocker(sr: AIReqSystemRequirement): string | undefined {
  if (srProgress(sr) === 100) return "当前 SR 已完成，无需重复验收。";
  if (!sr.trackingBranch?.name?.trim() || sr.trackingBranch.status === "failed")
    return "开发分支缺失或创建失败，不能验收。";
  if (!sr.codeMerge) return "代码尚未合入默认分支，不能验收。";
  if (srProgress(sr) !== 99) return "只有已合入且有效进度 99% 的 SR 才能验收。";
  if (sr.developmentIssues?.some((issue) => issue.status === "open"))
    return "存在待处理测试问题；修复提交合入并进入待复测后才能重新验收。";
}
