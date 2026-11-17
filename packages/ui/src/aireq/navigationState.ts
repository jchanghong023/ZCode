import type { AIReqMainView, AIReqSelection } from "./contract.js";

export type ProposalDraft = { id: string; sourceIrId?: string };
export type NavigationOverlay =
  | { kind: "settings" }
  | { kind: "proposal"; draft: ProposalDraft }
  | { kind: "proposal-import" }
  | null;
export type RequirementView = "proposals" | "formal";
export type RequirementReturnView = RequirementView | null;
export interface AIReqNavigationState {
  index: number;
  extent: number;
  mainView: AIReqMainView;
  requirementView: RequirementView;
  requirementReturnView: RequirementReturnView;
  overlay: NavigationOverlay;
  overviewOrigin?: { projectId: string; releaseId: string };
}

/** 纯导航投影；状态接纳、历史写入及离开门禁仍只归 AIReqContext。 */
export function captureRequirementReturnView(
  previous: Pick<AIReqNavigationState, "mainView" | "requirementReturnView">,
  nextView: AIReqMainView,
): RequirementReturnView {
  if (nextView !== "chat") return null;
  if (previous.mainView === "chat") return previous.requirementReturnView;
  return restoreRequirementReturnView("chat", previous.mainView);
}

export function restoreRequirementReturnView(
  mainView: AIReqMainView,
  saved: unknown,
): RequirementReturnView {
  return mainView === "chat" && (saved === "proposals" || saved === "formal") ? saved : null;
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
        draft: {
          id: draft.id,
          ...("sourceIrId" in draft && typeof draft.sourceIrId === "string"
            ? { sourceIrId: draft.sourceIrId }
            : {}),
        },
      };
  }
  return null;
}

export function restoreMainView(saved: unknown): AIReqMainView {
  return (
    (
      [
        "ideas",
        "projectProgress",
        "projectOverview",
        "todos",
        "proposals",
        "formal",
        "requirementAnalysis",
        "skillDesign",
      ] as const
    ).find((view) => view === saved) ?? "chat"
  );
}

/** 共享链接仅投影显式对象；不携带页面查询、凭据或锚点。 */
export function requirementObjectLink(
  base: string,
  target: AIReqSelection,
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
  return url.toString();
}
