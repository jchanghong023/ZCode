import { describe, expect, it } from "vitest";
import { fileVersions } from "../../packages/services/src/aireq/index.js";
import {
  canOpenProposalTask,
  proposalTaskFromSelection,
  proposalTaskSelection,
  proposalTaskParent,
  restoreProposalTask,
  proposalNextTask,
  proposalTaskStatus,
  proposalTaskForTodo,
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
  requirementsCheck: { issues: [] },
  snapshot: {
    projectId: "p",
    irId: "ir",
    title: "需求",
    documentPath: file.path,
    srs: [],
    files: [{ ...file }],
    digest: "v1",
  },
  sessions: [],
  createdAt: "2026-11-17T00:00:00Z",
});
const review = (): AIReqReview => ({
  id: "review-1",
  kind: "original",
  snapshotDigest: fileVersions([file]),
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
        phase: "requirements",
        role: "reviewer",
        round: 1,
      },
    },
  ],
});

describe("independent proposal task navigation", () => {
  it("gives business users the shared solution report without opening restricted sessions", () => {
    const business = { development: false, testing: false };
    expect(canOpenProposalTask("solutionReview", business)).toBe(true);
    expect(canOpenProposalTask("solutionReviewDetail", business)).toBe(false);
    expect(canOpenProposalTask("solution", business)).toBe(false);
    expect(canOpenProposalTask("delivery", business)).toBe(false);
  });
  it("enters a workbench from an ordinary proposal entry", () => {
    expect(proposalTaskFromSelection({ projectId: "p", irId: "ir" })).toBe("overview");
    expect(proposalNextTask({ ...group(), files: [] })).toBe("requirements");
    expect(proposalNextTask(group())).toBe("requirements");
  });
  it("does not promote future delivery or legacy PR fields over current material facts", () => {
    const value = {
      ...group(),
      status: "requirements-pr" as const,
      proposalStage: "solution" as const,
    };
    expect(proposalNextTask(value)).toBe("requirements");
    expect(proposalTaskStatus(value, "delivery")).toBe("未就绪");
    value.files = [];
    expect(proposalNextTask(value)).toBe("requirements");
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
  it("lets a person confirm a readable review with negative findings and invalidates stale confirmation", () => {
    const value = { ...group(), originalReview: review() };
    value.originalReview.findings = [
      {
        id: "finding",
        level: "blocking",
        message: "验收标准有歧义",
        documentPath: file.path,
      },
    ];
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("待人工确认");
    expect(proposalNextTask(value)).toBe("requirementsReview");
    value.originalReview.passed = true;
    value.originalReview.humanDecision = {
      employeeId: "employee",
      decidedAt: "2026-11-17T01:00:00Z",
      reviewId: "review-1",
      snapshotDigest: value.originalReview.snapshotDigest,
    };
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("已确认");
    const replacement = { ...file, sha256: "changed" };
    value.files = [replacement];
    value.snapshot = { ...value.snapshot!, files: [replacement], digest: "changed" };
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("待提交评审");
  });
  it("distinguishes validation, waiting, running and failed reviews on the workbench", () => {
    const value = { ...group(), originalReview: review() };
    value.requirementsCheck = { issues: [{ path: file.path, reason: "缺少验收标准" }] };
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("校验失败");
    expect(proposalNextTask(value)).toBe("requirements");

    value.requirementsCheck = { issues: [] };
    const agent = value.originalReview.agents![0]!;
    agent.status = "pending";
    value.originalReview.report = "";
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("等待评审");
    agent.status = "running";
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("评审中");
    agent.status = "failed";
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("评审失败");
    agent.status = "completed";
    agent.report = "";
    expect(proposalTaskStatus(value, "requirementsReview")).toBe("评审失败");
  });

  it("opens the role confirmation, step retry and delivery pages from their todos", () => {
    expect(
      proposalTaskForTodo({ kind: "alignment", selection: { proposalStep: "solution" } }),
    ).toBe("solutionReview");
    expect(
      proposalTaskForTodo({ kind: "failure", selection: { proposalStep: "requirements-review" } }),
    ).toBe("requirementsReview");
    expect(proposalTaskForTodo({ kind: "failure", selection: { proposalStep: "solution" } })).toBe(
      "solutionReview",
    );
    expect(proposalTaskForTodo({ kind: "failure", selection: {} })).toBe("delivery");
    expect(proposalTaskForTodo({ kind: "publish", selection: {} })).toBe("delivery");
    expect(
      proposalTaskForTodo({ kind: "failure", srId: "sr", selection: { formalView: "detail" } }),
    ).toBeUndefined();
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
