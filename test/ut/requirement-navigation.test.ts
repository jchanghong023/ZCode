import { describe, expect, it } from "vitest";
import {
  requirementObjectLink,
  requirementScopeFallback,
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
    expect(restoreMainView("ideas")).toBe("projectProgress");
  });

  it("restores settings but discards the retired draft overlay", () => {
    expect(restoreNavigationOverlay({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(restoreNavigationOverlay({ kind: "proposal", draft: { id: "draft" } })).toBeNull();
    expect(restoreNavigationOverlay({ kind: "unknown" })).toBeNull();
  });

  const directory = {
    projects: [{ id: "p", name: "Project", revision: 0, defaultBranch: "main" }],
    releases: [
      {
        id: "r",
        projectId: "p",
        title: "Release",
        createdAt: "",
        requirementCount: 1,
        completedRequirementCount: 0,
        confirmedRequirementCount: 0,
      },
    ],
  };

  it("returns to the overview when the selected project is absent from a complete directory", () => {
    expect(requirementScopeFallback({ projectId: "removed", releaseId: "r" }, directory)).toEqual({
      selection: {},
      mainView: "projectProgress",
    });
  });

  it("falls back to the project's entire list only when its selected Release is gone", () => {
    expect(requirementScopeFallback({ projectId: "p", releaseId: "r" }, directory)).toBeUndefined();
    expect(requirementScopeFallback({ projectId: "p", releaseId: "gone" }, directory)).toEqual({
      selection: { projectId: "p" },
      mainView: "proposals",
    });
  });

  it("does not treat a partial project read as evidence that its Release disappeared", () => {
    expect(
      requirementScopeFallback(
        { projectId: "p", releaseId: "r" },
        { ...directory, releases: [], releaseReadFailures: ["p"] },
      ),
    ).toBeUndefined();
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
    expect(requirementObjectLink("https://example.test", { irId: "ir" })).toBeUndefined();
  });

  it.each([undefined, ""])("omits the optional Release for an unassigned IR (%s)", (releaseId) => {
    const target = { projectId: "p", irId: "ir" };
    const link = requirementObjectLink("https://example.test", target, releaseId);
    expect(link).toBe("https://example.test/?aireqProject=p&aireqIr=ir");
    const parsed = readObjectLink(link);
    if (!parsed || parsed === "invalid") throw new Error("无法读取未分配 Release 的需求链接");
    expect(parsed.releaseId).toBeUndefined();
    expect(selectionFromObjectLink(parsed)).toEqual({ ...target, discussionPhase: "requirements" });
  });
});
