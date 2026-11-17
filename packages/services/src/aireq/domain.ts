import type {
  AIReqFileVersion,
  AIReqProposalState,
  AIReqRequirementGroup,
  AIReqRequirementsDecision,
  AIReqSelection,
  AIReqSystemRequirement,
  AIReqWorkflowView,
  AIReqReview,
  AIReqTodo,
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

/** 前置单评审只绑定 IR 业务文档，后续方案材料变化不使它过期。 */
export function requirementsReviewInputs(
  group: AIReqRequirementGroup,
): AIReqFileVersion[] | undefined {
  const snapshot = group.snapshot;
  const file = group.files.find((item) => item.path === group.documentPath);
  // 文件名不能冒充有效材料：只接受 owner 当前快照中相同对象、相同版本的非空业务文档。
  if (
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
  if (group.returnFeedback && !group.returnFeedback.resumedAt)
    return "请先通过业务讨论补充退回意见。";
  if (!requirementsReviewInputs(group)) return "请先讨论并生成 IR 原始需求文档。";
}
export function requirementsReviewCurrent(group: AIReqRequirementGroup): boolean {
  const files = requirementsReviewInputs(group);
  const review = group.originalReview;
  return Boolean(
    files &&
    review &&
    !review.invalidatedReason &&
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

/** 人工处理绑定原始 AI 评审和材料；不是替代 AI 结论的通过凭证。 */
export function requirementsDecisionCurrent(
  group: AIReqRequirementGroup,
  decision: Pick<AIReqRequirementsDecision, "reviewId" | "snapshotDigest" | "inputFiles">,
): boolean {
  const files = requirementsReviewInputs(group);
  return Boolean(
    files &&
    requirementsReviewCurrent(group) &&
    decision.reviewId === group.originalReview?.id &&
    decision.snapshotDigest === group.originalReview?.snapshotDigest &&
    sameFileVersions(files, decision.inputFiles),
  );
}
function reviewReadyIssue(
  review: AIReqReview | undefined,
  current: boolean,
  ids: string[],
): string | undefined {
  if (!review) return "尚未发起当前版本评审。";
  if (!current) return "材料版本已变化，旧评审已失效，请重新评审。";
  if (!review.report.trim()) return "评审报告缺失或不可读取，不能人工放行。";
  if (
    ids.some(
      (id) =>
        !review.agents?.some(
          (agent) =>
            agent.id === id && agent.status === "completed" && Boolean(agent.report.trim()),
        ),
    )
  )
    return "评审失败、暂缓或未完成，不能人工放行。";
  if (review.findings?.some((finding) => finding.level === "blocking"))
    return "存在阻断问题，请修改材料后重新评审。";
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
    group.originalReview.humanDecision?.reviewId !== group.originalReview.id
      ? "原始需求评审完成后仍需人工通过。"
      : undefined)
  );
}
export function fullReviewCurrent(group: AIReqRequirementGroup): boolean {
  return Boolean(
    group.review &&
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
export function fullReviewBlocker(group: AIReqRequirementGroup): string | undefined {
  return (
    fullReviewReadyBlocker(group) ??
    (!group.review?.passed || group.review.humanDecision?.reviewId !== group.review.id
      ? "完整审查与综合终审完成后仍需人工放行。"
      : undefined)
  );
}
export function alignmentBlocker(group: AIReqRequirementGroup): string | undefined {
  return (
    fullReviewBlocker(group) ??
    (["business", "development", "testing"].some(
      (perspective) =>
        !group.alignment?.some(
          (entry) => entry.perspective === perspective && entry.version === proposalVersion(group),
        ),
    )
      ? "业务、开发、测试三个视角必须分别确认当前完整材料版本。"
      : undefined)
  );
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

export const MATERIAL_KIND_LABELS = {
  ir: "IR 原始需求",
  sr: "SR 规格",
  solution: "方案材料",
  plan: "开发计划",
  completion: "完成报告",
  ut: "UT 报告",
  st: "ST 报告",
  delivery: "交付说明",
  "test-plan": "测试方案",
  acceptance: "整体验收",
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
  if (path.endsWith("/requirements.md")) return "业务需求";
  if (path.endsWith("/proposal.md")) return "SR 提案";
  if (path.endsWith("/tasks.md")) return "开发任务";
  if (path.endsWith("/test-plan.md")) return "测试方案";
  if (path.endsWith("/acceptance.md")) return "整体验收";
  if (path.endsWith("/spec.md")) {
    const sr = srs.find((item) => item.documentPath === path);
    return sr ? `SR 需求 · ${sr.title}` : "SR 需求";
  }
}

export function completeProposalPaths(group: AIReqRequirementGroup): string[] {
  return [
    group.documentPath,
    `docs/requirements/${group.id}/sr-dependencies.json`,
    `docs/requirements/${group.id}/acceptance.md`,
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
  if (["formal", "frozen", "deleted"].includes(group.status) || group.merge) return;
  if (!requirementsReviewInputs(group)) return "not-started";
  if (requirementsReviewReadyBlocker(group)) return "ir-review-pending";
  if (requirementsReviewBlocker(group)) return "ir-confirmation-pending";
  if (!hasCurrentProposalSolution(group)) return "solution-incomplete";
  if (fullReviewReadyBlocker(group)) return "solution-review-pending";
  if (alignmentBlocker(group)) return "solution-confirmation-pending";
  const delivery = group.proposalDelivery;
  const pr = group.requirementsPr;
  if (
    delivery &&
    proposalDeliveryCurrent(group) &&
    sameFileVersions(group.files, delivery.files) &&
    delivery.candidate &&
    delivery.pushedAt &&
    delivery.pushedCandidate === delivery.candidate &&
    delivery.prCandidate === delivery.candidate &&
    delivery.branch?.name &&
    pr?.sourceBranch === delivery.branch.name &&
    pr.number &&
    pr.number > 0 &&
    (pr.status === "opened" || pr.status === "merged")
  )
    return "merge-pending";
  return "submission-pending";
}

/** 四个操作工作区只负责导航；业务状态始终由 proposalState 的八态决定。 */
export function proposalProgressIndex(
  group: AIReqRequirementGroup,
  _selection?: AIReqSelection,
): number {
  switch (proposalState(group)) {
    case "not-started":
      return 0;
    case "ir-review-pending":
      // 失败或阻断报告仍应在评审工作区可读，不能因未晋级而丢失报告入口。
      return group.returnFeedback && !group.returnFeedback.resumedAt
        ? 0
        : requirementsReviewCurrent(group)
          ? 1
          : 0;
    case "ir-confirmation-pending":
      return 1;
    case "solution-incomplete":
    case "solution-review-pending":
      return 2;
    case "solution-confirmation-pending":
      return fullReviewBlocker(group) ? 2 : 3;
    case "submission-pending":
    case "merge-pending":
      return 3;
    default:
      return -1;
  }
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

/** 提出人固定，当前处理责任按业务状态变化；不是权限或自动分派系统。 */
export function proposalActorLabel(group: AIReqRequirementGroup): string {
  switch (proposalState(group)) {
    case "not-started":
    case "ir-review-pending":
      return `业务 ${group.proposalLocation?.employeeId ?? "提出人"} 补充需求或评审`;
    case "ir-confirmation-pending":
      return "人工确认当前 IR 评审";
    case "solution-incomplete":
      return `方案开发 ${group.developerAcceptance?.employeeId ?? "待确认"}`;
    case "solution-review-pending":
      return "完整方案送审与处理审查意见";
    case "solution-confirmation-pending":
      return fullReviewBlocker(group) ? "人工放行当前完整方案" : "业务、开发、测试分别确认当前版本";
    case "submission-pending":
      return "确认交付并提交整包文档 PR";
    case "merge-pending":
      return "人工评审 PR · 后台定时核验";
    default:
      return "";
  }
}

/** Formal views never mount retired development conversations. */
export function conversationReadOnlyReason(
  view: Pick<AIReqWorkflowView, "drafts"> | undefined,
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

/** 待办只由 owner 第一手业务事实派生，读取时不按当前项目筛选。 */
export function deriveAIReqTodos(view: AIReqWorkflowView): AIReqTodo[] {
  const result: AIReqTodo[] = [];
  const push = (
    group: AIReqRequirementGroup,
    kind: AIReqTodo["kind"],
    title: string,
    assignmentPerspective: AIReqTodo["assignmentPerspective"],
    employeeId?: string,
    extra: Partial<AIReqTodo> = {},
  ) => {
    // 同 IR 的独立 SR 不能只靠编号区分；名称与分工视角必须来自产生待办的同一快照。
    const sr = extra.srId
      ? view.srs.find(
          (row) =>
            row.projectId === group.projectId && row.irId === group.id && row.id === extra.srId,
        )
      : undefined;
    result.push({
      id: `${group.projectId}:${group.id}:${kind}:${extra.srId ?? extra.perspective ?? ""}`,
      // 跨项目待办不能从当前项目投影补名字或 Release；由同一 IR 事实一次派生。
      projectId: group.projectId,
      irId: group.id,
      requirementTitle: group.title,
      releaseId: group.releaseId,
      srTitle: sr?.title,
      assignmentPerspective,
      kind,
      title,
      employeeId,
      selection: {
        projectId: group.projectId,
        irId: group.id,
        ...(extra.srId ? { srId: extra.srId, formalView: "detail" as const } : {}),
      },
      ...extra,
    });
  };
  for (const group of view.drafts) {
    const state = proposalState(group);
    if (!state) continue;
    const contact = group.contacts ?? {};
    // 退回保留旧评审用于追溯，但未补充前的当前动作只能是业务讨论，不能再次判断旧报告。
    if (group.returnFeedback && !group.returnFeedback.resumedAt) {
      push(group, "business-discussion", "讨论和补充业务需求", "business", contact.business);
      continue;
    }
    if (state === "merge-pending") {
      if (["failed", "incomplete"].includes(group.proposalDelivery?.mergeCheck?.status ?? ""))
        push(
          group,
          "failure",
          "处理文档 PR 核验失败或材料不完整",
          "development",
          contact.development,
        );
      continue;
    }
    if (
      state === "submission-pending" &&
      proposalDeliveryCurrent(group) &&
      group.proposalDelivery?.pushedAt &&
      !group.requirementsPr
    ) {
      push(
        group,
        "failure",
        "文档已推送但创建 PR 失败，请重试当前候选",
        "development",
        contact.development,
      );
      continue;
    }
    const original = state === "ir-review-pending" || state === "ir-confirmation-pending";
    const solutionReview =
      state === "solution-review-pending" || state === "solution-confirmation-pending";
    const review = original ? group.originalReview : solutionReview ? group.review : undefined;
    const current = original
      ? requirementsReviewCurrent(group)
      : solutionReview && fullReviewCurrent(group);
    if (current && review?.agents?.some((agent) => agent.status === "failed")) {
      push(
        group,
        "failure",
        "处理评审失败并重试",
        original ? "business" : "development",
        original ? contact.business : contact.development,
      );
      continue;
    }
    if (
      current &&
      review?.agents?.some((agent) => agent.status === "running" || agent.status === "pending")
    )
      continue;
    if (state === "not-started" || state === "ir-review-pending") {
      push(
        group,
        current ? "original-review" : "business-discussion",
        current ? "处理 IR 评审意见" : "完善业务需求并送审",
        "business",
        contact.business,
      );
    } else if (state === "ir-confirmation-pending") {
      push(group, "original-review", "人工确认当前 IR 评审", "business", contact.business);
    } else if (state === "solution-incomplete" || state === "solution-review-pending") {
      push(
        group,
        state === "solution-review-pending" && current ? "full-review" : "solution",
        state === "solution-review-pending" && current
          ? "处理完整审查意见"
          : "拆分 SR 并完善完整材料",
        "development",
        contact.development,
      );
    } else if (state === "solution-confirmation-pending") {
      if (fullReviewBlocker(group)) {
        push(group, "full-review", "人工放行当前完整方案", "development", contact.development);
        continue;
      }
      const version = proposalVersion(group);
      for (const perspective of ["business", "development", "testing"] as const)
        if (
          !group.alignment?.some(
            (entry) => entry.perspective === perspective && entry.version === version,
          )
        )
          push(
            group,
            "alignment",
            `${{ business: "业务", development: "开发", testing: "测试" }[perspective]}视角确认`,
            perspective,
            contact[perspective],
            { perspective },
          );
    } else if (state === "submission-pending") {
      push(group, "publish", "提交整包文档 PR", "development", contact.development);
    }
  }
  for (const group of view.groups) {
    for (const sr of view.srs.filter(
      (row) => row.projectId === group.projectId && row.irId === group.id,
    )) {
      if (
        sr.testAcceptance?.outcome === "passed" &&
        sr.testAcceptance.codeVersion === sr.codeMerge?.commit
      )
        continue;
      if (sr.lastAnalysisFailure || sr.progress?.analysisFailure) {
        // 修复：通用 failure 同时代表分支和评审失败，单列分析失败才能稳定直达对应 SR 的重试入口。
        push(
          group,
          "analysis-failure",
          "查看进度分析失败并通过正常入口重试",
          "development",
          sr.developerEmployeeId,
          { srId: sr.id },
        );
        continue;
      }
      if (sr.trackingBranch?.status === "failed") {
        push(group, "failure", "处理 SR 开发分支创建失败", "development", sr.developerEmployeeId, {
          srId: sr.id,
        });
      } else if (sr.developmentIssues?.some((issue) => issue.status === "open")) {
        push(
          group,
          "fix",
          "处理测试失败问题并等待修复合入",
          "development",
          sr.developerEmployeeId,
          { srId: sr.id },
        );
      } else if (sr.codeMerge) {
        push(group, "testing", "记录当前合入版本测试验收", "testing", sr.testingEmployeeId, {
          srId: sr.id,
        });
      } else
        push(
          group,
          "development",
          "在平台外开发并查看审查意见",
          "development",
          sr.developerEmployeeId,
          { srId: sr.id },
        );
    }
  }
  return result;
}
