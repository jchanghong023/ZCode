import { businessRule } from "./errors.js";
import { consumePrototypeMrCreationFailure } from "./recovery.js";
import {
  aiReqPrFactSchema,
  proposalVersion,
  proposalState,
  proposalDeliveryCurrent,
  hasCurrentProposalSolution,
  alignmentBlocker,
} from "@zcode/services/aireq";
import { proposalDependencyMaterialIssue } from "@zcode/services/aireq";
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
import { freezePrototypeRequirement } from "./requirement-freeze.js";
import type { AIReqAction, AIReqRequirementGroup, AIReqWorkflowView } from "@zcode/services/aireq";
import type {
  InternalWorkflowAction,
  InternalProposalDelivery,
  InternalRequirementGroup,
  AIReqProposalMergeScenario,
} from "./internal-scenarios.js";

type PrototypeProposalDeliveryAction = Extract<
  AIReqAction,
  { type: "confirmProposal" | "publishProposal" }
>;

export function isPrototypeProposalDeliveryAction(
  action: InternalWorkflowAction,
): action is PrototypeProposalDeliveryAction {
  return ["confirmProposal", "publishProposal"].includes(action.type);
}

let mrNumber = 100;
const NORMAL_MR_OPEN_WINDOW_MS = 10_000;

/** 正常内存 MR 依赖的生命周期，候选与编号共同绑定；不由浏览器驱动模拟时钟。 */
export function beginPrototypeProposalMrLifecycle(group: AIReqRequirementGroup): void {
  const delivery = group.proposalDelivery as InternalProposalDelivery | undefined;
  const mr = group.requirementsPr;
  if (!delivery?.pushedAt || !mr?.number) throw businessRule("文档 MR 发布事实不完整。");
  if (
    delivery.simulatedMr?.candidate === delivery.candidate &&
    delivery.simulatedMr.number === mr.number
  )
    return;
  const openedAt = new Date().toISOString();
  delivery.simulatedMr = {
    candidate: delivery.candidate,
    number: mr.number,
    openedAt,
    mergeEligibleAt: new Date(Date.parse(openedAt) + NORMAL_MR_OPEN_WINDOW_MS).toISOString(),
    status: "opened",
  };
}

/** 由既有后台 poll 消费同 owner 的模拟外部观测，再交给材料核验决定是否转正。 */
export function observePrototypeProposalMr(
  group: AIReqRequirementGroup,
  now: number,
): AIReqProposalMergeScenario {
  const delivery = group.proposalDelivery as InternalProposalDelivery | undefined;
  if (delivery?.mergeScenario) return delivery.mergeScenario;
  const fact = delivery?.simulatedMr;
  const mr = group.requirementsPr;
  if (
    !fact ||
    fact.candidate !== delivery!.candidate ||
    fact.number !== mr?.number ||
    mr.status === "closed"
  )
    return "unmerged";
  if (fact.status === "opened" && now >= Date.parse(fact.mergeEligibleAt)) {
    fact.status = "merged";
    fact.commit = `sample-document-merge-${fact.candidate}`;
  }
  return fact.status === "merged" ? "merged" : "unmerged";
}
/** 演示交付只记录编号与状态；没有代码托管服务提供的真实URL时不返回链接。 */
export function ensurePrototypeProposalMr(group: AIReqRequirementGroup): void {
  const delivery = group.proposalDelivery;
  if (!delivery?.pushedAt) throw businessRule("推送当前材料后才能创建 MR。");
  if (group.requirementsPr?.number && delivery.prCandidate === delivery.candidate) return;
  if (consumePrototypeMrCreationFailure(delivery.candidate))
    throw businessRule("分支已推送，但创建 MR 失败，请重试当前版本。");
  const handoff = readPrototypeProposalPrHandoff(group);
  const number = ++mrNumber;
  group.requirementsPr = aiReqPrFactSchema.parse({
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
  });
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
  if (!hasCurrentProposalSolution(group)) throw businessRule("请先完成当前需求版本的方案。");
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
  const state = proposalState(group);
  if (action.type === "confirmProposal") {
    if (state !== "submission-pending" || action.version !== proposalVersion(group))
      throw businessRule("确认页面对应旧版本，请重新查看当前 IR、全部 SR 与方案后确认。");
    return;
  }
  const delivery = group.proposalDelivery;
  if (!delivery || !proposalDeliveryCurrent(group) || action.candidate !== delivery.candidate)
    throw businessRule("提案版本已变化，旧确认、推送与 PR 已失效，请重新确认当前版本。");
  if (action.type === "publishProposal") {
    if (state !== "submission-pending" && state !== "merge-pending")
      throw businessRule("请先确认当前材料，再提交推送并自动创建 MR。");
    return;
  }
}

/** 仅写入内存样例；合入证据与文档完整性是自动入库的两项条件。 */
export function completePrototypeProposal(
  state: AIReqWorkflowView,
  group: InternalRequirementGroup,
  checkedAt: string,
): void {
  const project = state.projects.find((item) => item.id === group.projectId)!;
  const commit =
    (group.proposalDelivery as InternalProposalDelivery | undefined)?.simulatedMr?.commit ??
    `sample-proposal-merged-${state.revision}`;
  group.status = "formal";
  group.merge = {
    commit,
    branch: project.defaultBranch,
    checkedAt,
    files: structuredClone(group.files),
  };
  state.drafts = state.drafts.filter(
    (item) => item.id !== group.id || item.projectId !== group.projectId,
  );
  if (!state.groups.some((item) => item.id === group.id && item.projectId === group.projectId))
    state.groups.push(group);
  group.revising = false;
  const revision = group.proposalRevisions?.at(-1);
  if (revision && !revision.completedAt) revision.completedAt = checkedAt;
  state.repositoryHeads ??= {};
  state.repositoryHeads[project.repositoryId] = commit;
  const members = state.srs.filter(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  );
  group.branchCreationAttempts ??= {};
  for (const [index, sr] of members.entries()) {
    sr.developerEmployeeId ??= group.contacts?.development;
    sr.testingEmployeeId ??= group.contacts?.testing;
    const attempt = (group.branchCreationAttempts[sr.id] ?? 0) + 1;
    group.branchCreationAttempts[sr.id] = attempt;
    // 正常内存 Git 依赖首次推送首个分支暂时失败；显式内部故障输入仍优先，重试复用同一合入基点。
    const failed =
      group.branchCreationFailures !== undefined
        ? group.branchCreationFailures.includes(sr.id)
        : index === 0 && attempt === 1;
    sr.trackingBranch = {
      name: `sr/${sr.id}`,
      baseCommit: commit,
      createdAt: checkedAt,
      pushedAt: failed ? "" : checkedAt,
      status: failed ? "failed" : "ready",
      ...(failed ? { error: "创建或推送开发分支失败，请重试。" } : {}),
    };
  }
  group.branchCreationFailures = [];
  freezePrototypeRequirement(group, "platform", checkedAt);
}
