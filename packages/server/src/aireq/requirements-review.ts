import type { AIReqReviewScenario, InternalRequirementGroup } from "./internal-scenarios.js";
import {
  requirementsReviewInputs,
  requirementsReviewStartBlocker,
  requirementsReviewBlocker,
  requirementsReviewCurrent,
  fullReviewCurrent,
  hasCurrentProposalSolution,
  proposalReviewCanRetry,
  fileVersions,
  proposalVersion,
} from "@zcode/services/aireq";
import { readPrototypeAgentModelBinding } from "./agent-models.js";
import type {
  AIReqNativeSessionRef,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqReviewAgent,
  AIReqReviewAgentId,
  AIReqWorkflowView,
} from "@zcode/services/aireq";

function prototypeReviewModelBindings() {
  return (
    [
      "requirements-review-a",
      "requirements-review-b",
      "requirements-review-c",
      "solution-review-summary",
    ] as const
  ).map(readPrototypeAgentModelBinding);
}
export function prototypeReviewSessions(review: AIReqReview): AIReqNativeSessionRef[] {
  return (
    review.agents?.map((agent) => agent.session) ??
    ("projectId" in review.reviewer ? [review.reviewer] : [])
  );
}
/** Create a version-bound round; only historical seed facts start settled. */
export function createPrototypeRequirementsReview(
  group: AIReqRequirementGroup,
  employeeId: string,
  seedPassed = false,
  kind: "original" | "full" = "original",
  scenario: AIReqReviewScenario = "normal",
  settled = true,
): AIReqReview {
  const round =
    kind === "original"
      ? (group.originalReviewHistory?.length ?? 0) + 1
      : (group.reviewHistory?.length ?? 0) + 1;
  const inputFiles = kind === "original" ? (requirementsReviewInputs(group) ?? []) : group.files;
  const digest = kind === "original" ? fileVersions(inputFiles) : proposalVersion(group);
  const id = `sample-${kind}-review:${group.projectId}:${group.id}:${round}:${group.revision}`;
  const bindings =
    kind === "full"
      ? prototypeReviewModelBindings()
      : [readPrototypeAgentModelBinding("requirements-review")];
  const keys: AIReqReviewAgentId[] = kind === "full" ? ["a", "b", "c", "summary"] : ["a"];
  const names =
    kind === "full"
      ? ["需求覆盖／一致性", "技术方案／依赖", "任务可执行性／测试充分性", "综合终审"]
      : ["原始业务需求评审"];
  const agents: AIReqReviewAgent[] = keys.map((key, index) => ({
    id: key,
    name: names[index]!,
    status: key === "summary" ? "pending" : "running",
    report: "",
    promptSnapshot: bindings[index]!.promptSnapshot || undefined,
    session: {
      projectId: group.projectId,
      irId: group.id,
      sessionId: `${id}:${key}`,
      role: "reviewer",
      phase: kind === "full" ? "solution" : "requirements",
      modelConfig: bindings[index],
      round,
    },
  }));
  const review: AIReqReview = {
    id,
    kind,
    snapshotDigest: digest,
    inputFiles: structuredClone(inputFiles),
    passed: kind === "original" && seedPassed && scenario === "normal",
    agents,
    ...(kind === "original" && seedPassed && scenario === "normal"
      ? {
          humanDecision: {
            employeeId,
            decidedAt: new Date().toISOString(),
            reviewId: id,
            snapshotDigest: digest,
          },
        }
      : {}),
    modelConfig: bindings.at(-1),
    report: "",
    requestedBy: employeeId,
    round,
    reviewer: agents.at(-1)!.session,
    createdAt: new Date().toISOString(),
  };
  if (settled && scenario !== "hold") {
    if (advancePrototypeReview(review, scenario)) advancePrototypeReview(review, scenario);
  }
  return review;
}

/** Complete the admitted runs and start summary only after three readable, successful reports. */
export function advancePrototypeReview(
  review: AIReqReview,
  scenario: Exclude<AIReqReviewScenario, "hold">,
): boolean {
  const agents = review.agents ?? [];
  const summary = agents.find((agent) => agent.id === "summary");
  if (summary?.status === "running") {
    finishPrototypeReport(review, summary, scenario);
    review.report = summary.report;
    review.passed = scenario === "normal";
    return false;
  }
  for (const agent of agents) {
    if (agent.id === "summary" || agent.status !== "running") continue;
    if (scenario === "failed" && agent.id === "a") {
      agent.status = "failed";
      agent.report = "本路评审执行失败，请重试当前材料版本。";
    } else finishPrototypeReport(review, agent, scenario);
  }
  if (scenario === "blocked") {
    review.findings = [
      {
        id: `${review.id}:blocking`,
        level: "blocking",
        message: "建议补齐业务验收条件并核对方案材料。",
        documentPath: review.inputFiles?.[0]?.path ?? "",
      },
    ];
  }
  if (!summary) review.report = agents[0]?.status === "completed" ? agents[0].report : "";
  if (
    summary?.status === "pending" &&
    agents.length === 4 &&
    agents.every(
      (agent) => agent === summary || (agent.status === "completed" && agent.report.trim()),
    )
  ) {
    summary.status = "running";
    return true;
  }
  return false;
}

function finishPrototypeReport(
  review: AIReqReview,
  agent: AIReqReviewAgent,
  scenario: Exclude<AIReqReviewScenario, "hold">,
): void {
  agent.status = "completed";
  const opinion =
    scenario === "blocked"
      ? "建议补齐验收条件、核对材料。是否采纳由确认人判断。"
      : agent.id === "summary"
        ? "A、B、C 三份同版报告已齐备，未记录阻断项。"
        : "本路模拟评审已完成，未记录阻断项。";
  agent.report = `# ${agent.name}\n\n第 ${review.round} 轮模拟评审，输入 ${review.inputFiles?.length ?? 0} 份材料。\n\n## 评审意见\n\n${opinion}`;
}

export interface PrototypeReviewRun {
  projectId: string;
  irId: string;
  kind: "original" | "full";
  reviewId: string;
  snapshotDigest: string;
  scenario: Exclude<AIReqReviewScenario, "hold">;
}

/** Admit only from an explicit submission or retry, against the current material version. */
export function acceptPrototypeReview(
  state: AIReqWorkflowView,
  proposal: AIReqRequirementGroup,
  kind: "original" | "full",
  employeeId: string,
  retry = false,
): PrototypeReviewRun | undefined {
  const full = kind === "full";
  if (
    full
      ? requirementsReviewBlocker(proposal) || !hasCurrentProposalSolution(proposal)
      : requirementsReviewStartBlocker(proposal)
  )
    return;
  const current = full ? fullReviewCurrent(proposal) : requirementsReviewCurrent(proposal);
  if (current && (!retry || !proposalReviewCanRetry(proposal, full))) return;
  const prior = full ? proposal.review : proposal.originalReview;
  if (prior) {
    prior.invalidatedReason = current ? "已重新接纳本材料版本的评审" : "材料版本已变化";
    const history = full
      ? (proposal.reviewHistory ??= [])
      : (proposal.originalReviewHistory ??= []);
    history.push(prior);
  }
  const internal: InternalRequirementGroup = proposal;
  const scenario = internal.reviewScenarios?.[kind] ?? "normal";
  delete internal.reviewScenarios?.[kind];
  const review = createPrototypeRequirementsReview(
    proposal,
    employeeId,
    false,
    kind,
    scenario,
    false,
  );
  if (full) proposal.review = review;
  else proposal.originalReview = review;
  const sessions = prototypeReviewSessions(review);
  proposal.sessions.push(...sessions);
  state.sessions.push(...sessions);
  if (scenario === "hold") {
    (internal.heldReviews ??= []).push(review);
    return;
  }
  return {
    projectId: proposal.projectId,
    irId: proposal.id,
    kind,
    reviewId: review.id,
    snapshotDigest: review.snapshotDigest,
    scenario,
  };
}
