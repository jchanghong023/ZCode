import { describe, expect, it } from "vitest";
import {
  requirementObjectLink,
  restoreMainView,
  restoreNavigationOverlay,
} from "../../packages/ui/src/aireq/navigationState.js";

describe("requirement navigation history", () => {
  it("accepts published main pages and rejects unknown history destinations", () => {
    expect(restoreMainView("projectOverview")).toBe("projectOverview");
    expect(restoreMainView("chat")).toBe("chat");
    expect(restoreMainView("unknown")).toBe("chat");
    expect(restoreMainView({ mainView: "ideas" })).toBe("chat");
  });

  it.each(["development", "testing", "formal", "requirementAnalysis"])("restores retired %s entries to co-creation", (page) => {
    expect(restoreMainView(page)).toBe("proposals");
  });

  it("restores supported overlays without accepting malformed draft records", () => {
    expect(restoreNavigationOverlay({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(
      restoreNavigationOverlay({ kind: "proposal", draft: { id: "draft", sourceIrId: "ir" } }),
    ).toEqual({ kind: "proposal", draft: { id: "draft", sourceIrId: "ir" } });
    expect(
      restoreNavigationOverlay({ kind: "proposal", draft: { id: "draft" }, fromList: true }),
    ).toEqual({ kind: "proposal", draft: { id: "draft" }, fromList: true });
    expect(restoreNavigationOverlay({ kind: "proposal", draft: { id: 7 } })).toBeNull();
    expect(restoreNavigationOverlay({ kind: "unknown" })).toBeNull();
  });
});

describe("requirement object links", () => {
  it("copies the explicit tab target and strips unrelated URL data", () => {
    const link = requirementObjectLink(
      "https://user:pass@example.test/app?old=secret#section",
      { projectId: "project-b", irId: "ir-b", srId: "sr-b" },
      "release-b",
    );
    expect(link).toBe(
      "https://example.test/app?aireqProject=project-b&aireqRelease=release-b&aireqIr=ir-b&aireqSr=sr-b",
    );
  });
  it("does not create a link for an incomplete target", () => {
    expect(requirementObjectLink("https://example.test", { projectId: "p" }, "r")).toBeUndefined();
    expect(
      requirementObjectLink("https://example.test", { projectId: "p", irId: "ir" }, ""),
    ).toBeUndefined();
  });
});
