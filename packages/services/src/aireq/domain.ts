import type {
  AIReqAlignment,
  AIReqFileVersion,
  AIReqProposalReturnTarget,
  AIReqProposalState,
  AIReqRequirementGroup,
  AIReqWorkflowTarget,
  AIReqSystemRequirement,
  AIReqWorkflowView,
  AIReqReview,
} from "./types.js";
import { readSrDependencies } from "./sr-dependencies.js";

export const AIREQ_ROLE_ADMINISTRATOR = "y00000000";

export function hasProjectRole(
  view: Pick<AIReqWorkflowView, "projectRoleMembers"> | undefined,
  projectId: string | undefined,
  employeeId: string,
  role: "business" | "development" | "testing",
): boolean {
  return (
    role === "business" ||
    (Boolean(projectId) && employeeId === AIREQ_ROLE_ADMINISTRATOR) ||
    Boolean(
      view?.projectRoleMembers.some(
        (entry) =>
          entry.projectId === projectId && entry.employeeId === employeeId && entry.role === role,
      ),
    )
  );
}

/** 正式需求是同一项目内的只读查看，不绑定提案或开发会话。 */
export function isFormalSelection(
  view: AIReqWorkflowView | undefined,
  selection: AIReqWorkflowTarget,
): boolean {
  return Boolean(
    view?.requirements.some(
      (group) =>
        group.archive && group.projectId === selection.projectId && group.id === selection.irId,
    ),
  );
}

/** 前置单评审只绑定 IR 业务文档，后续方案材料变化不使它过期。 */
export function requirementsReviewInputs(
  group: AIReqRequirementGroup,
): AIReqFileVersion[] | undefined {
  const snapshot = group.snapshot;
  const file = group.files.find((item) => item.path === group.documentPath);
  // 文件名不能冒充有效材料：只接受 owner 当前快照中相同对象、相同版本的非空业务文档。
  if (
    group.requirementsCheck?.issues.length !== 0 ||
    (group.returnFeedback &&
      group.returnFeedback.target !== "solution" &&
      !group.returnFeedback.resumedAt) ||
    !snapshot ||
    !snapshot.digest ||
    snapshot.projectId !== group.projectId ||
    snapshot.irId !== group.id ||
    snapshot.documentPath !== group.documentPath ||
    !file?.sha256 ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    !snapshot.files.some(
      (item) => item.path === file.path && item.sha256 === file.sha256 && item.size === file.size,
    )
  )
    return;
  return [{ ...file }];
}
export function requirementsReviewStartBlocker(group: AIReqRequirementGroup): string | undefined {
  if (
    group.returnFeedback &&
    group.returnFeedback.target !== "solution" &&
    !group.returnFeedback.resumedAt
  )
    return group.returnFeedback.reason.trim()
      ? "请先根据退回意见更新需求文档。"
      : "请先完善需求文档，再提交评审。";
  const issue = group.requirementsCheck?.issues[0];
  if (issue) return `${issue.path}：${issue.reason}`;
  if (!requirementsReviewInputs(group)) return "请先讨论并生成 IR 原始需求文档。";
}
export function requirementsReviewCurrent(group: AIReqRequirementGroup): boolean {
  const files = requirementsReviewInputs(group);
  const review = group.originalReview;
  return Boolean(
    files &&
    review &&
    review.kind === "original" &&
    !review.invalidatedReason &&
    review.snapshotDigest === fileVersions(files) &&
    review.inputFiles &&
    sameFileVersions(files, review.inputFiles),
  );
}

function sameFileVersions(files: AIReqFileVersion[], recordedFiles: AIReqFileVersion[]): boolean {
  const current = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const recorded = [...recordedFiles].sort((a, b) => a.path.localeCompare(b.path));
  return (
    current.length === recorded.length &&
    current.every(
      (file, index) =>
        file.path === recorded[index]?.path &&
        file.sha256 === recorded[index]?.sha256 &&
        file.size === recorded[index]?.size,
    )
  );
}

function reviewAgentReportsReady(review: AIReqReview, ids: string[]): boolean {
  return ids.every((id) =>
    review.agents?.some(
      (agent) => agent.id === id && agent.status === "completed" && Boolean(agent.report.trim()),
    ),
  );
}

function reviewOutputPending(review: AIReqReview): boolean {
  return Boolean(
    review.agents?.some(
      (agent) =>
        agent.status === "running" ||
        (agent.status === "pending" &&
          (agent.id !== "summary" || reviewAgentReportsReady(review, ["a", "b", "c"]))),
    ),
  );
}
function reviewReadyIssue(
  review: AIReqReview | undefined,
  current: boolean,
  ids: string[],
): string | undefined {
  if (!review) return "尚未接纳当前版本评审。";
  if (!current) return "材料版本已变化，旧评审已失效。";
  if (review.agents?.some((agent) => agent.status === "failed"))
    return "评审执行失败，请重试当前版本。";
  if (reviewOutputPending(review)) return "评审报告尚未齐备，请等待评审完成。";
  if (!review.report.trim() || !reviewAgentReportsReady(review, ids))
    return "评审报告缺失或不可读取，请重试当前版本。";
}
export function requirementsReviewReadyBlocker(group: AIReqRequirementGroup): string | undefined {
  return (
    requirementsReviewStartBlocker(group) ??
    reviewReadyIssue(group.originalReview, requirementsReviewCurrent(group), ["a"])
  );
}
export function requirementsReviewBlocker(group: AIReqRequirementGroup): string | undefined {
  return (
    requirementsReviewReadyBlocker(group) ??
    (!group.originalReview?.passed ||
    group.originalReview.humanDecision?.reviewId !== group.originalReview.id ||
    group.originalReview.humanDecision.snapshotDigest !== group.originalReview.snapshotDigest
      ? "原始需求评审完成后仍需业务人员确认。"
      : undefined)
  );
}
export function fullReviewCurrent(group: AIReqRequirementGroup): boolean {
  return Boolean(
    group.solutionCheck?.issues.length === 0 &&
    !(group.returnFeedback && !group.returnFeedback.resumedAt) &&
    group.review &&
    group.review.kind === "full" &&
    !group.review.invalidatedReason &&
    group.review.snapshotDigest === proposalVersion(group) &&
    group.review.inputFiles &&
    sameFileVersions(group.files, group.review.inputFiles),
  );
}
export function fullReviewReadyBlocker(group: AIReqRequirementGroup): string | undefined {
  return (
    requirementsReviewBlocker(group) ??
    (!hasCurrentProposalSolution(group) ? "请先完善全部 SR 的完整材料。" : undefined) ??
    reviewReadyIssue(group.review, fullReviewCurrent(group), ["a", "b", "c", "summary"])
  );
}
export function proposalReviewSubmitBlocker(
  group: AIReqRequirementGroup,
  kind: "original" | "full",
): string | undefined {
  if (kind === "original") {
    if (requirementsReviewCurrent(group)) return "当前需求版本已提交评审。";
    return requirementsReviewStartBlocker(group);
  }
  if (fullReviewCurrent(group)) return "当前方案版本已提交审查。";
  const issue = group.solutionCheck?.issues[0];
  return (
    requirementsReviewBlocker(group) ??
    (issue ? `${issue.path}：${issue.reason}` : undefined) ??
    (!hasCurrentProposalSolution(group) ? "请先完善并校验方案材料。" : undefined)
  );
}
/** A report with negative findings is complete; only failed or missing output may be rerun. */
export function proposalReviewCanRetry(group: AIReqRequirementGroup, full: boolean): boolean {
  const review = full ? group.review : group.originalReview;
  const current = full
    ? fullReviewCurrent(group) &&
      hasCurrentProposalSolution(group) &&
      !requirementsReviewBlocker(group)
    : requirementsReviewCurrent(group) && !requirementsReviewStartBlocker(group);
  if (!review || !current) return false;
  if (!reviewReadyIssue(review, true, full ? ["a", "b", "c", "summary"] : ["a"])) return false;
  return (
    Boolean(review.agents?.some((agent) => agent.status === "failed")) ||
    !reviewOutputPending(review)
  );
}

export function proposalAlignmentCurrent(
  group: AIReqRequirementGroup,
  entry: AIReqAlignment,
): boolean {
  const review = group.review;
  return Boolean(
    review &&
    entry.reviewId === review.id &&
    entry.snapshotDigest === review.snapshotDigest &&
    entry.version === proposalVersion(group),
  );
}
export function alignmentBlocker(group: AIReqRequirementGroup): string | undefined {
  return (
    fullReviewReadyBlocker(group) ??
    (["business", "development", "testing"].some(
      (perspective) =>
        !group.alignment?.some(
          (entry) => entry.perspective === perspective && proposalAlignmentCurrent(group, entry),
        ),
    )
      ? "业务、开发、测试三个视角必须分别确认当前完整材料版本。"
      : undefined)
  );
}

/** Opaque version of the current proposal materials. */
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
    group.proposalDelivery.version === proposalVersion(group) &&
    sameFileVersions(group.files, group.proposalDelivery.files),
  );
}

export const MATERIAL_KIND_LABELS = {
  ir: "IR 原始需求",
  sr: "SR 规格",
  solution: "方案材料",
  plan: "开发计划",
  "test-plan": "测试方案",
};

export function requirementMaterialName(
  path: string,
  srs: readonly AIReqSystemRequirement[] = [],
): string | undefined {
  if (path.endsWith("/design.md")) return "技术方案";
  if (path.endsWith("/sr-dependencies.json")) return "SR 依赖";
  if (path.endsWith("/requirements.md")) return "业务需求";
  if (path.endsWith("/proposal.md")) return "SR 提案";
  if (path.endsWith("/tasks.md")) return "开发任务";
  if (path.endsWith("/test-plan.md")) return "测试方案";
  if (path.endsWith("/spec.md")) {
    const sr = srs.find((item) => item.documentPath === path);
    return sr ? `SR 需求 · ${sr.title}` : "SR 需求";
  }
}

export function completeProposalPaths(group: AIReqRequirementGroup): string[] {
  return [
    `docs/requirements/${group.id}/requirements.md`,
    `docs/requirements/${group.id}/sr-dependencies.json`,
    ...group.srIds.flatMap((id) => [
      `openspec/changes/${id}/proposal.md`,
      `openspec/changes/${id}/design.md`,
      `openspec/changes/${id}/tasks.md`,
      `openspec/changes/${id}/specs/${id}/spec.md`,
      `openspec/changes/${id}/test-plan.md`,
    ]),
  ];
}
export function hasCurrentProposalSolution(group: AIReqRequirementGroup): boolean {
  return Boolean(
    group.solutionCheck?.issues.length === 0 &&
    requirementsReviewInputs(group) &&
    group.snapshot &&
    sameFileVersions(group.files, group.snapshot.files) &&
    group.srIds.length &&
    group.proposalSolution?.valid &&
    group.proposalSolution.requirementsDigest === group.snapshot?.digest &&
    group.srDependencyFile?.valid &&
    group.files.some(
      (file) =>
        file.path === group.srDependencyFile!.path &&
        file.sha256 === group.srDependencyFile!.sha256 &&
        file.size === group.srDependencyFile!.size,
    ) &&
    !readSrDependencies(group).issue &&
    completeProposalPaths(group).every((path) =>
      group.files.some(
        (file) =>
          file.path === path &&
          Boolean(file.sha256) &&
          Number.isSafeInteger(file.size) &&
          file.size > 0,
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
/** 提案的唯一业务状态推导；导航和生命周期旧字段不构成推进证据。 */
export function proposalState(group: AIReqRequirementGroup): AIReqProposalState | undefined {
  if (["formal", "frozen", "deleted"].includes(group.status) || group.archive) return;
  if (!requirementsReviewCurrent(group)) return "not-started";
  if (requirementsReviewReadyBlocker(group)) return "ir-review-pending";
  if (requirementsReviewBlocker(group)) return "ir-confirmation-pending";
  if (!hasCurrentProposalSolution(group) || !fullReviewCurrent(group)) return "solution-incomplete";
  if (fullReviewReadyBlocker(group)) return "solution-review-pending";
  if (alignmentBlocker(group)) return "solution-confirmation-pending";
  return "submission-pending";
}

/** 四个操作工作区只负责导航；业务状态始终由 proposalState 的七态决定。 */
export function proposalProgressIndex(group: AIReqRequirementGroup): number {
  switch (proposalState(group)) {
    case "not-started":
      return 0;
    case "ir-review-pending":
    case "ir-confirmation-pending":
      return 1;
    case "solution-incomplete":
    case "solution-review-pending":
    case "solution-confirmation-pending":
      return 2;
    case "submission-pending":
      return 3;
    default:
      return -1;
  }
}
export function proposalReturnBlocker(
  group: AIReqRequirementGroup,
  target: AIReqProposalReturnTarget = "requirements",
): string | undefined {
  const state = proposalState(group);
  if (!state) return "只能退回未归档的提案。";
  if (target === "solution") {
    if (!fullReviewCurrent(group) || requirementsReviewBlocker(group))
      return "仅当前方案审查或待提交交付可以退回方案设计。";
  } else if (state === "not-started") {
    return "提案已在需求澄清阶段。";
  } else if (state === "submission-pending") {
    return "交付待提交时请先退回方案设计。";
  }
}
export function proposalViewedIndex(
  group: AIReqRequirementGroup,
  selection: AIReqWorkflowTarget,
): number {
  if (selection.proposalStep)
    return ["requirements", "requirements-review", "solution", "intake"].indexOf(
      selection.proposalStep,
    );
  const progress = proposalProgressIndex(group);
  return selection.discussionPhase === "requirements" && progress > 1 ? 0 : progress;
}

/** 提出人固定，当前处理责任按业务状态变化；不是权限或自动分派系统。 */
export function proposalActorLabel(group: AIReqRequirementGroup): string {
  switch (proposalState(group)) {
    case "not-started":
      return `业务 ${group.proposalLocation?.employeeId ?? "提出人"} 完善需求`;
    case "ir-review-pending":
      return "等待需求评审报告";
    case "ir-confirmation-pending":
      return "人工确认当前 IR 评审";
    case "solution-incomplete":
      return `方案开发 ${group.developerAcceptance?.employeeId ?? "待确认"}`;
    case "solution-review-pending":
      return "等待完整方案审查报告";
    case "solution-confirmation-pending":
      return "业务、开发、测试分别确认当前版本";
    case "submission-pending":
      return "核对文件并提交归档";
    default:
      return "";
  }
}

/** Formal views never mount retired development conversations. */
export function conversationReadOnlyReason(
  view: Pick<AIReqWorkflowView, "requirements"> | undefined,
  selection: AIReqWorkflowTarget,
  access?: { proposalDiscussion?: boolean },
): string | undefined {
  if (!view) return;
  const proposal = view.requirements.find(
    (item) => item.projectId === selection.projectId && item.id === selection.irId,
  );
  if (!proposal || proposal.archive) return "已归档需求材料仅供只读查看。";
  if (access?.proposalDiscussion === false) return "当前提案讨论只读。";
  // 历史节点可能与当前节点同属 requirements 讨论面，必须比较业务阶段，不能只比较 discussionPhase。
  if (proposalViewedIndex(proposal, selection) !== proposalProgressIndex(proposal))
    return "正在查看历史阶段，仅供只读查看。";
  if (
    selection.discussionPhase &&
    selection.discussionPhase !== (proposal.proposalStage ?? "requirements")
  )
    return "正在查看另一讨论阶段的历史，只读。";
}
