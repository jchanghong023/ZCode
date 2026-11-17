import type { AIReqMainView } from "./contract.js";

export type ProposalDraft = { id: string; sourceIrId?: string };
export type NavigationOverlay =
  | { kind: "settings" }
  | { kind: "proposal"; draft: ProposalDraft }
  | { kind: "proposal-import" }
  | null;
export type RequirementView = "proposals" | "formal";
export type RequirementReturnView = RequirementView | "projectOverview" | null;
export interface AIReqNavigationState {
  index: number;
  extent: number;
  mainView: AIReqMainView;
  requirementView: RequirementView;
  requirementReturnView: RequirementReturnView;
  overlay: NavigationOverlay;
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
  return mainView === "chat" &&
    (saved === "projectOverview" || saved === "proposals" || saved === "formal")
    ? saved
    : null;
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
