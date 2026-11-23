import type { AIReqMainView, AIReqWorkflowTarget } from "./contract.js";

export type ProposalDraft = { id: string };
export type NavigationOverlay =
  | { kind: "settings" }
  | { kind: "proposal"; draft: ProposalDraft; fromList?: boolean }
  | { kind: "proposal-import" }
  | null;
export interface AIReqNavigationState {
  index: number;
  extent: number;
  mainView: AIReqMainView;
  overlay: NavigationOverlay;
  overviewOrigin?: { projectId: string; releaseId: string };
}

export function restoreNavigationOverlay(saved: unknown): NavigationOverlay {
  if (!saved || typeof saved !== "object") return null;
  if (!("kind" in saved)) return null;
  if (saved.kind === "settings" || saved.kind === "proposal-import") return { kind: saved.kind };
  if (saved.kind === "proposal" && "draft" in saved) {
    const draft = saved.draft;
    if (draft && typeof draft === "object" && "id" in draft && typeof draft.id === "string")
      return {
        kind: "proposal",
        ...("fromList" in saved && saved.fromList === true ? { fromList: true } : {}),
        draft: { id: draft.id },
      };
  }
  return null;
}

export function restoreMainView(saved: unknown): AIReqMainView {
  return (
    (
      [
        "chat",
        "ideas",
        "projectProgress",
        "projectOverview",
        "proposals",
        "roles",
        "skillDesign",
      ] as const
    ).find((view) => view === saved) ?? "projectProgress"
  );
}

/** 共享链接仅投影显式对象；不携带页面查询、凭据或锚点。 */
export function requirementObjectLink(
  base: string,
  target: AIReqWorkflowTarget,
  releaseId: string,
): string | undefined {
  if (!target.projectId || !target.irId || !releaseId) return undefined;
  const url = new URL(base);
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  url.searchParams.set("aireqProject", target.projectId);
  url.searchParams.set("aireqRelease", releaseId);
  url.searchParams.set("aireqIr", target.irId);
  if (target.srId) url.searchParams.set("aireqSr", target.srId);
  if (target.discussionPhase) url.searchParams.set("aireqAgent", target.discussionPhase);
  return url.toString();
}
