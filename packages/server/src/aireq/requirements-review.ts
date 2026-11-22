import type {
  NativeSessionRef,
  RequirementGroup,
  Review,
  ReviewAgent,
  WorkflowState,
} from "./workflow-state.js";
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
import type { AIReqReviewAgentId } from "@zcode/services/aireq";

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
export function prototypeReviewSessions(review: Review): NativeSessionRef[] {
  return (
    review.agents?.map((agent) => agent.session) ??
    ("projectId" in review.reviewer ? [review.reviewer] : [])
  );
}
/** Create a version-bound round; only historical seed facts start settled. */
export function createPrototypeRequirementsReview(
  group: RequirementGroup,
  employeeId: string,
  kind: "original" | "full",
  seed?: "confirmed" | "reviewed" | "failed",
): Review {
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
  const agents: ReviewAgent[] = keys.map((key, index) => ({
    id: key,
    name: names[index]!,
    status: key === "summary" ? "pending" : "running",
    report: "",
    session: {
      projectId: group.projectId,
      irId: group.id,
      sessionId: `${id}:${key}`,
      role: "reviewer",
      phase: kind === "full" ? "solution" : "requirements",
      ...bindings[index]!,
      round,
    },
  }));
  const confirmed = kind === "original" && seed === "confirmed";
  const review: Review = {
    id,
    kind,
    snapshotDigest: digest,
    inputFiles: structuredClone(inputFiles),
    passed: confirmed,
    agents,
    ...(confirmed
      ? {
          humanDecision: {
            employeeId,
            decidedAt: new Date().toISOString(),
            reviewId: id,
            snapshotDigest: digest,
          },
        }
      : {}),
    modelConfig: bindings.at(-1)?.modelConfig,
    report: "",
    requestedBy: employeeId,
    round,
    reviewer: agents.at(-1)!.session,
    createdAt: new Date().toISOString(),
  };
  if (seed === "failed") {
    agents[0]!.status = "failed";
    agents[0]!.report = "本路评审执行失败，请重试当前材料版本。";
  }
  if (seed && advancePrototypeReview(review)) advancePrototypeReview(review);
  return review;
}

/** Complete the admitted runs and start summary only after three readable, successful reports. */
export function advancePrototypeReview(review: Review): boolean {
  const agents = review.agents ?? [];
  const summary = agents.find((agent) => agent.id === "summary");
  if (summary?.status === "running") {
    finishPrototypeReport(review, summary);
    review.report = summary.report;
    review.passed = true;
    return false;
  }
  for (const agent of agents) {
    if (agent.id !== "summary" && agent.status === "running") {
      finishPrototypeReport(review, agent);
    }
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

function finishPrototypeReport(review: Review, agent: ReviewAgent): void {
  agent.status = "completed";
  const opinion =
    agent.id === "summary"
      ? "三份针对同一材料版本的审查报告已齐备。请核对需求覆盖、技术与依赖、任务与测试的意见。"
      : "此项模拟评审已完成。请人工核对材料内容。";
  agent.report = `# ${agent.name}\n\n## 评审意见\n\n${opinion}\n\n第 ${review.round} 轮模拟评审，输入 ${review.inputFiles?.length ?? 0} 份材料。`;
}

export interface PrototypeReviewRun {
  projectId: string;
  irId: string;
  kind: "original" | "full";
  reviewId: string;
  snapshotDigest: string;
}

/** Admit only from an explicit submission or retry, against the current material version. */
export function acceptPrototypeReview(
  state: WorkflowState,
  proposal: RequirementGroup,
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
  const review = createPrototypeRequirementsReview(proposal, employeeId, kind);
  if (full) proposal.review = review;
  else proposal.originalReview = review;
  const sessions = prototypeReviewSessions(review);
  proposal.sessions.push(...sessions);
  state.sessions.push(...sessions);
  return {
    projectId: proposal.projectId,
    irId: proposal.id,
    kind,
    reviewId: review.id,
    snapshotDigest: review.snapshotDigest,
  };
}
