import type {
  AIReqReviewAgentId,
  AIReqRequirementGroup,
  AIReqWorkflowTarget,
} from "../contract.js";
import {
  proposalState,
  alignmentBlocker,
  fullReviewReadyBlocker,
  proposalReviewCanRetry,
  requirementsReviewReadyBlocker,
  requirementsReviewInputs,
  hasCurrentProposalSolution,
  fullReviewCurrent,
  requirementsReviewCurrent,
  proposalDeliveryCurrent,
} from "../contract.js";

export const proposalTasks = [
  "overview",
  "requirements",
  "requirementsReview",
  "requirementsReviewDetail",
  "solution",
  "solutionReview",
  "solutionReviewDetail",
  "delivery",
] as const;
export type ProposalTask = (typeof proposalTasks)[number];
export const proposalTaskTitles: Record<ProposalTask, string> = {
  overview: "需求工作台",
  requirements: "需求澄清",
  requirementsReview: "需求评审",
  requirementsReviewDetail: "需求评审详情",
  solution: "方案设计",
  solutionReview: "方案审查",
  solutionReviewDetail: "独立审查详情",
  delivery: "交付确认",
};
export function canOpenProposalTask(
  task: ProposalTask,
  roles: { development: boolean; testing: boolean },
): boolean {
  if (task === "solution" || task === "delivery") return roles.development;
  if (task === "solutionReviewDetail") return roles.development || roles.testing;
  return true;
}

export function restoreProposalTask(
  value: unknown,
  selection: AIReqWorkflowTarget = {},
): ProposalTask {
  return proposalTasks.find((task) => task === value) ?? proposalTaskFromSelection(selection);
}
export function proposalTaskFromSelection(selection: AIReqWorkflowTarget): ProposalTask {
  if (selection.reviewAgent)
    return selection.discussionPhase === "solution" || selection.proposalStep === "solution"
      ? "solutionReviewDetail"
      : "requirementsReviewDetail";
  if (selection.proposalStep === "intake") return "delivery";
  if (selection.proposalStep === "requirements-review") return "requirementsReview";
  if (
    selection.proposalStep === "solution" ||
    selection.discussionPhase === "solution" ||
    selection.srId
  )
    return "solution";
  if (selection.proposalStep === "requirements" || selection.discussionPhase === "requirements")
    return "requirements";
  return "overview";
}
/** 导航只映射既有阶段选择；任务页本身不进入服务端 DTO。 */
export function proposalTaskSelection(
  base: AIReqWorkflowTarget,
  task: ProposalTask,
  agent?: AIReqReviewAgentId,
  preserveSr = false,
): AIReqWorkflowTarget {
  const target: AIReqWorkflowTarget = { projectId: base.projectId, irId: base.irId };
  if (task === "overview") return target;
  if (
    task === "requirements" ||
    task === "requirementsReview" ||
    task === "requirementsReviewDetail"
  )
    return {
      ...target,
      proposalStep: task === "requirements" ? "requirements" : "requirements-review",
      discussionPhase: "requirements",
      ...(task === "requirementsReviewDetail" ? { reviewAgent: "a" } : {}),
    };
  return {
    ...target,
    proposalStep: task === "delivery" ? "intake" : "solution",
    discussionPhase: "solution",
    ...(task === "solutionReviewDetail" ? { reviewAgent: agent ?? "summary" } : {}),
    ...(task === "solution" && preserveSr && base.srId ? { srId: base.srId } : {}),
  };
}
export function proposalTaskParent(task: ProposalTask): ProposalTask {
  if (task === "requirementsReviewDetail") return "requirementsReview";
  if (task === "solutionReviewDetail") return "solutionReview";
  return "overview";
}

export function proposalNextTask(group: AIReqRequirementGroup): ProposalTask {
  // 八态是业务事实，任务是操作入口；不能用旧阶段字段决定下一步。
  switch (proposalState(group)) {
    case "ir-review-pending":
      return group.returnFeedback && !group.returnFeedback.resumedAt
        ? "requirements"
        : "requirementsReview";
    case "ir-confirmation-pending":
      return "requirementsReview";
    case "solution-incomplete":
      return "solution";
    case "solution-review-pending":
    case "solution-confirmation-pending":
      return "solutionReview";
    case "submission-pending":
    case "merge-pending":
      return "delivery";
    default:
      return "requirements";
  }
}
export function proposalTaskStatus(group: AIReqRequirementGroup, task: ProposalTask): string {
  if (task === "requirements")
    return group.requirementsCheck?.issues.length
      ? "校验失败"
      : requirementsReviewInputs(group)
        ? requirementsReviewCurrent(group)
          ? "已整理"
          : "待提交评审"
        : "待整理";
  if (task === "solution") {
    if (group.solutionCheck?.issues.length) return "校验失败";
    return hasCurrentProposalSolution(group)
      ? fullReviewCurrent(group)
        ? "已完成"
        : "待提交审查"
      : [
            "solution-incomplete",
            "solution-review-pending",
            "solution-confirmation-pending",
            "submission-pending",
            "merge-pending",
          ].includes(proposalState(group) ?? "")
        ? "待完善"
        : "未开始";
  }
  if (task === "delivery") {
    const state = proposalState(group);
    if (state === "merge-pending") return "待合入";
    if (state !== "submission-pending") return "未就绪";
    if (!proposalDeliveryCurrent(group)) return "待准备文件清单";
    return group.proposalDelivery?.publishError ? "提交失败" : "待提交";
  }
  const original = task === "requirementsReview";
  const review = original ? group.originalReview : group.review;
  const check = original ? group.requirementsCheck : group.solutionCheck;
  if (check?.issues.length) return "校验失败";
  const current = original ? requirementsReviewCurrent(group) : fullReviewCurrent(group);
  if (!review || !current) {
    const ready = original ? requirementsReviewInputs(group) : hasCurrentProposalSolution(group);
    return ready ? (original ? "待提交评审" : "待提交审查") : "等待材料校验";
  }
  if (proposalReviewCanRetry(group, !original)) return "评审失败";
  const blocker = original ? requirementsReviewReadyBlocker(group) : fullReviewReadyBlocker(group);
  if (blocker)
    return review.agents?.some((agent) => agent.status === "running") ? "评审中" : "等待评审";
  const confirmed = original
    ? review.passed &&
      review.humanDecision?.reviewId === review.id &&
      review.humanDecision.snapshotDigest === review.snapshotDigest
    : !alignmentBlocker(group);
  return confirmed ? "已确认" : "待人工确认";
}

/** 文案只解释公共八态及剩余动作，不保存业务状态或分派责任。 */
export function proposalTaskGuidance(group: AIReqRequirementGroup) {
  const state = proposalState(group);
  const returned = group.returnFeedback && !group.returnFeedback.resumedAt;
  const messages = {
    "not-started": returned
      ? {
          role: "业务",
          description:
            returned && group.returnFeedback?.reason.trim()
              ? "先根据退回意见完善需求文档，再提交评审。"
              : "先在需求澄清中完善需求文档，再提交评审。",
          action: "继续需求澄清",
        }
      : {
          role: "业务",
          description: requirementsReviewInputs(group)
            ? "需求文档已通过校验，请核对后提交评审。"
            : "先与业务 Agent 明确目标、范围和验收标准，形成需求文档。",
          action: requirementsReviewInputs(group) ? "前往提交需求评审" : "开始需求澄清",
        },
    "ir-review-pending": {
      role: "业务",
      description: proposalReviewCanRetry(group, false)
        ? "本轮需求评审失败，请查看原因并重试。"
        : "当前需求已提交评审，可查看运行状态。",
      action: "查看需求评审",
    },
    "ir-confirmation-pending": {
      role: "人工确认",
      description: "业务评审已完成，请阅读意见并确认当前版本的需求。",
      action: "查看并确认需求",
    },
    "solution-incomplete": {
      role: "方案开发",
      description: hasCurrentProposalSolution(group)
        ? "方案材料已通过校验，请核对后提交审查。"
        : "业务需求已确认，继续完善技术方案、实施说明和测试材料。",
      action: hasCurrentProposalSolution(group) ? "前往提交方案审查" : "继续完善方案",
    },
    "solution-review-pending": {
      role: "方案开发",
      description: proposalReviewCanRetry(group, true)
        ? "本轮方案审查失败，请查看原因并重试。"
        : "当前方案已提交审查，可查看三路审查和综合终审的状态。",
      action: "查看方案审查",
    },
    "solution-confirmation-pending": {
      role: "业务、开发、测试",
      description: "审查报告已齐备，请阅读报告，由尚未确认的角色分别确认当前版本。",
      action: "完成三方确认",
    },
    "submission-pending": {
      role: "提交人",
      description:
        group.proposalDelivery?.publishError && proposalDeliveryCurrent(group)
          ? "本次文档 PR 提交未完成。查看失败原因，继续提交同一候选。"
          : "三方确认已完成，核对完整文件清单并提交文档 PR。",
      action: "核对文件并提交",
    },
    "merge-pending": {
      role: "PR 评审人／后台核验",
      description: "文档 PR 已创建。合入并通过材料核验后，将自动转为正式需求。",
      action: "查看合入进展",
    },
  };
  return state
    ? messages[state]
    : { role: "只读", description: "提案已结束，请查看正式需求或历史记录。", action: "查看记录" };
}
