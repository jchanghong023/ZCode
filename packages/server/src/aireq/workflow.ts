import { recordSrStatusChanges, type WorkflowUpdate } from "./sr-status-changes.js";
import { digestValue } from "./content-digest.js";
import { businessRule, businessFailureMessage } from "./errors.js";
import type {
  InternalRequirementGroup,
  InternalProposalDelivery,
  InternalWorkflowAction,
} from "./internal-scenarios.js";
import type { AIReqProposalMergeScenario, AIReqReviewScenario } from "./internal-scenarios.js";
import { PROTOTYPE_BACKEND } from "./backend.js";
import {
  proposalVersion,
  proposalState,
  proposalPrCurrent,
  proposalReviewCanRetry,
  proposalReviewSubmitBlocker,
  proposalReturnBlocker,
  deriveAIReqTodos,
  fullReviewReadyBlocker,
  fullReviewCurrent,
  requirementsReviewCurrent,
} from "@zcode/services/aireq";
import {
  closePrototypeProposalMr,
  prototypeProposalMaterialsIssue,
  validatePrototypeProposalPublication,
  observePrototypeProposalMr,
  completePrototypeProposal,
} from "./proposal-delivery.js";
import { createPrototypeEvent } from "./events.js";
import { PROTOTYPE_REVIEW_SCENARIOS, PROTOTYPE_PROPOSAL_MERGE_SCENARIOS } from "./scenarios.js";

import {
  projectNativeContext,
  projectDirectory,
  projectProgressInputs,
  readProjectWorkspace,
} from "./workflow-queries.js";

import {
  prototypeSessionReadIssue,
  prototypeMaterialIssue,
  readPrototypeMaterial,
  retryPrototypeMaterialRead,
  consumePrototypeOperationFailure,
} from "./recovery.js";
import { advancePrototypeReview, type PrototypeReviewRun } from "./requirements-review.js";
import {
  requirementsReviewReadyBlocker,
  requirementsReviewBlocker,
  proposalViewedIndex,
} from "@zcode/services/aireq";
import { currentIdentity, getEmployeeId, isEmployeeId } from "./identity.js";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import type {
  AIReqMaterialReadRequest,
  AIReqNativeSessionRef,
  AIReqSelection,
  AIReqWorkflowResult,
  AIReqWorkflowView,
} from "@zcode/services/aireq";

import {
  DEFAULT_SELECTION,
  createdAt,
  prototypeDefaultCommit,
  receipt,
} from "./fixture-builders.js";
import { applyProposalMutation } from "./proposal-mutations.js";
import { createPrototypeWorkflow } from "./fixtures.js";
export { DEFAULT_SELECTION } from "./fixture-builders.js";
let state = createPrototypeWorkflow();
// 正式 SR 的分支是平台已分配的必填映射；此处仅补齐初始内存样例，不在前端猜测。
for (const group of state.groups) {
  for (const sr of state.srs.filter(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  )) {
    sr.trackingBranch ??= {
      name: `sr/${sr.id}`,
      baseCommit: prototypeDefaultCommit(state, group.projectId),
      createdAt,
      pushedAt: createdAt,
    };
  }
}
export const prototypeWorkflowChanges = createPrototypeEvent<void>();
/** 同一个业务 owner 的事务入口：callback 失败或返回 false 时不发布任何修改。 */
export function mutatePrototypeWorkflow(update: WorkflowUpdate, recordStatusChanges = true): void {
  const next = structuredClone(state);
  if (update(next) === false) return;
  if (recordStatusChanges) recordSrStatusChanges(state, next);
  next.revision += 1;
  state = next;
  prototypeWorkflowChanges.fire();
}

function schedulePrototypeReview(run: PrototypeReviewRun): void {
  queueMicrotask(() => {
    let continueToSummary = false;
    mutatePrototypeWorkflow((view) => {
      const proposal = view.drafts.find(
        (item) => item.projectId === run.projectId && item.id === run.irId,
      );
      if (!proposal) return false;
      const full = run.kind === "full";
      const current = full ? proposal.review : proposal.originalReview;
      if (
        current?.id !== run.reviewId ||
        current.snapshotDigest !== run.snapshotDigest ||
        !(full ? fullReviewCurrent(proposal) : requirementsReviewCurrent(proposal))
      )
        return false;
      continueToSummary = advancePrototypeReview(current, run.scenario);
    }, false);
    if (continueToSummary) schedulePrototypeReview(run);
  });
}
export function readPrototypeWorkflowState(): AIReqWorkflowView {
  return structuredClone(state);
}

/** 即时读取唯一 owner，不派生或缓存完整业务报表。 */
export function readPrototypeNativeContext(sessionId: string, includeRequirement = false) {
  return projectNativeContext(state, sessionId, includeRequirement);
}
export function readPrototypeProjectDirectory() {
  return projectDirectory(state);
}
export function readPrototypeProjectProgressInputs() {
  return projectProgressInputs(state);
}
export function readPrototypeProjectWorkspace(projectId?: string) {
  return readProjectWorkspace(projectId);
}
export function setPrototypeProposalReviewScenario(
  projectId: string,
  irId: string,
  kind: "original" | "full",
  scenario: AIReqReviewScenario,
): void {
  if (
    !["original", "full"].includes(kind) ||
    !(PROTOTYPE_REVIEW_SCENARIOS as readonly string[]).includes(scenario)
  )
    throw businessRule("未知模拟评审场景。");
  mutatePrototypeWorkflow((view) => {
    const proposal = view.drafts.find((item) => item.projectId === projectId && item.id === irId);
    if (!proposal) throw businessRule("需求提案不存在。");
    const scenarios = ((proposal as InternalRequirementGroup).reviewScenarios ??= {});
    scenarios[kind] = scenario;
  });
}
export function releasePrototypeProposalReviewResults(projectId: string, irId: string): void {
  mutatePrototypeWorkflow((view) => {
    const proposal = view.drafts.find((item) => item.projectId === projectId && item.id === irId) as
      | InternalRequirementGroup
      | undefined;
    if (!proposal) throw businessRule("需求提案不存在。");
    if (!proposal.heldReviews?.length) return false;
    for (const held of proposal.heldReviews) {
      const current = held.kind === "full" ? proposal.review : proposal.originalReview;
      // A callback must refer to the same admitted round and still-current validated input.
      if (
        current?.id !== held.id ||
        current.snapshotDigest !== held.snapshotDigest ||
        !(held.kind === "full" ? fullReviewCurrent(proposal) : requirementsReviewCurrent(proposal))
      ) {
        proposal.rejectedReviewResults ??= [];
        proposal.rejectedReviewResults.push({
          reviewId: held.id,
          at: new Date().toISOString(),
          reason: "该评审结果对应的轮次或材料版本已过期，未采用",
        });
        continue;
      }
      if (advancePrototypeReview(current, "normal")) advancePrototypeReview(current, "normal");
    }
    proposal.heldReviews = [];
  });
}
export function setPrototypeBranchCreationFailure(
  projectId: string,
  irId: string,
  srId: string,
): void {
  mutatePrototypeWorkflow((view) => {
    const proposal = [...view.drafts, ...view.groups].find(
      (item) => item.projectId === projectId && item.id === irId,
    ) as InternalRequirementGroup | undefined;
    if (!proposal?.srIds.includes(srId)) throw businessRule("SR 不属于当前需求。");
    proposal.branchCreationFailures ??= [];
    if (!proposal.branchCreationFailures.includes(srId)) proposal.branchCreationFailures.push(srId);
  });
}
export function notifyPrototypeProjectSettingsChanged(): void {
  Object.assign(state, readPrototypeProjectSettings());
  state.revision += 1;
  prototypeWorkflowChanges.fire();
}

export function setPrototypeProposalMergeScenario(
  projectId: string,
  irId: string,
  scenario: AIReqProposalMergeScenario,
): void {
  const group = state.drafts.find((item) => item.projectId === projectId && item.id === irId);
  if (!group || !proposalPrCurrent(group)) throw businessRule("请先创建当前候选的文档 MR。");
  if (!(PROTOTYPE_PROPOSAL_MERGE_SCENARIOS as readonly string[]).includes(scenario))
    throw businessRule("未知 MR 检查情景。");
  (group.proposalDelivery as InternalProposalDelivery).mergeScenario = scenario;
  prototypeWorkflowChanges.fire();
}

/** 原型五秒轮询消费内部 MR 生命周期与显式外部场景，不连接真实 Git、PR API 或模型。 */
export function pollPrototypeProposalMerges(): void {
  let checked = false;
  // 转正替换 state.drafts 引用，不修改当前遍历的数组，因此无需复制快照。
  for (const group of state.drafts) {
    if (!proposalPrCurrent(group)) continue;
    const delivery = group.proposalDelivery!;
    const mr = group.requirementsPr!;
    checked = true;
    const now = Date.now();
    const at = new Date(now).toISOString();
    const nextCheckAt = new Date(now + 5000).toISOString();
    const scenario = observePrototypeProposalMr(group, now);
    if (scenario === "failed") {
      delivery.mergeCheck = {
        status: "failed",
        checkedAt: at,
        nextCheckAt,
        message: "本轮合入检查失败，保留最后结果，下一轮定时重试。",
      };
      continue;
    }
    if (scenario === "mr-closed" && mr.status === "opened") {
      delivery.mergeCheck = { status: "unmerged", checkedAt: at, message: "MR 已关闭且未合入。" };
      closePrototypeProposalMr(group, `sample-proposal-${++state.revision}`);
      continue;
    }
    if (scenario === "unmerged" || scenario === "mr-closed") {
      delivery.mergeCheck = {
        status: mr.status === "merged" ? "failed" : "unmerged",
        checkedAt: at,
        nextCheckAt,
        message:
          mr.status === "merged"
            ? "本轮状态与已观测的合入记录不一致，保留已合入事实，等待下一轮核验。"
            : "当前 MR 待合入，后续继续检查候选状态与材料版本。",
      };
      continue;
    }
    if (mr.status !== "merged") {
      mr.status = "merged";
      state.revision += 1;
    }
    const issue =
      scenario === "stale-version"
        ? "合入证据对应旧版本，当前需求不能转正。"
        : scenario === "incomplete"
          ? "合入提交缺少当前候选的完整文件清单。"
          : prototypeProposalMaterialsIssue(state, group);
    if (issue) {
      delivery.mergeCheck = {
        status: "incomplete",
        checkedAt: at,
        nextCheckAt,
        message: issue,
      };
      continue;
    }
    delivery.mergeCheck = {
      status: "merged",
      checkedAt: at,
      message: "当前候选已登记合入且材料版本完整，提案转正；各 SR 分支结果分别记录。",
    };
    const operation = receipt(
      "提案合入登记与材料版本检查，转正并登记 SR 分支结果",
      ++state.revision,
      group.id,
    );
    operation.startedAt = at;
    operation.completedAt = at;
    completePrototypeProposal(state, group, at);
    state.operations.push(operation);
  }
  if (checked) {
    // 纯检查时间变化不是业务修改，不能让其他 IR 的验收／清理表单每五秒过期。
    prototypeWorkflowChanges.fire();
  }
}

export function getPrototypeWorkflow(
  selection: AIReqSelection = DEFAULT_SELECTION,
): AIReqWorkflowView {
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  const sharedSettings = readPrototypeProjectSettings();
  return {
    ...state,
    todos: deriveAIReqTodos(state),
    ompWebId: PROTOTYPE_BACKEND.id,
    projects: sharedSettings.projects,
    currentProjectId: projectId,
    repositoryHeads: Object.fromEntries(
      sharedSettings.projects.map((project) => [
        project.repositoryId,
        prototypeDefaultCommit(state, project.id),
      ]),
    ),
    releases: readPrototypeProjectReleases(projectId),
    availableReleases: readPrototypeProjectReleases().filter((release) =>
      sharedSettings.projects.some((project) => project.id === release.projectId),
    ),
    groups: state.groups.filter((item) => item.projectId === projectId),
    drafts: state.drafts.filter((item) => item.projectId === projectId),
    srs: state.srs.filter((item) => item.projectId === projectId),
    materials: state.materials
      .filter((item) => item.projectId === projectId)
      .map(readPrototypeMaterial),
    sessions: state.sessions.filter(
      (item) => item.projectId === projectId && !prototypeSessionReadIssue(item.sessionId),
    ),
    operations: state.operations.filter(
      (item) =>
        (!item.irId && !item.irIds?.length) ||
        [...state.groups, ...state.drafts].some(
          (group) =>
            group.projectId === projectId &&
            (group.id === item.irId || item.irIds?.includes(group.id)),
        ),
    ),
    changes: state.changes?.filter((item) => item.projectId === projectId),
    selected:
      selection.irId && projectId
        ? { projectId, irId: selection.irId, ...(selection.srId ? { srId: selection.srId } : {}) }
        : undefined,
  };
}
/** 提案内的 IR/SR 是查看目标；业务需求会话始终归属于整份提案。 */
export function resolvePrototypeSession(
  view: AIReqWorkflowView,
  selection: AIReqSelection,
): AIReqNativeSessionRef | undefined {
  if (!selection.irId) return;
  const projectId = selection.projectId ?? view.currentProjectId;
  if (selection.srId) return;
  const proposal = view.drafts.find(
    (item) => item.projectId === projectId && item.id === selection.irId,
  );
  if (!proposal) return;
  const viewed = proposalViewedIndex(proposal, selection);
  // Delivery has no conversation, and a reviewer URL must never fall back to a different agent.
  if (viewed === 3) return;
  const selectedReview =
    viewed === 1
      ? (proposal.originalReview ?? proposal.originalReviewHistory?.at(-1))
      : viewed === 2 && selection.reviewAgent
        ? (proposal.review ?? proposal.reviewHistory?.at(-1))
        : undefined;
  if (viewed === 1 && selection.reviewAgent && selection.reviewAgent !== "a")
    throw businessRule("该审查 Agent 不属于所选评审。");
  if (selectedReview) {
    const reviewer = selection.reviewAgent
      ? selectedReview.agents?.find((agent) => agent.id === selection.reviewAgent)?.session
      : selectedReview.reviewer;
    return reviewer && "projectId" in reviewer ? reviewer : undefined;
  }
  if (viewed === 1 || selection.reviewAgent) return;
  return proposal.sessions
    .filter(
      (item) =>
        item.projectId === projectId &&
        item.irId === proposal.id &&
        !item.srId &&
        item.role !== "reviewer" &&
        item.phase === (selection.discussionPhase ?? proposal.proposalStage ?? "requirements"),
    )
    .sort((a, b) => b.round - a.round)[0];
}
export function getPrototypeSession(
  selection: AIReqSelection = DEFAULT_SELECTION,
): AIReqNativeSessionRef | undefined {
  return resolvePrototypeSession(getPrototypeWorkflow(selection), selection);
}
export function retryPrototypeWorkflowMaterial(request: AIReqMaterialReadRequest): boolean {
  const { projectId, releaseId, irId, path, sha256, round } = request;
  const belongs = (group: { id: string; projectId: string; releaseId: string }) =>
    group.projectId === projectId && group.releaseId === releaseId && group.id === irId;
  const material =
    (state.groups.some(belongs) || state.drafts.some(belongs)) &&
    state.materials.find(
      (item) => item.projectId === projectId && item.irId === irId && item.path === path,
    );
  if (!material) throw businessRule("材料不属于当前需求版本。");
  if (material.sha256 !== sha256 || material.round !== round)
    throw businessRule("材料版本已变化，请重新读取当前版本。");
  const hadReadIssue = prototypeMaterialIssue(material);
  const recovered = retryPrototypeMaterialRead(material);
  if (recovered && hadReadIssue) prototypeWorkflowChanges.fire();
  return recovered;
}
/** Validate and commit a business command in the single workflow owner. */
export function applyPrototypeAction(
  action: InternalWorkflowAction,
  selection: AIReqSelection,
  solutionDiscussion?: string,
  request?: { operationId: string; commandDigest: string },
): AIReqWorkflowResult {
  if (consumePrototypeOperationFailure(action.type))
    throw businessRule("操作未完成。内容和当前状态已保留，请明确重试。");
  if (action.type === "createProposal" || action.type === "importProposals") {
    const projectId = action.projectId ?? selection.projectId;
    if (
      !projectId ||
      !readPrototypeProjectReleases(projectId).some((release) => release.id === action.releaseId)
    )
      throw businessRule("请选择明确项目和有效 Release。");
    if (
      action.type === "createProposal" &&
      (typeof action.originalText !== "string" || !action.originalText.trim())
    )
      throw businessRule("请输入原始需求。");
    if (
      action.type === "importProposals" &&
      (!Array.isArray(action.proposals) ||
        !action.proposals.length ||
        action.proposals.some(
          (entry) =>
            !entry ||
            typeof entry.originalText !== "string" ||
            !entry.originalText.trim() ||
            (entry.businessDocument !== undefined &&
              (typeof entry.businessDocument !== "string" ||
                !entry.businessDocument.trim() ||
                new TextEncoder().encode(entry.businessDocument).length > 1_048_576)),
        ))
    )
      throw businessRule("导入正文无效，本批未写入任何提案。");
    if (
      action.type === "createProposal" &&
      action.sourceIrId &&
      !state.groups.some((item) => item.projectId === projectId && item.id === action.sourceIrId)
    )
      throw businessRule("来源正式 IR 不存在或不属于当前项目。");
    if (action.type === "createProposal" && action.clientDraftId) {
      const existing = state.drafts.find(
        (item) =>
          item.projectId === projectId &&
          item.releaseId === action.releaseId &&
          item.clientDraftId === action.clientDraftId &&
          item.submittedBy === getEmployeeId(),
      );
      if (existing && existing.originalText !== action.originalText.trim())
        throw businessRule("同一草稿操作身份不能提交不同原始需求。");
    }
  }
  if (action.type === "createRelease") {
    const projectId = action.projectId ?? selection.projectId;
    if (!state.projects.some((item) => item.id === projectId))
      throw businessRule("请选择已有项目。");
    if (!action.title.trim()) throw businessRule("请输入 Release 名称。");
    if (
      readPrototypeProjectReleases(projectId).some(
        (item) => item.title.toLowerCase() === action.title.trim().toLowerCase(),
      )
    ) {
      throw businessRule("此项目中已存在同名 Release，请使用其他名称。");
    }
  }
  const targetProjectId = action.projectId ?? selection.projectId ?? DEFAULT_SELECTION.projectId;
  const targetProposal = state.drafts.find(
    (item) => item.projectId === targetProjectId && item.id === (action.irId ?? selection.irId),
  );
  const proposalAction = ![
    "createIdea",
    "importIdeas",
    "updateIdea",
    "transferIdea",
    "saveDocumentFormats",
    "createRelease",
    "createProposal",
    "importProposals",
    "assignContacts",
    "retrySrBranch",
  ].includes(action.type);
  const targetGroup =
    targetProposal ??
    state.groups.find(
      (item) => item.projectId === targetProjectId && item.id === (action.irId ?? selection.irId),
    );
  if (action.type === "assignContacts") {
    if (!targetGroup) throw businessRule("IR 不存在。");
    if (
      !action.contacts ||
      Object.keys(action.contacts).some(
        (key) => !["business", "development", "testing"].includes(key),
      ) ||
      Object.values(action.contacts).some((value) => value !== undefined && !isEmployeeId(value))
    )
      throw businessRule("联系人须为合法工号，空归属请清除该字段。");
  }
  if (action.type === "retrySrBranch") {
    const formal = state.groups.find(
      (item) => item.projectId === targetProjectId && item.id === (action.irId ?? selection.irId),
    );
    const sr = state.srs.find(
      (item) =>
        item.projectId === targetProjectId && item.irId === formal?.id && item.id === action.srId,
    );
    if (
      !formal?.merge ||
      !sr?.trackingBranch ||
      sr.trackingBranch.baseCommit !== formal.merge.commit ||
      !["failed", "ready"].includes(sr.trackingBranch.status ?? "ready")
    )
      throw businessRule("仅正式 IR 已登记的失败开发分支可重试创建。");
  }
  const currentProposalState = targetProposal ? proposalState(targetProposal) : undefined;
  // 业务状态取当前材料和批准事实；底层讨论路由标记不能阻挡材料失效后的合法重审。
  const inRequirements = ["not-started", "ir-review-pending", "ir-confirmation-pending"].includes(
    currentProposalState ?? "",
  );
  if (proposalAction) {
    if (!targetProposal) throw businessRule("请选择需求提案，正式需求不能重新进入提案流程。");
    if (!isEmployeeId(getEmployeeId())) throw businessRule("请先输入有效工号。");
    if (
      proposalPrCurrent(targetProposal) &&
      !["closeProposalPr", "publishProposal", "confirmAlignment"].includes(action.type)
    )
      throw businessRule("文档 PR 已提交，当前材料冻结；请先关闭未合并 PR。");
  }
  if (
    (action.type === "runRequirementsReview" || action.type === "runFullReview") &&
    !proposalReviewCanRetry(targetProposal!, action.type === "runFullReview")
  )
    throw businessRule("只有当前材料的评审执行失败或报告缺失时才能重试。");
  if (action.type === "submitProposalReview") {
    const issue = proposalReviewSubmitBlocker(targetProposal!, action.kind);
    if (issue) throw businessRule(issue);
    if (action.snapshotDigest !== targetProposal!.snapshot?.digest)
      throw businessRule("材料版本已变化，请重新阅读后再提交评审。");
  }
  if (action.type === "acceptProposal") {
    const issue = requirementsReviewReadyBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (
      action.reviewId !== targetProposal!.originalReview?.id ||
      action.snapshotDigest !== targetProposal!.originalReview?.snapshotDigest
    )
      throw businessRule("业务确认须绑定当前需求评审及业务文档版本。");
  }
  if (action.type === "generateRequirements" || action.type === "supplementRequirements") {
    if (!inRequirements || requirementsReviewCurrent(targetProposal!) || !action.note.trim())
      throw businessRule("请在业务澄清阶段提交明确内容。");
  }
  if (action.type === "generateProposalSolution") {
    const issue = requirementsReviewBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (!currentProposalState || inRequirements)
      throw businessRule("请先通过业务需求，再进入方案阶段。");
  }
  if (action.type === "confirmAlignment") {
    const issue = fullReviewReadyBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (
      !["business", "development", "testing"].includes(action.perspective) ||
      action.version !== proposalVersion(targetProposal!) ||
      action.reviewId !== targetProposal!.review?.id ||
      action.snapshotDigest !== targetProposal!.review?.snapshotDigest
    )
      throw businessRule("三方确认须绑定当前评审、材料版本和明确角色。");
  }
  if (action.type === "reviseProposalMaterial") {
    if (!action.note.trim() || !["requirements", "solution", "test-plan"].includes(action.target))
      throw businessRule("请选择材料和明确修订内容。");
    if (
      action.target !== "requirements" &&
      (!targetProposal!.srIds.length || !currentProposalState || inRequirements)
    )
      throw businessRule("请先进入方案阶段并生成 SR 材料。");
    // 尚无方案材料时不能把修订记成成功，也不能无故清空已存在的评审批准。
    if (
      action.target !== "requirements" &&
      !state.materials.some(
        (material) =>
          material.projectId === targetProjectId &&
          material.irId === targetProposal!.id &&
          material.path.endsWith(action.target === "test-plan" ? "/test-plan.md" : "/design.md"),
      )
    )
      throw businessRule("对应方案材料尚未生成，请先完成方案讨论。");
  }
  if (action.type === "returnProposal") {
    if (!action.reason.trim()) throw businessRule("请填写业务需补充的原因。");
    const issue = proposalReturnBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
  }
  if (
    action.type === "closeProposalPr" &&
    (!proposalPrCurrent(targetProposal!) ||
      targetProposal!.requirementsPr?.status !== "opened" ||
      action.candidate !== targetProposal!.proposalDelivery?.candidate)
  )
    throw businessRule("只能关闭当前候选的未合并文档 PR。");
  if (action.type === "publishProposal")
    validatePrototypeProposalPublication(state, targetProposal!, action.candidate);
  if (
    action.type === "deleteRequirement" &&
    (!targetProposal ||
      targetProposal.proposalRevisions?.length ||
      targetProposal.merge ||
      targetProposal.developmentStartedAt)
  )
    throw businessRule("正式提案的修订必须保留原入库记录，不能作为普通草稿删除。");
  if (
    action.type === "deleteRequirement" &&
    state.groups.some(
      (item) =>
        item.projectId === targetProjectId &&
        item.id === (action.irId ?? selection.irId) &&
        (item.merge || item.developmentStartedAt),
    )
  )
    throw businessRule("已入库的正式提案须保留 Git 记录与历史，不能通过删除需求释放仓库。");
  const previous = state;
  state = structuredClone(state);
  const projectId = action.projectId ?? selection.projectId ?? "demo-aurora";
  // Global actions have no selected object; imports also create their own IRs.
  const globalAction = [
    "createIdea",
    "importIdeas",
    "updateIdea",
    "transferIdea",
    "saveDocumentFormats",
  ].includes(action.type);
  let irId =
    action.type === "importProposals" || globalAction ? undefined : (action.irId ?? selection.irId);
  const srId =
    proposalAction || action.type === "importProposals" || globalAction
      ? undefined
      : (action.srId ?? selection.srId);
  const selectedProjectId = projectId;
  const operation = receipt(action.type, ++state.revision, irId, srId, new Date().toISOString());
  // 请求回执元数据与状态在同一事务形成，不能发布事件后再覆盖导致返回投影和回执不一致。
  if (request) operation.operationId = request.operationId;
  operation.commandDigest =
    request?.commandDigest ?? digestValue([action, selection, solutionDiscussion]);
  const identity = currentIdentity();
  if (identity) operation.identity = { ...identity };
  const reviewRuns: PrototypeReviewRun[] = [];
  try {
    irId = applyProposalMutation(
      state,
      action,
      projectId,
      irId,
      operation,
      reviewRuns,
      solutionDiscussion,
    );
  } catch (error) {
    if (action.type !== "publishProposal") {
      state = previous;
      throw error;
    }
    // 推送是已完成事实；创建 PR 失败不能抹去它，也不能静默冒充成功。
    operation.status = "failed";
    operation.error = businessFailureMessage(error);
  }
  state.operations.push(operation);
  for (const run of reviewRuns) schedulePrototypeReview(run);
  prototypeWorkflowChanges.fire();
  return {
    operationId: operation.operationId,
    projectId: selectedProjectId,
    revision: state.revision,
    irId,
    srId,
    status: operation.status,
    error: operation.error,
    receipt: operation,
    deletion: operation.deletion,
    ideaId: action.type === "createIdea" ? `idea-${state.revision}` : undefined,
    transferredRequirements:
      action.type === "transferIdea"
        ? action.targets.map((target, index) => ({ ...target, irId: operation.irIds![index]! }))
        : undefined,
    view: getPrototypeWorkflow({ projectId: selectedProjectId, irId, srId }),
  };
}
