import { businessRule, businessFailureMessage } from "./errors.js";
import { consumePrototypeMrCreationFailure, prototypeMaterialIssue } from "./recovery.js";
import { contentVersion } from "./content-digest.js";
import { prototypeDefaultCommit } from "./fixture-builders.js";
import {
  aiReqPrFactSchema,
  fileVersions,
  proposalVersion,
  proposalDeliveryCurrent,
  completeProposalPaths,
  proposalPrCurrent,
  proposalDependencyMaterialIssue,
  alignmentBlocker,
} from "@zcode/services/aireq";
import { prototypeProposalBranch, readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
import { freezePrototypeRequirement } from "./requirement-freeze.js";
import { prototypeRepositoryKey, prototypeRepositoryTarget } from "./project-settings.js";
import type { RequirementGroup, WorkflowState } from "./workflow-state.js";

let mrNumber = 100;
const NORMAL_MR_OPEN_WINDOW_MS = 10_000;

/** 正常内存 MR 依赖的生命周期，候选与编号共同绑定；不由浏览器驱动模拟时钟。 */
function beginPrototypeProposalMrLifecycle(group: RequirementGroup): void {
  const delivery = group.proposalDelivery;
  const mr = group.requirementsPr;
  if (!delivery || !mr?.number || mr.status !== "opened" || !proposalPrCurrent(group))
    throw businessRule("文档 PR 发布事实不完整。");
  if (
    delivery.simulatedMr?.candidate === delivery.candidate &&
    delivery.simulatedMr.number === mr.number
  )
    return;
  const openedAt = new Date().toISOString();
  delivery.simulatedMr = {
    candidate: delivery.candidate,
    version: delivery.version,
    manifest: fileVersions(delivery.files),
    number: mr.number,
    openedAt,
    mergeEligibleAt: new Date(Date.parse(openedAt) + NORMAL_MR_OPEN_WINDOW_MS).toISOString(),
    status: "opened",
  };
  delivery.mergeCheck = {
    status: "waiting",
    message: "已开始后台跟踪。文档 PR 合入并通过材料核验后自动转正。",
  };
}

/** 由既有后台 poll 消费同 owner 的模拟外部观测，再交给材料核验决定是否转正。 */
export function observePrototypeProposalMr(
  group: RequirementGroup,
  now: number,
): "unmerged" | "merged" | "stale-version" | "incomplete" {
  const delivery = group.proposalDelivery;
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
  if (fact.status !== "merged") return "unmerged";
  if (fact.version !== delivery!.version) return "stale-version";
  if (fact.manifest !== fileVersions(delivery!.files)) return "incomplete";
  return "merged";
}
/** 演示交付只记录编号与状态；没有代码托管服务提供的真实URL时不返回链接。 */
function ensurePrototypeProposalMr(group: RequirementGroup, targetBranch: string): void {
  const delivery = group.proposalDelivery;
  if (!delivery?.branch || !delivery.pushedAt) throw businessRule("推送当前材料后才能创建文档 PR。");
  const sourceBranch = delivery.branch.name;
  if (consumePrototypeMrCreationFailure(delivery.candidate))
    throw businessRule("分支已推送，但创建文档 PR 失败，请重试当前版本。");
  const number = ++mrNumber;
  group.requirementsPr = aiReqPrFactSchema.parse({
    number,
    status: "opened",
    title: `[需求] ${group.title}`,
    body: [
      "## 需求与方案",
      `IR：${group.id} · ${group.title}`,
      `候选：${delivery.candidate}`,
      `来源分支：${sourceBranch}`,
      `目标分支：${targetBranch}`,
      "",
      "## 文档清单",
      ...delivery.files.map((file) => `- ${file.path}`),
      "",
      "文档 PR 合入后，后台核验材料版本与完整性，通过后自动转正。",
    ].join("\n"),
    sourceBranch,
    targetBranch,
    recordedAt: new Date().toISOString(),
    platformVerified: false,
  });
  delivery.prCandidate = delivery.candidate;
}
/** The last role confirmation prepares, but never publishes, the immutable full-set candidate. */
export function preparePrototypeProposalCandidate(
  group: RequirementGroup,
  candidate: string,
  employeeId: string,
  confirmedAt: string,
): void {
  if (alignmentBlocker(group) || proposalDeliveryCurrent(group)) return;
  group.proposalDelivery = {
    candidate,
    version: proposalVersion(group),
    files: structuredClone(group.files),
    confirmedBy: employeeId,
    confirmedAt,
  };
}

export function closePrototypeProposalMr(
  group: RequirementGroup,
  nextCandidate: string,
): void {
  const delivery = group.proposalDelivery!;
  const mr = group.requirementsPr!;
  mr.status = "closed";
  delivery.closedPr = mr;
  (group.proposalDeliveryHistory ??= []).push(delivery);
  group.proposalDelivery = undefined;
  group.requirementsPr = undefined;
  group.status = "solution-ready";
  preparePrototypeProposalCandidate(
    group,
    nextCandidate,
    delivery.confirmedBy,
    delivery.confirmedAt,
  );
}

/** Compare the candidate's exact required set and recompute evidence from the readable body. */
export function prototypeProposalMaterialsIssue(
  view: WorkflowState,
  group: RequirementGroup,
): string | undefined {
  if (!proposalDeliveryCurrent(group)) return "交付候选与当前材料版本不一致。";
  const expected = new Set(completeProposalPaths(group));
  const files = group.proposalDelivery!.files;
  if (files.length !== expected.size || files.some((file) => !expected.delete(file.path)))
    return "交付候选的文件清单不完整或包含重复文件。";
  const materials = new Map(
    view.materials
      .filter((item) => item.projectId === group.projectId && item.irId === group.id)
      .map((item) => [item.path, item]),
  );
  for (const file of files) {
    const material = materials.get(file.path);
    if (!material) return `${file.path}：当前材料缺失。`;
    const readIssue = prototypeMaterialIssue(material) ?? material.error;
    if (readIssue) return `${file.path}：${readIssue}`;
    if (!material.valid || !material.content?.trim())
      return `${file.path}：当前材料无效或不可读取。`;
    const actual = contentVersion(material.content);
    if (
      file.sha256 !== actual.sha256 ||
      file.size !== actual.size ||
      file.sha256 !== material.sha256 ||
      file.size !== material.size
    )
      return `${file.path}：材料与交付候选的版本不一致。`;
  }
  return proposalDependencyMaterialIssue(group, view.materials);
}

export function validatePrototypeProposalPublication(
  view: WorkflowState,
  group: RequirementGroup,
  candidate: string,
): void {
  const project = view.projects.find((item) => item.id === group.projectId);
  const { blockers } = readPrototypeProposalPrHandoff(group, project);
  if (blockers.length !== 0) throw businessRule(blockers.join("；"));
  if (group.proposalDelivery?.candidate !== candidate || !proposalDeliveryCurrent(group))
    throw businessRule("交付候选已失效，请重新查看当前版本的文件清单。");
  if (proposalPrCurrent(group) && group.requirementsPr?.status === "merged")
    throw businessRule("文档 PR 已合入，请等待完整材料核验。");
  const issue = prototypeProposalMaterialsIssue(view, group);
  if (issue) throw businessRule(issue);
}

/** Resume only the missing steps; a PR error cannot discard an already created/pushed branch. */
export function publishPrototypeProposal(
  state: WorkflowState,
  group: RequirementGroup,
  at: string,
): boolean {
  const delivery = group.proposalDelivery!;
  const reused = proposalPrCurrent(group);
  if (!reused) {
    const project = state.projects.find((item) => item.id === group.projectId)!;
    const target = (delivery.repositoryTarget ??= prototypeRepositoryTarget(project));
    let step: NonNullable<typeof delivery.publishError>["step"] = "branch";
    try {
      delivery.branch ??= {
        name: prototypeProposalBranch(group.id),
        baseCommit: prototypeDefaultCommit(state, target),
        createdAt: at,
      };
      step = "push";
      if (delivery.pushedCandidate !== delivery.candidate) {
        delivery.branch.pushedAt = at;
        delivery.pushedCandidate = delivery.candidate;
        delivery.pushedAt = at;
      }
      step = "pr";
      ensurePrototypeProposalMr(group, target.defaultBranch);
    } catch (error) {
      delivery.publishError = { step, message: businessFailureMessage(error) };
      throw error;
    }
    delivery.publishError = undefined;
    group.status = "requirements-pr";
  }
  // Opened seeds have no observer until explicitly published; existing windows are never reset.
  beginPrototypeProposalMrLifecycle(group);
  return reused;
}

/** 仅写入内存样例；合入证据与文档完整性是自动入库的两项条件。 */
export function completePrototypeProposal(
  state: WorkflowState,
  group: RequirementGroup,
  checkedAt: string,
) {
  const delivery = group.proposalDelivery!;
  const target = delivery.repositoryTarget!;
  const commit = delivery.simulatedMr?.commit ?? `sample-document-merge-${delivery.candidate}`;
  group.status = "formal";
  group.merge = {
    commit,
    branch: target.defaultBranch,
    checkedAt,
    files: structuredClone(group.files),
  };
  state.drafts = state.drafts.filter(
    (item) => item.id !== group.id || item.projectId !== group.projectId,
  );
  if (!state.groups.some((item) => item.id === group.id && item.projectId === group.projectId))
    state.groups.push(group);
  const revision = group.proposalRevisions?.at(-1);
  if (revision && !revision.completedAt) revision.completedAt = checkedAt;
  state.repositoryHeads[prototypeRepositoryKey(target)] = commit;
  freezePrototypeRequirement(group, "platform", checkedAt);
}
