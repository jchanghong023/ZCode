import type { AIReqSelection, AIReqReviewAgentId, AIReqRequirementGroup } from "../contract.js";
import {
  proposalState,
  fullReviewBlocker,
  requirementsReviewInputs,
  hasCurrentProposalSolution,
  fullReviewCurrent,
  requirementsReviewCurrent,
  proposalVersion,
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
  "management",
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
  management: "管理需求",
};
export function restoreProposalTask(value: unknown, selection: AIReqSelection = {}): ProposalTask {
  return proposalTasks.find((task) => task === value) ?? proposalTaskFromSelection(selection);
}
export function proposalTaskFromSelection(selection: AIReqSelection): ProposalTask {
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
  base: AIReqSelection,
  task: ProposalTask,
  agent?: AIReqReviewAgentId,
  preserveSr = false,
): AIReqSelection {
  const target: AIReqSelection = { projectId: base.projectId, irId: base.irId };
  if (task === "overview" || task === "management") return target;
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
      return "solutionReview";
    case "solution-confirmation-pending":
      return fullReviewBlocker(group) ? "solutionReview" : "delivery";
    case "submission-pending":
    case "merge-pending":
      return "delivery";
    default:
      return "requirements";
  }
}
export function proposalTaskStatus(group: AIReqRequirementGroup, task: ProposalTask): string {
  if (task === "requirements") return requirementsReviewInputs(group) ? "已整理" : "待整理";
  if (task === "solution")
    return hasCurrentProposalSolution(group)
      ? "已完成"
      : [
            "solution-incomplete",
            "solution-review-pending",
            "solution-confirmation-pending",
            "submission-pending",
            "merge-pending",
          ].includes(proposalState(group) ?? "")
        ? "待完善"
        : "未开始";
  if (task === "delivery") {
    if (proposalState(group) === "merge-pending") return "待合入";
    if (fullReviewBlocker(group)) return "未开始";
    if (group.proposalDelivery && !proposalDeliveryCurrent(group)) return "需要重新确认";
    if (group.proposalDelivery?.pushedAt) return "已提交";
    const version = proposalVersion(group);
    const count = ["business", "development", "testing"].filter((perspective) =>
      group.alignment?.some(
        (entry) => entry.perspective === perspective && entry.version === version,
      ),
    ).length;
    return count ? `已确认 ${count} / 3` : "待确认";
  }
  const original = task === "requirementsReview";
  const review = original ? group.originalReview : group.review;
  if (!review) return "未开始";
  const current = original ? requirementsReviewCurrent(group) : fullReviewCurrent(group);
  if (!current) return "需要重新评审";
  if (review.passed && review.humanDecision?.reviewId === review.id) return "已确认";
  if (review.agents?.some((agent) => agent.status === "failed")) return "评审失败";
  if (review.findings?.some((finding) => finding.level === "blocking")) return "有待处理问题";
  const required = original ? ["a"] : ["a", "b", "c", "summary"];
  return required.every((id) =>
    review.agents?.some(
      (agent) => agent.id === id && agent.status === "completed" && agent.report.trim(),
    ),
  )
    ? "待人工确认"
    : "评审中";
}

/** 文案只解释公共八态及剩余动作，不保存业务状态或分派责任。 */
export function proposalTaskGuidance(group: AIReqRequirementGroup) {
  const state = proposalState(group);
  const returned = group.returnFeedback && !group.returnFeedback.resumedAt;
  const messages = {
    "not-started": {
      role: "业务",
      description: "先与业务 Agent 明确目标、范围和验收标准，形成需求文档。",
      action: "开始需求澄清",
    },
    "ir-review-pending": returned
      ? {
          role: "业务",
          description: "需求已退回。先在需求澄清中补充意见，再重新评审。",
          action: "处理退回意见",
        }
      : {
          role: "业务",
          description: "当前需求尚未通过有效评审，请发起评审或处理已有问题。",
          action: "查看需求评审",
        },
    "ir-confirmation-pending": {
      role: "人工确认",
      description: "业务评审已完成，请阅读意见并确认当前版本的需求。",
      action: "查看并确认需求",
    },
    "solution-incomplete": {
      role: "方案开发",
      description: "业务需求已确认，继续完善技术方案、开发任务和测试材料。",
      action: "继续完善方案",
    },
    "solution-review-pending": {
      role: "方案开发",
      description: "当前方案尚未通过完整审查，请发起审查或处理已有问题。",
      action: "查看方案审查",
    },
    "solution-confirmation-pending": fullReviewBlocker(group)
      ? {
          role: "人工确认",
          description: "完整审查已完成，请阅读独立审查意见并放行当前方案。",
          action: "查看并确认方案",
        }
      : {
          role: "业务、开发、测试",
          description: "完整方案已放行，还需三个视角分别确认当前材料。",
          action: "完成三方确认",
        },
    "submission-pending": {
      role: "提交人",
      description: "当前版本的审查与三方确认已完成，核对文件后提交文档 MR。",
      action: "核对文件并提交",
    },
    "merge-pending": {
      role: "MR 评审人／后台核验",
      description: "文档已提交。MR 合入并通过材料核验后，将自动转为正式需求。",
      action: "查看合入进展",
    },
  };
  return state
    ? messages[state]
    : { role: "只读", description: "提案已结束，请查看正式需求或历史记录。", action: "查看记录" };
}
