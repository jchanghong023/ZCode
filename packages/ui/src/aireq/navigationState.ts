import type { AIReqMainView, AIReqSelection } from "./contract.js";
import type { ProposalColumnFilters } from "./proposals/proposalColumns.js";

export interface AIReqProposalQuery {
  query: string;
  filters: ProposalColumnFilters;
}

export const EMPTY_PROPOSAL_QUERY: AIReqProposalQuery = { query: "", filters: {} };

export type ProposalDraft = { id: string };
export type NavigationOverlay =
  | { kind: "settings" }
  | { kind: "proposal"; draft: ProposalDraft }
  | null;
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
  if (saved.kind === "proposal" && "draft" in saved) {
    const draft = saved.draft;
    if (draft && typeof draft === "object" && "id" in draft && typeof draft.id === "string")
      return { kind: "proposal", draft: { id: draft.id } };
  }
  return null;
}

export function restoreMainView(saved: unknown): AIReqMainView {
  return (
    (["chat", "projectProgress", "proposals", "roles", "skillDesign"] as const).find(
      (view) => view === saved,
    ) ?? "projectProgress"
  );
}

/** 共享链接仅投影显式对象；不携带页面查询、凭据或锚点。 */
export function requirementObjectLink(
  base: string,
  target: AIReqSelection,
  legacyReleaseId?: string,
): string | undefined {
  if (!target.projectId || !target.irId || legacyReleaseId === "") return undefined;
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
