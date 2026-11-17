import {
  fullReviewCurrent,
  fullReviewReadyBlocker,
  proposalDeliveryCurrent,
  proposalState,
  requirementsReviewCurrent,
  requirementsReviewReadyBlocker,
} from "./domain.js";
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
  { id: "merge-pending", title: "待合入", titleEn: "Merge pending" },
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
  { title: "交付", titleEn: "Delivery", ids: ["submission-pending", "merge-pending"] },
] as const satisfies readonly {
  title: string;
  titleEn: string;
  ids: readonly AIReqProposalState[];
}[];

/** 顺序只用于展示，不是持久化状态，也不把正式需求当作第九态。 */
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

/** 等待并非错误；只有当前交付的失败事实需要额外提示。 */
export function proposalNeedsAttention(group: AIReqRequirementGroup): boolean {
  if (!proposalDeliveryCurrent(group) || !group.proposalDelivery?.pushedAt) return false;
  if (!proposalState(group)) return false;
  const status = group.proposalDelivery.mergeCheck?.status;
  return !group.requirementsPr || status === "failed" || status === "incomplete";
}

/** 状态以外的执行或阻断提示，不另建业务阶段，也不沿用失效评审。 */
export function proposalProcessingHint(group: AIReqRequirementGroup): string {
  const state = proposalState(group);
  if (!state || state === "not-started") return "";
  if (group.returnFeedback && !group.returnFeedback.resumedAt) return "待业务补充退回意见";
  if (proposalNeedsAttention(group)) return "交付失败或材料不完整，需要处理";
  const original = state === "ir-review-pending" || state === "ir-confirmation-pending";
  const review = original ? group.originalReview : group.review;
  const current = original ? requirementsReviewCurrent(group) : fullReviewCurrent(group);
  if (current && review?.agents?.some((agent) => agent.status === "failed"))
    return "评审执行失败，请处理后重试";
  if (current && review?.agents?.some((agent) => ["running", "pending"].includes(agent.status)))
    return "评审执行中";
  if (state === "ir-review-pending" && group.originalReview)
    return requirementsReviewReadyBlocker(group) ?? "";
  if (state === "solution-review-pending" && group.review)
    return fullReviewReadyBlocker(group) ?? "";
  return "";
}

export function proposalCreatedTime(group: AIReqRequirementGroup): number {
  return Date.parse(group.createdAt) || 0;
}

/** Only recorded workflow facts contribute; viewing a proposal never updates its order. */
export function proposalUpdatedTime(
  group: AIReqRequirementGroup,
  operations: AIReqOperationReceipt[],
): number {
  let latest = proposalCreatedTime(group);
  const include = (value?: string) => {
    if (value) latest = Math.max(latest, Date.parse(value) || 0);
  };
  include(group.developerHandoff?.submittedAt);
  include(group.developerAcceptance?.acceptedAt);
  include(group.originalReview?.createdAt);
  for (const review of group.originalReviewHistory ?? []) include(review.createdAt);
  include(group.review?.createdAt);
  for (const review of group.reviewHistory ?? []) include(review.createdAt);
  for (const decision of group.requirementsDecisions ?? []) {
    include(decision.createdAt);
    include(decision.review.createdAt);
  }
  for (const supplement of group.requirementSupplements ?? []) include(supplement.createdAt);
  include(group.returnFeedback?.returnedAt);
  include(group.returnFeedback?.resumedAt);
  for (const feedback of group.returnFeedbackHistory ?? []) {
    include(feedback.returnedAt);
    include(feedback.resumedAt);
  }
  include(group.proposalSolution?.generatedAt);
  include(group.confirmation?.confirmedAt);
  include(group.proposalDelivery?.confirmedAt);
  include(group.proposalDelivery?.pushedAt);
  for (const delivery of group.proposalDeliveryHistory ?? []) {
    include(delivery.confirmedAt);
    include(delivery.pushedAt);
  }
  include(group.requirementsPr?.recordedAt);
  include(group.merge?.checkedAt);
  for (const revision of group.proposalRevisions ?? []) {
    include(revision.startedAt);
    include(revision.completedAt);
    include(revision.merge.checkedAt);
    include(revision.requirementsPr?.recordedAt);
    include(revision.delivery?.confirmedAt);
    include(revision.delivery?.pushedAt);
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
