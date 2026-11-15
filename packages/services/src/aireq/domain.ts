import type {
  AIReqFileVersion,
  AIReqRequirementGroup,
  AIReqRequirementsDecision,
  AIReqSelection,
  AIReqSystemRequirement,
  AIReqWorkflowView,
} from "./types.js";
import { readSrDependencies } from "./sr-dependencies.js";

/** 正式需求是同一项目内的只读查看，不绑定提案或开发会话。 */
export function isFormalSelection(
  view: AIReqWorkflowView | undefined,
  selection: AIReqSelection,
): boolean {
  return Boolean(
    selection.formalView ||
    view?.groups.some(
      (group) => group.projectId === selection.projectId && group.id === selection.irId,
    ),
  );
}

/** 切版本只清除不兼容的报告选择，正式需求不能退回提案工作区。 */
export function selectionForRelease(
  selection: AIReqSelection,
  view: Pick<AIReqWorkflowView, "groups" | "drafts">,
  releaseId: string,
): AIReqSelection {
  const formal = view.groups.find((group) => group.id === selection.irId);
  const selected = formal ?? view.drafts.find((group) => group.id === selection.irId);
  if (!selected || selected.releaseId === releaseId) return selection;
  return selection.formalView || formal
    ? { projectId: selection.projectId, formalView: "list" }
    : { projectId: selection.projectId };
}

/** 业务评审只绑定 proposal 与全部增量 spec，技术 design 的生成不让业务评审过期。 */
export function requirementsReviewInputs(
  group: AIReqRequirementGroup,
): AIReqFileVersion[] | undefined {
  const rows = group.snapshot?.srs ?? [];
  if (
    !rows.length ||
    rows.length !== group.srIds.length ||
    !group.srIds.every((id) => rows.some((sr) => sr.id === id))
  )
    return;
  const root = group.documentPath.replace(/proposal\.md$/, "");
  const required = new Set([group.documentPath, ...rows.map((sr) => sr.documentPath)]);
  const files = group.files.filter(
    (file) =>
      file.path === group.documentPath ||
      (file.path.startsWith(`${root}specs/`) && file.path.endsWith("/spec.md")),
  );
  if (
    files.length !== required.size ||
    new Set(files.map((file) => file.path)).size !== required.size ||
    !files.every((file) => required.has(file.path))
  )
    return;
  return files
    .map(({ path, sha256, size }) => ({ path, sha256, size }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
/** 退回后必须先通过既有业务补充路径更新文件，不能用重跑评审跳过。 */
export function requirementsReviewStartBlocker(group: AIReqRequirementGroup): string | undefined {
  if (group.returnFeedback && !group.returnFeedback.resumedAt)
    return "请先与业务需求 Agent 处理待补充意见，更新 IR／SR 后再发起需求评审。";
  if (!requirementsReviewInputs(group)) return "请先补齐 IR 与全部 SR 的需求材料，再发起需求评审。";
}
export function requirementsReviewCurrent(group: AIReqRequirementGroup): boolean {
  const review = group.review;
  const files = requirementsReviewInputs(group);
  if (
    !review ||
    !files ||
    !review.inputFiles ||
    review.snapshotDigest !== group.snapshot?.digest ||
    review.round !== (group.proposalRound ?? 1)
  )
    return false;
  return sameFileVersions(files, review.inputFiles);
}

function sameFileVersions(files: AIReqFileVersion[], recordedFiles: AIReqFileVersion[]): boolean {
  const recorded = [...recordedFiles].sort((a, b) => a.path.localeCompare(b.path));
  return (
    files.length === recorded.length &&
    files.every(
      (file, index) =>
        file.path === recorded[index]?.path &&
        file.sha256 === recorded[index]?.sha256 &&
        file.size === recorded[index]?.size,
    )
  );
}

/** 人工处理绑定原始 AI 评审和材料；不是替代 AI 结论的通过凭证。 */
export function requirementsDecisionCurrent(
  group: AIReqRequirementGroup,
  decision: Pick<AIReqRequirementsDecision, "reviewId" | "snapshotDigest" | "inputFiles">,
): boolean {
  const files = requirementsReviewInputs(group);
  return Boolean(
    files &&
    requirementsReviewCurrent(group) &&
    decision.reviewId === group.review?.id &&
    decision.snapshotDigest === group.snapshot?.digest &&
    sameFileVersions(files, decision.inputFiles),
  );
}
/** Human approval is separate from the models' recommendations. */
export function requirementsReviewReadyBlocker(group: AIReqRequirementGroup): string | undefined {
  const startIssue = requirementsReviewStartBlocker(group);
  if (startIssue) return startIssue;
  if (!group.review) return "尚未发起当前需求版本的评审。";
  if (!requirementsReviewCurrent(group)) return "需求版本已变化，旧评审已失效，请重新评审。";
  const agents = group.review.agents;
  // 迁移规格要求四路完整报告；源端 agents 缺省分支不能作为评审通过的兼容旁路。
  if (
    !agents ||
    ["a", "b", "c", "summary"].some(
      (id) =>
        !agents.some(
          (agent) =>
            agent.id === id && agent.status === "completed" && Boolean(agent.report.trim()),
        ),
    )
  )
    return "请先完成三个独立评审和综合意见；失败或未完成的报告不能作为完整评审依据。";
}
export function requirementsReviewBlocker(group: AIReqRequirementGroup): string | undefined {
  const issue = requirementsReviewReadyBlocker(group);
  if (issue) return issue;
  if (!group.review!.passed || group.review!.humanDecision?.reviewId !== group.review!.id)
    return "综合意见已就绪，请由人工判断通过或返回业务补充；模型意见不自动放行。";
}

/** Opaque in-memory version, not a real Git commit or content hash. */
export function proposalVersion(group: AIReqRequirementGroup): string {
  return JSON.stringify({
    round: group.proposalRound ?? 1,
    digest: group.snapshot?.digest,
    title: group.title,
    dependencyFile: group.srDependencyFile,
    srIds: [...group.srIds].sort(),
    solution: group.proposalSolution,
    files: [...group.files].sort((a, b) => a.path.localeCompare(b.path)),
  });
}
export function proposalDeliveryCurrent(group: AIReqRequirementGroup): boolean {
  return Boolean(
    group.proposalDelivery &&
    hasCurrentProposalSolution(group) &&
    group.proposalDelivery.version === proposalVersion(group),
  );
}

export const PROPOSAL_STATUS_LABELS = {
  draft: "草稿",
  "solution-ready": "方案完成",
  "requirements-pr": "MR 待合并",
  formal: "正式提案",
  frozen: "开发已冻结",
  deleted: "已删除",
  reviewing: "评审中",
  confirmed: "已确认",
};
export const MATERIAL_KIND_LABELS = {
  ir: "IR 原始需求",
  sr: "SR 系统需求",
  solution: "IR 方案设计",
  plan: "开发计划",
  completion: "完成报告",
  ut: "UT 报告",
  st: "ST 报告",
  delivery: "交付说明",
  attachment: "附件",
  "ir-acceptance-report": "IR 验收报告",
  "ir-final-pr": "最终 PR",
  "sr-delivery-package": "SR 交付清单",
};

export function requirementMaterialName(
  path: string,
  srs: readonly AIReqSystemRequirement[] = [],
): string | undefined {
  if (path.endsWith("/design.md")) return "技术方案";
  if (path.endsWith("/sr-dependencies.json")) return "SR 依赖";
  if (path.endsWith("/proposal.md")) return "业务需求";
  if (path.endsWith("/spec.md")) {
    const sr = srs.find((item) => item.documentPath === path);
    return sr ? `SR 需求 · ${sr.title}` : "SR 需求";
  }
}

export function hasCurrentProposalSolution(group: AIReqRequirementGroup): boolean {
  const solution = group.proposalSolution;
  if (
    !solution?.valid ||
    !group.snapshot?.digest ||
    solution.round !== (group.proposalRound ?? 1) ||
    solution.requirementsDigest !== group.snapshot.digest
  )
    return false;
  const root = group.documentPath.replace(/proposal\.md$/, "");
  const dependencyFile = group.srDependencyFile;
  return Boolean(
    dependencyFile &&
    !readSrDependencies(group).issue &&
    dependencyFile.round === solution.round &&
    solution.path === `${root}design.md` &&
    group.snapshot.srs.length === group.srIds.length &&
    group.srIds.every((id) => group.snapshot!.srs.some((sr) => sr.id === id)) &&
    [
      group.documentPath,
      ...group.snapshot.srs.map((sr) => sr.documentPath),
      solution.path,
      dependencyFile.path,
    ].every((path) =>
      group.files.some(
        (file) =>
          file.path === path &&
          (path !== dependencyFile.path ||
            (file.sha256 === dependencyFile.sha256 && file.size === dependencyFile.size)),
      ),
    ),
  );
}
export function fileVersions(files: AIReqFileVersion[]): string {
  return JSON.stringify(
    files
      .map(({ path, sha256, size }) => ({ path, sha256, size }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
}
/** 原型展示节点不另建 Agent：需求评审和人工入库都有独立的只读查看状态。 */
export function proposalProgressIndex(
  group: AIReqRequirementGroup,
  selection?: AIReqSelection,
): number {
  if (selection?.proposalEditing && group.proposalStage !== "solution") return 0;
  if (
    group.proposalStage === "requirements" &&
    group.returnFeedback &&
    !group.returnFeedback.resumedAt
  )
    return 0;
  if (group.status === "requirements-pr" || proposalDeliveryCurrent(group)) return 3;
  if (group.proposalStage === "solution") return 2;
  return requirementsReviewCurrent(group) ? 1 : 0;
}
export function proposalViewedIndex(
  group: AIReqRequirementGroup,
  selection: AIReqSelection,
): number {
  if (selection.proposalStep)
    return ["requirements", "requirements-review", "solution", "intake"].indexOf(
      selection.proposalStep,
    );
  if (selection.discussionPhase === "requirements" && proposalProgressIndex(group, selection) > 1)
    return 0;
  return proposalProgressIndex(group, selection);
}

/** 提出人固定，当前处理责任按阶段变化；不是权限或自动分派系统。 */
export function proposalActorLabel(group: AIReqRequirementGroup): string {
  if (group.status === "requirements-pr" || proposalDeliveryCurrent(group))
    return "人工评审 MR · 后台定时核验";
  if (group.proposalStage === "solution")
    return hasCurrentProposalSolution(group)
      ? "方案已完成，可由平台创建提案分支并推送"
      : `方案开发 ${group.developerAcceptance?.employeeId ?? "待确认"}`;
  if (
    requirementsReviewCurrent(group) &&
    !requirementsReviewReadyBlocker(group) &&
    !group.review?.humanDecision
  )
    return "人工判断综合意见";
  if (requirementsReviewCurrent(group) && !requirementsReviewBlocker(group))
    return group.returnFeedback
      ? `开发 ${group.returnFeedback.employeeId} 继续方案`
      : "开发人员进入方案";
  return `业务 ${group.proposalLocation?.employeeId ?? "提出人"} 补充需求`;
}

/** Formal views never mount retired development conversations. */
export function conversationReadOnlyReason(
  view: AIReqWorkflowView | undefined,
  selection: AIReqSelection,
  access?: { proposalDiscussion?: boolean; codeDevelopment?: boolean },
): string | undefined {
  if (!view) return;
  if (selection.proposalDraftId)
    return access?.proposalDiscussion === false ? "当前提案讨论只读。" : undefined;
  const proposal = view.drafts.find(
    (item) => item.projectId === selection.projectId && item.id === selection.irId,
  );
  if (!proposal) return "正式需求材料仅供只读查看。";
  if (access?.proposalDiscussion === false) return "当前提案讨论只读。";
  // 历史节点可能与当前节点同属 requirements 讨论面，必须比较业务阶段，不能只比较 discussionPhase。
  if (proposalViewedIndex(proposal, selection) !== proposalProgressIndex(proposal, selection))
    return "正在查看历史阶段，仅供只读查看。";
  if (
    selection.discussionPhase &&
    selection.discussionPhase !== (proposal.proposalStage ?? "requirements")
  )
    return "正在查看另一讨论阶段的历史，只读。";
  if (proposal.status === "requirements-pr")
    return "需求 MR 已创建，等待后台核验合入；当前版本只读。";
}
