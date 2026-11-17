import { describe, expect, it } from "vitest";
import {
  captureRequirementReturnView,
  restoreRequirementReturnView,
  restoreMainView,
  restoreNavigationOverlay,
} from "../../packages/ui/src/aireq/navigationState.js";

describe("requirement detail return navigation", () => {
  it.each(["proposals", "formal"] as const)("returns to its %s entry page", (mainView) => {
    expect(captureRequirementReturnView({ mainView, requirementReturnView: null }, "chat")).toBe(
      mainView,
    );
  });

  it("keeps the entry page through detail phases and settings on the detail page", () => {
    const previous = { mainView: "chat", requirementReturnView: "proposals" } as const;
    expect(captureRequirementReturnView(previous, "chat")).toBe("proposals");
    expect(previous.requirementReturnView).toBe("proposals");
  });

  it("has no entry source for a direct link resolved from the initial overview", () => {
    expect(
      captureRequirementReturnView(
        { mainView: "projectProgress", requirementReturnView: null },
        "chat",
      ),
    ).toBeNull();
    expect(restoreRequirementReturnView("chat", undefined)).toBeNull();
  });

  it("clears the old source when leaving a detail page", () => {
    expect(
      captureRequirementReturnView(
        { mainView: "chat", requirementReturnView: "proposals" },
        "proposals",
      ),
    ).toBeNull();
  });

  it("restores only supported return pages on detail history entries", () => {
    expect(restoreRequirementReturnView("chat", "projectOverview")).toBeNull();
    expect(restoreRequirementReturnView("chat", "proposals")).toBe("proposals");
    expect(restoreRequirementReturnView("chat", "formal")).toBe("formal");
    for (const saved of ["projectProgress", "chat", "settings", {}, 1, null])
      expect(restoreRequirementReturnView("chat", saved)).toBeNull();
    expect(restoreRequirementReturnView("projectOverview", "proposals")).toBeNull();
  });

  it("accepts published main pages and rejects unknown history destinations", () => {
    expect(restoreMainView("projectOverview")).toBe("projectOverview");
    expect(restoreMainView("chat")).toBe("chat");
    expect(restoreMainView("unknown")).toBe("chat");
    expect(restoreMainView({ mainView: "ideas" })).toBe("chat");
  });

  it("restores supported overlays without accepting malformed draft records", () => {
    expect(restoreNavigationOverlay({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(
      restoreNavigationOverlay({ kind: "proposal", draft: { id: "draft", sourceIrId: "ir" } }),
    ).toEqual({ kind: "proposal", draft: { id: "draft", sourceIrId: "ir" } });
    expect(restoreNavigationOverlay({ kind: "proposal", draft: { id: 7 } })).toBeNull();
    expect(restoreNavigationOverlay({ kind: "unknown" })).toBeNull();
  });
});
