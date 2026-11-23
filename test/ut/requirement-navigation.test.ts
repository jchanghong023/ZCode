import { describe, expect, it } from "vitest";
import {
  requirementObjectLink,
  restoreMainView,
  restoreNavigationOverlay,
} from "../../packages/ui/src/aireq/navigationState.js";
import {
  readObjectLink,
  selectionFromObjectLink,
} from "../../packages/ui/src/aireq/proposalRoutes.js";

describe("requirement navigation history", () => {
  it("accepts published main pages and rejects unknown history destinations", () => {
    expect(restoreMainView("proposals")).toBe("proposals");
    expect(restoreMainView("chat")).toBe("chat");
    expect(restoreMainView("unknown")).toBe("projectProgress");
    expect(restoreMainView({ mainView: "ideas" })).toBe("projectProgress");
  });

  it("restores the former overview as co-creation", () => {
    expect(restoreMainView("projectOverview")).toBe("proposals");
  });

  it("restores supported overlays without accepting malformed draft records", () => {
    expect(restoreNavigationOverlay({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(restoreNavigationOverlay({ kind: "proposal", draft: { id: "draft" } })).toEqual({
      kind: "proposal",
      draft: { id: "draft" },
    });
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
  it.each(["requirements", "solution"] as const)("round-trips the selected %s Agent", (agent) => {
    const target = { projectId: "project-a", irId: "ir-a", discussionPhase: agent };
    const link = requirementObjectLink("https://example.test", target, "release-a");
    expect(link).toBe(
      `https://example.test/?aireqProject=project-a&aireqRelease=release-a&aireqIr=ir-a&aireqAgent=${agent}`,
    );
    const selection = readObjectLink(link);
    expect(selection).toEqual({
      projectId: "project-a",
      releaseId: "release-a",
      irId: "ir-a",
      agent,
    });
    if (!selection || selection === "invalid") throw new Error("无法读取 Agent 链接");
    expect(selectionFromObjectLink(selection)).toEqual(target);
  });

  it("does not create a link for an incomplete target", () => {
    expect(requirementObjectLink("https://example.test", { projectId: "p" }, "r")).toBeUndefined();
    expect(
      requirementObjectLink("https://example.test", { projectId: "p", irId: "ir" }, ""),
    ).toBeUndefined();
  });
});
