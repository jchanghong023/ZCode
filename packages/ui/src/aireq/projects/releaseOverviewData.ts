import type { AIReqRequirementGroup } from "../contract.js";
import { proposalDwellTime } from "../proposals/proposalColumns.js";

export function releaseIRTitle(title: string, releaseTitle: string) {
  const prefix = releaseTitle + " ·";
  return releaseTitle && title.startsWith(prefix) ? title.slice(prefix.length).trimStart() : title;
}

export function openReleaseStays(requirements: readonly AIReqRequirementGroup[], now: number) {
  return requirements
    .filter((ir) => ir.process !== "完成")
    .map((ir) => {
      const elapsed = proposalDwellTime(ir, now);
      const days = elapsed === undefined ? undefined : Math.floor(elapsed / 86_400_000);
      const band = days === undefined || days < 30 ? undefined : days <= 90 ? "30-90" : "over-90";
      return { ir, elapsed, band };
    })
    .sort((a, b) => (b.elapsed ?? -1) - (a.elapsed ?? -1) || a.ir.id.localeCompare(b.ir.id));
}
