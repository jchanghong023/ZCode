import { describe, expect, it } from "vitest";
import {
  PROPOSAL_STATE_OPTIONS,
  fileVersions,
  proposalReviewCanRetry,
  proposalState,
  proposalStateIndex,
  proposalStateLabel,
  proposalVersion,
  proposalProgressIndex,
  proposalViewedIndex,
  conversationReadOnlyReason,
  type AIReqFileVersion,
  type AIReqRequirementGroup,
  type AIReqReview,
  type AIReqReviewAgentId,
} from "../../packages/services/src/aireq/index.js";

const at = "2026-11-17T00:00:00.000Z";
const employeeId = "s00000001";
function file(path: string, sha256 = "current-content"): AIReqFileVersion {
  return { path, sha256, size: 24 };
}
function emptyProposal(): AIReqRequirementGroup {
  return {
    id: "ir-export",
    projectId: "project-export",
    releaseId: "release-export",
    title: "导出当前版本的原始需求",
    originalText: "导出当前版本的原始需求，特殊字符往返无损。",
    submittedBy: employeeId,
    documentPath: "docs/requirements/ir-export/requirements.md",
    origin: "local",
    status: "draft",
    proposalStage: "requirements",
    revision: 1,
    srIds: [],
    files: [],
    sessions: [],
    createdAt: at,
  };
}
function withIR(): AIReqRequirementGroup {
  const group = emptyProposal();
  group.requirementsCheck = { issues: [] };
  group.files = [file(group.documentPath)];
  group.snapshot = {
    version: 1,
    projectId: group.projectId,
    irId: group.id,
    title: group.title,
    documentPath: group.documentPath,
    srs: [],
    files: structuredClone(group.files),
    digest: "business-document-version",
  };
  return group;
}
function review(group: AIReqRequirementGroup, kind: "original" | "full"): AIReqReview {
  const ids: AIReqReviewAgentId[] = kind === "original" ? ["a"] : ["a", "b", "c", "summary"];
  const session = {
    projectId: group.projectId,
    irId: group.id,
    sessionId: "session-review",
    sessionFile: "review.jsonl",
    role: "reviewer" as const,
    phase: kind === "original" ? ("requirements" as const) : ("solution" as const),
    round: 1,
  };
  const inputFiles =
    kind === "original"
      ? group.files.filter((row) => row.path === group.documentPath)
      : group.files;
  return {
    id: `${kind}-review-current`,
    kind,
    snapshotDigest: kind === "original" ? fileVersions(inputFiles) : proposalVersion(group),
    inputFiles: structuredClone(inputFiles),
    passed: false,
    report: "已检查目标、范围与验收标准；无阻断问题。",
    agents: ids.map((id) => ({
      id,
      name: `评审 ${id}`,
      status: "completed",
      report: "当前版本检查完成，无阻断。",
      session,
    })),
    reviewer: session,
    createdAt: at,
  };
}
function decide(current: AIReqReview): void {
  current.passed = true;
  current.humanDecision = {
    employeeId,
    decidedAt: at,
    reviewId: current.id,
    snapshotDigest: current.snapshotDigest,
  };
}
function withOriginalReview(): AIReqRequirementGroup {
  const group = withIR();
  group.originalReview = review(group, "original");
  return group;
}
function withOriginalApproval(): AIReqRequirementGroup {
  const group = withOriginalReview();
  decide(group.originalReview!);
  group.proposalStage = "solution";
  return group;
}
function withPendingOriginalReview(): AIReqRequirementGroup {
  const group = withOriginalReview();
  group.originalReview!.agents![0]!.status = "pending";
  return group;
}
function withSolution(): AIReqRequirementGroup {
  const group = withOriginalApproval();
  group.solutionCheck = { issues: [] };
  const srId = "sr-export";
  group.srIds = [srId];
  group.proposalSolution = {
    path: `openspec/changes/${srId}/design.md`,
    employeeId,
    generatedAt: at,
    round: 1,
    valid: true,
    requirementsDigest: group.snapshot!.digest,
  };
  group.files.push(
    file(`docs/requirements/${group.id}/sr-dependencies.json`),
    ...["proposal.md", "design.md", "tasks.md", `specs/${srId}/spec.md`, "test-plan.md"].map(
      (name) => file(`openspec/changes/${srId}/${name}`),
    ),
  );
  group.srDependencyFile = {
    ...group.files[1]!,
    projectId: group.projectId,
    irId: group.id,
    kind: "solution",
    valid: true,
    round: 1,
    content: JSON.stringify({
      srs: [
        { srId, estimate: { workingDays: 2, assumptions: "复用当前导出接口" }, prerequisites: [] },
      ],
    }),
  };
  group.snapshot!.files = structuredClone(group.files);
  group.snapshot!.srs = [
    { id: srId, title: "导出需求", documentPath: `openspec/changes/${srId}/proposal.md` },
  ];
  return group;
}
function withFullReview(): AIReqRequirementGroup {
  const group = withSolution();
  group.review = review(group, "full");
  return group;
}
function aligned(): AIReqRequirementGroup {
  const group = withFullReview();
  group.alignment = (["business", "development", "testing"] as const).map((perspective) => ({
    perspective,
    version: proposalVersion(group),
    reviewId: group.review!.id,
    snapshotDigest: group.review!.snapshotDigest,
    employeeId,
    confirmedAt: at,
  }));
  return group;
}
function withPendingFullReview(): AIReqRequirementGroup {
  const group = withFullReview();
  group.review!.agents![0]!.status = "pending";
  return group;
}
function published(): AIReqRequirementGroup {
  const group = aligned();
  group.proposalDelivery = {
    candidate: "candidate-current",
    version: proposalVersion(group),
    files: structuredClone(group.files),
    confirmedBy: employeeId,
    confirmedAt: at,
    pushedCandidate: "candidate-current",
    pushedAt: at,
    prCandidate: "candidate-current",
    branch: { name: "proposal/ir-export", baseCommit: "base-main", createdAt: at, pushedAt: at },
  };
  group.requirementsPr = {
    number: 42,
    sourceBranch: "proposal/ir-export",
    targetBranch: "main",
    recordedAt: at,
    platformVerified: false,
    status: "opened",
  };
  group.status = "requirements-pr";
  return group;
}

describe("proposal business states from current materials and confirmations", () => {
  it.each(
    (
      [
        [emptyProposal, "not-started", "未启动", 0],
        [withIR, "not-started", "未启动", 0],
        [withPendingOriginalReview, "ir-review-pending", "IR 待评审", 1],
        [withOriginalReview, "ir-confirmation-pending", "IR 待确认", 2],
        [withOriginalApproval, "solution-incomplete", "方案待完善", 3],
        [withSolution, "solution-incomplete", "方案待完善", 3],
        [withPendingFullReview, "solution-review-pending", "方案待评审", 4],
        [withFullReview, "solution-confirmation-pending", "方案待确认", 5],
        [aligned, "submission-pending", "待提交", 6],
        [published, "merge-pending", "待合入", 7],
      ] as const
    ).map(([build, state, title, index]) => ({ build, state, title, index })),
  )("derives $state from current facts", ({ build, state, title, index }) => {
    const group = build();
    expect(proposalState(group)).toBe(state);
    expect(proposalStateLabel(group)).toBe(title);
    expect(proposalStateIndex(group)).toBe(index);
  });

  it("offers exactly eight stable filters and no formal terminal option", () => {
    expect(PROPOSAL_STATE_OPTIONS.map(({ id }) => id)).toEqual([
      "not-started",
      "ir-review-pending",
      "ir-confirmation-pending",
      "solution-incomplete",
      "solution-review-pending",
      "solution-confirmation-pending",
      "submission-pending",
      "merge-pending",
    ]);
    expect(PROPOSAL_STATE_OPTIONS.every(({ titleEn }) => titleEn.trim())).toBe(true);
  });

  it("does not treat coarse storage status or a selected historical workspace as business progress", () => {
    const group = emptyProposal();
    group.status = "requirements-pr";
    group.proposalStage = "solution";
    expect(proposalState(group)).toBe("not-started");
    const current = published();
    const saved = structuredClone(current);
    expect(proposalViewedIndex(current, { proposalStep: "requirements" })).toBe(0);
    expect(proposalProgressIndex(current)).toBe(3);
    expect(proposalState(current)).toBe("merge-pending");
    expect(current).toEqual(saved);
  });

  it("keeps a returned proposal in editable business discussion until its supplement is resumed", () => {
    const group = withFullReview();
    group.originalReviewHistory = [group.originalReview!];
    group.originalReview = undefined;
    group.requirementsCheck = undefined;
    group.proposalStage = "requirements";
    group.returnFeedback = {
      employeeId,
      returnedAt: at,
      round: 1,
      reason: "补充特殊字符与空结果的验收边界",
    };
    const view = { drafts: [group] };
    const selection = { projectId: group.projectId, irId: group.id };
    expect(proposalState(group)).toBe("not-started");
    expect(proposalProgressIndex(group)).toBe(0);
    expect(proposalViewedIndex(group, selection)).toBe(0);
    expect(conversationReadOnlyReason(view, selection)).toBeUndefined();
    expect(
      conversationReadOnlyReason(view, {
        ...selection,
        proposalStep: "requirements",
        discussionPhase: "requirements",
      }),
    ).toBeUndefined();
    expect(
      conversationReadOnlyReason(view, {
        ...selection,
        proposalStep: "requirements-review",
        discussionPhase: "requirements",
      }),
    ).toBe("正在查看历史阶段，仅供只读查看。");
    expect(group.originalReviewHistory[0]!.humanDecision).toBeDefined();
  });

  it.each(["projectId", "irId", "documentPath"] as const)(
    "rejects a snapshot for another %s",
    (key) => {
      const group = withIR();
      group.snapshot![key] = "another-object";
      expect(proposalState(group)).toBe("not-started");
    },
  );

  it("requires a current nonempty IR file matching the snapshot", () => {
    const group = withIR();
    group.files[0]!.sha256 = "changed-but-not-snapshotted";
    expect(proposalState(group)).toBe("not-started");
    const empty = withIR();
    empty.files[0]!.size = 0;
    empty.snapshot!.files[0]!.size = 0;
    expect(proposalState(empty)).toBe("not-started");
  });

  it.each(["failed", "running", "pending"] as const)(
    "does not confuse an original review agent %s with completed review",
    (status) => {
      const group = withOriginalReview();
      group.originalReview!.agents![0]!.status = status;
      expect(proposalState(group)).toBe("ir-review-pending");
      expect(proposalReviewCanRetry(group, false)).toBe(status === "failed");
    },
  );

  it.each(["report", "agentReport", "wrongReview", "wrongDigest"] as const)(
    "requires readable IR reports and matching confirmation: %s",
    (field) => {
      const group = withOriginalApproval();
      if (field === "report") group.originalReview!.report = "  ";
      if (field === "agentReport") group.originalReview!.agents![0]!.report = "";
      if (field === "wrongReview")
        group.originalReview!.humanDecision!.reviewId = "previous-review";
      if (field === "wrongDigest")
        group.originalReview!.humanDecision!.snapshotDigest = "previous-input";
      const missingReport = field === "report" || field === "agentReport";
      expect(proposalState(group)).toBe(
        missingReport ? "ir-review-pending" : "ir-confirmation-pending",
      );
      expect(proposalReviewCanRetry(group, false)).toBe(missingReport);
    },
  );

  it("lets people confirm complete reports even when the agents found blocking issues", () => {
    const ir = withOriginalReview();
    const solution = withFullReview();
    const findings = [
      {
        id: "range",
        level: "blocking" as const,
        message: "范围未明确",
        documentPath: ir.documentPath,
      },
    ];
    ir.originalReview!.findings = findings;
    solution.review!.findings = findings;
    expect(proposalState(ir)).toBe("ir-confirmation-pending");
    expect(proposalState(solution)).toBe("solution-confirmation-pending");
    expect(proposalReviewCanRetry(ir, false)).toBe(false);
    expect(proposalReviewCanRetry(solution, true)).toBe(false);
  });

  it("allows a missing lane report to be retried when summary could not start", () => {
    const group = withFullReview();
    group.review!.agents![0]!.report = "";
    group.review!.agents!.find((agent) => agent.id === "summary")!.status = "pending";
    group.review!.report = "";
    expect(proposalState(group)).toBe("solution-review-pending");
    expect(proposalReviewCanRetry(group, true)).toBe(true);
  });

  it("returns to clarification when the business document changes", () => {
    const group = aligned();
    group.files.find((row) => row.path === group.documentPath)!.sha256 = "new-business-document";
    group.snapshot!.files = structuredClone(group.files);
    group.snapshot!.digest = "new-business-version";
    expect(proposalState(group)).toBe("not-started");
  });

  it("requires all solution files, including the test plan, and matching dependency material", () => {
    const missing = withSolution();
    missing.files = missing.files.filter((row) => !row.path.endsWith("test-plan.md"));
    missing.snapshot!.files = structuredClone(missing.files);
    expect(proposalState(missing)).toBe("solution-incomplete");
    const changed = withSolution();
    changed.srDependencyFile!.sha256 = "other-dependency-file";
    expect(proposalState(changed)).toBe("solution-incomplete");
  });

  it("requires the three role records for the current report but no separate full approval", () => {
    expect(proposalState(withFullReview())).toBe("solution-confirmation-pending");
    const group = aligned();
    const testing = group.alignment!.pop()!;
    expect(proposalState(group)).toBe("solution-confirmation-pending");
    group.alignment!.push({ ...testing, reviewId: "previous-review" });
    expect(proposalState(group)).toBe("solution-confirmation-pending");
    group.alignment![2] = testing;
    expect(proposalState(group)).toBe("submission-pending");
  });

  it("invalidates the full review on changed solution material without losing original approval", () => {
    const group = aligned();
    group.files.find((row) => row.path.endsWith("test-plan.md"))!.sha256 = "new-test-plan";
    group.snapshot!.files = structuredClone(group.files);
    expect(proposalState(group)).toBe("solution-incomplete");
    expect(group.originalReview!.humanDecision!.reviewId).toBe(group.originalReview!.id);
  });

  it("rejects a full review whose claimed version matches but whose input file versions do not", () => {
    const group = withFullReview();
    group.review!.inputFiles![0]!.sha256 = "previous-file";
    expect(proposalState(group)).toBe("solution-incomplete");
  });

  it("does not treat a successful push as a created PR", () => {
    const group = published();
    group.requirementsPr = undefined;
    group.proposalDelivery!.prCandidate = undefined;
    expect(proposalState(group)).toBe("submission-pending");
  });

  it.each(["candidate", "branch", "closed", "files"] as const)(
    "does not wait for merge with mismatching %s facts",
    (condition) => {
      const group = published();
      if (condition === "candidate") group.proposalDelivery!.prCandidate = "old-candidate";
      if (condition === "branch") group.requirementsPr!.sourceBranch = "another-branch";
      if (condition === "closed") group.requirementsPr!.status = "closed";
      if (condition === "files") group.proposalDelivery!.files.pop();
      expect(proposalState(group)).toBe("submission-pending");
    },
  );

  it("waits for verified intake even if the provider already reports a merged PR", () => {
    const group = published();
    group.requirementsPr!.status = "merged";
    expect(proposalState(group)).toBe("merge-pending");
  });

  it.each(["formal", "frozen", "deleted"] as const)(
    "excludes %s IRs from all proposal statuses",
    (status) => {
      const group = published();
      group.status = status;
      expect(proposalState(group)).toBeUndefined();
      expect(proposalStateLabel(group)).toBe("");
      expect(proposalStateIndex(group)).toBe(-1);
    },
  );
});
