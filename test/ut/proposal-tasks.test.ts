import { describe, expect, it } from "vitest";
import {
  proposalTaskFromSelection,
  proposalTaskSelection,
  proposalTaskParent,
  restoreProposalTask,
  proposalNextTask,
  proposalTaskStatus,
  proposalTasks,
} from "../../packages/ui/src/aireq/proposals/proposalTasks.js";
import {
  proposalTaskUrl,
  readObjectLink,
  selectionFromObjectLink,
  formalObjectUrl,
  formalProposalNavigation,
} from "../../packages/ui/src/aireq/proposalRoutes.js";
import type { AIReqRequirementGroup, AIReqReview } from "../../packages/ui/src/aireq/contract.js";

const file = { path: "docs/requirements/ir/requirements.md", sha256: "v1", size: 42 };
const group = (): AIReqRequirementGroup => ({
  projectId: "p",
  id: "ir",
  releaseId: "r",
  title: "需求",
  originalText: "原文",
  submittedBy: "employee",
  documentPath: file.path,
  origin: "local",
  status: "draft",
  revision: 1,
  srIds: [],
  files: [{ ...file }],
  sessions: [],
  createdAt: "2026-11-17T00:00:00Z",
});
const review = (): AIReqReview => ({
  id: "review-1",
  snapshotDigest: "v1",
  passed: false,
  report: "评审意见",
  inputFiles: [{ ...file }],
  createdAt: "2026-11-17T00:00:00Z",
  reviewer: { sessionId: "review-a", role: "reviewer", sourceProjectId: "p", imported: true },
  agents: [
    {
      id: "a",
      name: "业务评审",
      status: "completed",
      report: "待人工判断",
      session: {
        projectId: "p",
        irId: "ir",
        sessionId: "review-a",
        sessionFile: "review-a.json",
        phase: "requirements",
        role: "reviewer",
        round: 1,
      },
    },
  ],
});

describe("independent proposal task navigation", () => {
  it("enters a workbench from an ordinary proposal entry", () => {
    expect(proposalTaskFromSelection({ projectId: "p", irId: "ir" })).toBe("overview");
    expect(proposalNextTask({ ...group(), files: [] })).toBe("requirements");
    expect(proposalNextTask(group())).toBe("requirementsReview");
  });
  it.each(proposalTasks)("restores the %s page without business changes", (task) => {
    expect(restoreProposalTask(task)).toBe(task);
  });
  it("keeps review detail return destinations separate from entry origins", () => {
    expect(proposalTaskParent("solutionReviewDetail")).toBe("solutionReview");
    expect(proposalTaskParent("requirementsReviewDetail")).toBe("requirementsReview");
    expect(proposalTaskParent("delivery")).toBe("overview");
  });
  it("clears prior agent and SR when moving to a different task", () => {
    const selection = proposalTaskSelection(
      { projectId: "p", irId: "ir", srId: "old-sr", reviewAgent: "c", proposalStep: "solution" },
      "requirements",
    );
    expect(selection).toEqual({
      projectId: "p",
      irId: "ir",
      proposalStep: "requirements",
      discussionPhase: "requirements",
    });
    expect(proposalTaskSelection(selection, "overview")).toEqual({ projectId: "p", irId: "ir" });
  });
  it("preserves SR only for an explicit SR address, not the parent navigation", () => {
    const base = { projectId: "p", irId: "ir", srId: "sr" };
    expect(proposalTaskSelection(base, "solution").srId).toBeUndefined();
    expect(proposalTaskSelection(base, "solution", undefined, true).srId).toBe("sr");
  });
  it("restores legacy reviewer history and rejects unknown page values", () => {
    expect(restoreProposalTask(undefined, { reviewAgent: "c", discussionPhase: "solution" })).toBe(
      "solutionReviewDetail",
    );
    expect(restoreProposalTask("unknown")).toBe("overview");
  });
  it.each(["a", "b", "c", "summary"] as const)(
    "roundtrips an independent address for reviewer %s",
    (agent) => {
      const selection = proposalTaskSelection(
        { projectId: "p", irId: "ir" },
        "solutionReviewDetail",
        agent,
      );
      const url = proposalTaskUrl(
        "https://example.test/?private=old#section",
        selection,
        "r",
        "solutionReviewDetail",
      );
      expect(readObjectLink(url.toString())).toEqual({
        projectId: "p",
        releaseId: "r",
        irId: "ir",
        task: "solutionReviewDetail",
        agent,
      });
      expect(url.searchParams.has("private")).toBe(false);
    },
  );
  it("rejects invalid task/agent combinations rather than showing a different reviewer", () => {
    const base = "https://example.test/?aireqProject=p&aireqRelease=r&aireqIr=ir";
    for (const query of [
      "&aireqTask=unknown",
      "&aireqTask=solution&aireqAgent=c",
      "&aireqTask=requirementsReviewDetail&aireqAgent=c",
      "&aireqTask=solutionReviewDetail&aireqAgent=missing",
    ])
      expect(readObjectLink(base + query)).toBe("invalid");
  });
  it("shows completion as awaiting human decision and invalidates stale confirmation", () => {
    const value = { ...group(), originalReview: review() };
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("待人工确认");
    expect(proposalNextTask(value)).toBe("requirementsReview");
    value.originalReview.passed = true;
    value.originalReview.humanDecision = {
      employeeId: "employee",
      decidedAt: "2026-11-17T01:00:00Z",
      reviewId: "review-1",
    };
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("已确认");
    value.files = [{ ...file, sha256: "changed" }];
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("需要重新评审");
  });
});

describe("promoted proposal navigation", () => {
  const link = {
    projectId: "p",
    releaseId: "r",
    irId: "ir",
    srId: "sr",
    task: "solutionReviewDetail" as const,
    agent: "c" as const,
  };
  it("keeps object identity but drops ended task and reviewer on formal reload", () => {
    const target = selectionFromObjectLink(link, true);
    expect(target).toEqual({ projectId: "p", irId: "ir", srId: "sr", formalView: "detail" });
    const url = formalObjectUrl(
      proposalTaskUrl("https://example.test/", target, "r", link.task).toString(),
      target,
      "r",
    );
    expect(readObjectLink(url)).toEqual({ projectId: "p", releaseId: "r", irId: "ir", srId: "sr" });
    expect(selectionFromObjectLink(link, false).reviewAgent).toBe("c");
  });
  it("normalizes only a promoted IR while preserving history and source", () => {
    const previous = {
      index: 3,
      extent: 4,
      mainView: "chat" as const,
      requirementView: "proposals" as const,
      requirementReturnView: "proposals" as const,
      proposalTask: link.task,
      overlay: null,
      overviewOrigin: { projectId: "p", releaseId: "r" },
    };
    const target = { projectId: "p", irId: "ir" };
    const next = formalProposalNavigation(previous, target, { groups: [group()] });
    expect(next).toEqual({
      ...previous,
      requirementView: "formal",
      requirementReturnView: null,
      proposalTask: "overview",
    });
    expect(formalProposalNavigation(previous, target, { groups: [] })).toBeNull();
    expect(
      formalProposalNavigation(previous, { projectId: "other", irId: "ir" }, { groups: [group()] }),
    ).toBeNull();
    expect(
      formalProposalNavigation({ ...previous, requirementView: "formal" }, target, {
        groups: [group()],
      }),
    ).toBeNull();
  });
});
