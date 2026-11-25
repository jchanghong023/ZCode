import type { AIReqMainView, AIReqSelection, AIReqWorkflowView } from "./contract.js";
import type { ProposalColumnFilters } from "./proposals/proposalColumns.js";

export interface AIReqProposalQuery {
  query: string;
  filters: ProposalColumnFilters;
}

export const EMPTY_PROPOSAL_QUERY: AIReqProposalQuery = { query: "", filters: {} };

export type NavigationOverlay = { kind: "settings" } | null;
export interface AIReqNavigationState {
  index: number;
  extent: number;
  mainView: AIReqMainView;
  overlay: NavigationOverlay;
}

export function restoreNavigationOverlay(saved: unknown): NavigationOverlay {
  if (!saved || typeof saved !== "object") return null;
  if (!("kind" in saved)) return null;
  if (saved.kind === "settings") return { kind: saved.kind };
  return null;
}

export function restoreMainView(saved: unknown): AIReqMainView {
  return (
    (["chat", "projectProgress", "proposals", "roles", "skillDesign"] as const).find(
      (view) => view === saved,
    ) ?? "projectProgress"
  );
}

export function requirementScopeFallback(
  target: AIReqSelection,
  view: Pick<AIReqWorkflowView, "projects" | "releases" | "releaseReadFailures">,
): { selection: AIReqSelection; mainView: AIReqMainView } | undefined {
  const { projectId, releaseId } = target;
  // 部分读取不能证明范围已删除；仅用完整目录纠正普通导航。
  if (!projectId || view.releaseReadFailures?.length) return;
  if (!view.projects.some((project) => project.id === projectId))
    return { selection: {}, mainView: "projectProgress" };
  if (
    releaseId &&
    !view.releases.some((release) => release.projectId === projectId && release.id === releaseId)
  )
    return { selection: { projectId }, mainView: "proposals" };
}

/** 共享链接仅投影显式对象；不携带页面查询、凭据或锚点。 */
export function requirementObjectLink(
  base: string,
  target: AIReqSelection,
  legacyReleaseId?: string,
): string | undefined {
  // 未分配 Release 的 IR 仍是有效对象；可选范围为空时不要丢弃对象链接。
  if (!target.projectId || !target.irId) return undefined;
  const url = new URL(base);
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  url.searchParams.set("aireqProject", target.projectId);
  if (legacyReleaseId) url.searchParams.set("aireqRelease", legacyReleaseId);
  url.searchParams.set("aireqIr", target.irId);
  if (target.srId) url.searchParams.set("aireqSr", target.srId);
  if (target.discussionPhase) url.searchParams.set("aireqAgent", target.discussionPhase);
  return url.toString();
}
