import { businessRule } from "./errors.js";
import { consumePrototypeMrCreationFailure } from "./recovery.js";
import {
  proposalVersion,
  proposalDeliveryCurrent,
  hasCurrentProposalSolution,
  alignmentBlocker,
} from "@zcode/services/aireq";
import { proposalDependencyMaterialIssue } from "@zcode/services/aireq";
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
import type {
  AIReqWorkflowCommand,
  AIReqRequirementGroup,
  AIReqWorkflowView,
} from "@zcode/services/aireq";

export type PrototypeProposalDeliveryAction = Extract<
  AIReqAction,
  {
    type:
      | "confirmProposal"
      | "publishProposal"
      | "markRequirementsPrSubmitted"
      | "markRequirementsMerged";
  }
>;

export function isPrototypeProposalDeliveryAction(
  action: AIReqAction,
): action is PrototypeProposalDeliveryAction {
  return [
    "confirmProposal",
    "publishProposal",
    "markRequirementsPrSubmitted",
    "markRequirementsMerged",
  ].includes(action.type);
}

let mrNumber = 100;
/** 演示交付只记录编号与状态；没有代码托管服务提供的真实URL时不返回链接。 */
export function ensurePrototypeProposalMr(group: AIReqRequirementGroup): void {
  const delivery = group.proposalDelivery;
  if (!delivery?.pushedAt) throw businessRule("推送当前材料后才能创建 MR。");
  if (group.requirementsPr?.number && delivery.prCandidate === delivery.candidate) return;
  if (consumePrototypeMrCreationFailure(delivery.candidate))
    throw businessRule("分支已推送，但创建 MR 失败，请重试当前版本。");
  const handoff = readPrototypeProposalPrHandoff(group);
  const number = ++mrNumber;
  group.requirementsPr = {
    number,
    status: "opened",
    title: `[需求] ${group.title}`,
    body: [
      "## 需求与方案",
      `IR：${group.id} · ${group.title}`,
      `候选：${delivery.candidate}`,
      `来源分支：${handoff.branch}`,
      `目标分支：${handoff.targetBranch}`,
      "",
      "## 文档清单",
      ...delivery.files.map((file) => `- ${file.path}`),
      "",
      "请人工评审并合并 MR；后台定时核验实际合入与材料完整性，满足后自动转正。",
    ].join("\n"),
    sourceBranch: handoff.branch,
    targetBranch: handoff.targetBranch,
    recordedAt: delivery.pushedAt,
    platformVerified: false,
  };
  delivery.prCandidate = delivery.candidate;
}
export function validatePrototypeProposalDeliveryAction(
  view: AIReqWorkflowView,
  group: AIReqRequirementGroup,
  action: PrototypeProposalDeliveryAction,
): void {
  const blocker = alignmentBlocker(group);
  if (blocker) throw businessRule(blocker);
  const dependencyIssue = proposalDependencyMaterialIssue(group, view.materials);
  if (dependencyIssue) throw businessRule(dependencyIssue);
  if (group.proposalStage !== "solution" || !hasCurrentProposalSolution(group))
    throw businessRule("请先完成当前需求版本的方案。");
  const handoff = readPrototypeProposalPrHandoff(group);
  if (!handoff.ready) throw businessRule(handoff.blockers.join("；"));
  if (
    !group.files.every((file) =>
      view.materials.some(
        (material) =>
          material.projectId === group.projectId &&
          material.irId === group.id &&
          material.path === file.path &&
          material.sha256 === file.sha256 &&
          material.size === file.size &&
          material.valid &&
          material.content !== undefined &&
          !material.error,
      ),
    )
  )
    throw businessRule("当前提案材料缺失、读取失败或版本不一致，不能确认、推送或核验合并。");
  if (action.type === "confirmProposal") {
    if (group.status !== "solution-ready" || action.version !== proposalVersion(group))
      throw businessRule("确认页面对应旧版本，请重新查看当前 IR、全部 SR 与方案后确认。");
    return;
  }
  const delivery = group.proposalDelivery;
  if (!delivery || !proposalDeliveryCurrent(group) || action.candidate !== delivery.candidate)
    throw businessRule("提案版本已变化，旧确认、推送与 PR 已失效，请重新确认当前版本。");
  if (action.type === "publishProposal") {
    if (!["solution-ready", "requirements-pr"].includes(group.status))
      throw businessRule("请先确认当前材料，再提交推送并自动创建 MR。");
    return;
  }
  if (action.type === "markRequirementsPrSubmitted")
    throw businessRule("MR 由平台自动创建并记录，不接受手工登记地址。");
  if (delivery.pushedCandidate !== action.candidate)
    throw businessRule("请先提交推送并自动创建当前候选的 MR。");

  if (
    group.status !== "requirements-pr" ||
    !group.requirementsPr ||
    delivery.prCandidate !== action.candidate ||
    !action.defaultBranchFilesConfirmed
  )
    throw businessRule("须按当前候选、MR 合入结果和完整文件版本定时核验，才能正式入库。");
}

type AIReqAction = AIReqWorkflowCommand extends infer C
  ? C extends AIReqWorkflowCommand
    ? Omit<C, "operationId" | "expectedRevision">
    : never
  : never;
