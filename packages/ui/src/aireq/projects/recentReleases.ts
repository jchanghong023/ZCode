import type { AIReqReleaseSummary, AIReqRequirementGroup } from "../contract.js";
import { proposalDate } from "../proposals/proposalColumns.js";

export function recentReleases(
  releases: AIReqReleaseSummary[],
  requirements: readonly Pick<AIReqRequirementGroup, "projectId" | "releaseId" | "createdAt">[],
  projectId: string,
  now: number,
) {
  // 北京时间按日历回推十二个月；闰年 2 月 29 日对齐上一年的月末。
  const offset = 8 * 3_600_000;
  const today = new Date(now + offset);
  const year = today.getUTCFullYear() - 1;
  const month = today.getUTCMonth();
  const day = Math.min(today.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const cutoff = Date.UTC(year, month, day) - offset;
  const latest = new Map<string, number>();
  for (const ir of requirements) {
    if (ir.projectId !== projectId || !ir.releaseId) continue;
    const created = proposalDate(ir.createdAt);
    if (created !== undefined && created > (latest.get(ir.releaseId) ?? -Infinity))
      latest.set(ir.releaseId, created);
  }
  return releases
    .flatMap((release) => {
      const updatedAt = latest.get(release.id);
      return release.projectId === projectId &&
        updatedAt !== undefined &&
        updatedAt >= cutoff &&
        updatedAt <= now
        ? [{ ...release, updatedAt }]
        : [];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
