import { proposalState } from "./domain.js";
import type { AIReqOperationReceipt, AIReqProposalState, AIReqRequirementGroup } from "./types.js";

export const PROPOSAL_STATE_OPTIONS = [
  { id: "not-started", title: "未启动", titleEn: "Not started" },
  { id: "ir-review-pending", title: "IR 待评审", titleEn: "IR review pending" },
  { id: "ir-confirmation-pending", title: "IR 待确认", titleEn: "IR confirmation pending" },
  { id: "solution-incomplete", title: "方案待完善", titleEn: "Solution incomplete" },
  { id: "solution-review-pending", title: "方案待评审", titleEn: "Solution review pending" },
  {
    id: "solution-confirmation-pending",
    title: "方案待确认",
    titleEn: "Solution confirmation pending",
  },
  { id: "submission-pending", title: "待提交", titleEn: "Submission pending" },
] as const satisfies readonly { id: AIReqProposalState; title: string; titleEn: string }[];

/** 筛选菜单按推进阶段分组（proposals spec）；组标题是展示标签，不是可筛选值，组内沿用状态定义顺序。 */
export const PROPOSAL_STATE_GROUPS = [
  {
    title: "需求确认",
    titleEn: "Requirement confirmation",
    ids: ["not-started", "ir-review-pending", "ir-confirmation-pending"],
  },
  {
    title: "方案确认",
    titleEn: "Solution confirmation",
    ids: ["solution-incomplete", "solution-review-pending", "solution-confirmation-pending"],
  },
  { title: "交付", titleEn: "Delivery", ids: ["submission-pending"] },
] as const satisfies readonly {
  title: string;
  titleEn: string;
  ids: readonly AIReqProposalState[];
}[];

/** 展示顺序仅用于进行中的提案。 */
export function proposalStateIndex(group: AIReqRequirementGroup): number {
  const state = proposalState(group);
  return PROPOSAL_STATE_OPTIONS.findIndex((option) => option.id === state);
}

export function proposalStateLabel(
  group: AIReqRequirementGroup,
  locale: "zh-CN" | "en-US" = "zh-CN",
): string {
  const option = PROPOSAL_STATE_OPTIONS.find((item) => item.id === proposalState(group));
  return option ? (locale === "en-US" ? option.titleEn : option.title) : "";
}

/** Only recorded workflow facts contribute; viewing a proposal never updates its order. */
export function proposalUpdatedTime(
  group: AIReqRequirementGroup,
  operations: AIReqOperationReceipt[],
): number {
  let latest = Date.parse(group.createdAt) || 0;
  const include = (value?: string) => {
    if (value) latest = Math.max(latest, Date.parse(value) || 0);
  };
  include(group.developerHandoff?.submittedAt);
  include(group.developerAcceptance?.acceptedAt);
  include(group.originalReview?.createdAt);
  for (const review of group.originalReviewHistory ?? []) include(review.createdAt);
  include(group.review?.createdAt);
  for (const review of group.reviewHistory ?? []) include(review.createdAt);
  for (const supplement of group.requirementSupplements ?? []) include(supplement.createdAt);
  include(group.returnFeedback?.returnedAt);
  include(group.returnFeedback?.resumedAt);
  for (const feedback of group.returnFeedbackHistory ?? []) {
    include(feedback.returnedAt);
    include(feedback.resumedAt);
  }
  include(group.proposalSolution?.generatedAt);
  include(group.proposalDelivery?.confirmedAt);
  for (const delivery of group.proposalDeliveryHistory ?? []) {
    include(delivery.confirmedAt);
  }
  include(group.archive?.archivedAt);
  for (const revision of group.proposalRevisions ?? []) {
    include(revision.startedAt);
    include(revision.completedAt);
    include(revision.archive.archivedAt);
    include(revision.delivery?.confirmedAt);
    include(revision.review?.createdAt);
  }
  for (const operation of operations) {
    if (operation.irId !== group.id && !operation.irIds?.includes(group.id)) continue;
    include(operation.startedAt);
    include(operation.completedAt);
    for (const step of operation.steps) include(step.at);
  }
  return latest;
}
