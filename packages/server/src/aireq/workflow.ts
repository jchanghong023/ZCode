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
  completeProposalPaths,
  deriveAIReqTodos,
  fullReviewReadyBlocker,
  fullReviewBlocker,
  requirementsReviewInputs,
  fileVersions,
} from "@zcode/services/aireq";
import { proposalDependencyMaterialIssue } from "@zcode/services/aireq";
import {
  ensurePrototypeProposalMr,
  isPrototypeProposalDeliveryAction,
  validatePrototypeProposalDeliveryAction,
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
  consumePrototypeOperationFailure,
} from "./recovery.js";
import {
  prototypeReviewModelBindings,
  createPrototypeRequirementsReview,
} from "./requirements-review.js";
import {
  requirementsReviewStartBlocker,
  requirementsReviewReadyBlocker,
  requirementsReviewBlocker,
  proposalViewedIndex,
} from "@zcode/services/aireq";
import { currentIdentity, getEmployeeId, isEmployeeId } from "./identity.js";
import { hasCurrentProposalSolution } from "@zcode/services/aireq";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import type {
  AIReqMaterialView,
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
for (const group of state.drafts.filter(
  (item) => item.status === "requirements-pr" && hasCurrentProposalSolution(item),
)) {
  const candidate = `sample-pushed-${group.id}`;
  group.proposalDelivery = {
    candidate,
    version: proposalVersion(group),
    files: structuredClone(group.files),
    confirmedBy: group.developerAcceptance?.employeeId ?? "j00808874",
    confirmedAt: createdAt,
    pushedCandidate: candidate,
    pushedAt: createdAt,
    branch: {
      name: `ir/${group.id}`,
      baseCommit: prototypeDefaultCommit(state, group.projectId),
      createdAt,
      pushedAt: createdAt,
    },
    mergeCheck: { status: "waiting", message: "MR 已自动创建，等待人工评审合并与后台定时核验。" },
  };
  ensurePrototypeProposalMr(group);
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
      const digest =
        held.kind === "full"
          ? proposalVersion(proposal)
          : fileVersions(requirementsReviewInputs(proposal) ?? []);
      // 旧回调必须同时匹配轮次身份和输入；仅匹配材料不能复活被替代的批准。
      if (current?.id !== held.id || held.snapshotDigest !== digest || current.invalidatedReason) {
        proposal.rejectedReviewResults ??= [];
        proposal.rejectedReviewResults.push({
          reviewId: held.id,
          at: new Date().toISOString(),
          reason: "该评审结果对应的轮次或材料版本已过期，未采用",
        });
        continue;
      }
      const completed = createPrototypeRequirementsReview(
        proposal,
        held.requestedBy ?? "platform",
        false,
        held.kind ?? "original",
      );
      for (const agent of current.agents ?? []) {
        const result = completed.agents?.find((item) => item.id === agent.id);
        agent.status = "completed";
        agent.report =
          result?.report ?? `本轮材料版本 ${current.snapshotDigest} 的状态已完成，仍需人工判断。`;
      }
      current.report = current.agents?.at(-1)?.report ?? "";
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
  if (!group?.proposalDelivery?.pushedAt) throw businessRule("请先完成方案并推送提案分支。");
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
    const delivery = group.proposalDelivery;
    if (
      group.status !== "requirements-pr" ||
      !delivery?.pushedAt ||
      delivery.pushedCandidate !== delivery.candidate
    )
      continue;
    checked = true;
    const at = new Date().toISOString();
    const nextCheckAt = new Date(Date.now() + 5000).toISOString();
    const scenario = observePrototypeProposalMr(group, Date.now());
    if (scenario === "failed") {
      delivery.mergeCheck = {
        status: "failed",
        checkedAt: at,
        nextCheckAt,
        message: "本轮合入检查失败，保留最后结果，下一轮定时重试。",
      };
      continue;
    }
    const mr = group.requirementsPr;
    if (!mr?.number || delivery.prCandidate !== delivery.candidate) {
      delivery.mergeCheck = {
        status: "failed",
        checkedAt: at,
        nextCheckAt,
        message: "当前候选缺少对应的 MR 记录，保留提案，不转正。",
      };
      continue;
    }
    if (scenario === "mr-closed") {
      if (mr.status !== "closed") {
        mr.status = "closed";
        state.revision += 1;
      }
      delivery.mergeCheck = {
        status: "unmerged",
        checkedAt: at,
        nextCheckAt,
        message: "MR 已关闭且未合入，保留提案，不转正。",
      };
      continue;
    }
    if (scenario === "stale-version") {
      delivery.mergeCheck = {
        status: "incomplete",
        checkedAt: at,
        nextCheckAt,
        message: "合入证据对应旧版本，当前需求不能转正。",
      };
      continue;
    }
    if (scenario === "unmerged") {
      if (mr.status !== "opened") {
        mr.status = "opened";
        state.revision += 1;
      }
      delivery.mergeCheck = {
        status: "unmerged",
        checkedAt: at,
        nextCheckAt,
        message: "当前 MR 状态为待合入，保留提案；后续继续检查候选状态与材料版本。",
      };
      continue;
    }
    if (mr.status !== "merged") {
      mr.status = "merged";
      state.revision += 1;
    }
    const expected = completeProposalPaths(group);
    const complete =
      hasCurrentProposalSolution(group) &&
      delivery.version === proposalVersion(group) &&
      !proposalDependencyMaterialIssue(group, state.materials) &&
      expected.length >= 8 &&
      expected.every(
        (path) =>
          path &&
          state.materials.some(
            (material) =>
              material.projectId === group.projectId &&
              material.irId === group.id &&
              material.path === path &&
              material.valid &&
              !material.error &&
              Boolean(material.content?.trim()) &&
              !prototypeMaterialIssue(path) &&
              delivery.files.some(
                (file) =>
                  file.path === path &&
                  file.sha256 === material.sha256 &&
                  file.size === material.size,
              ),
          ),
      );
    if (scenario === "incomplete" || !complete) {
      delivery.mergeCheck = {
        status: "incomplete",
        checkedAt: at,
        nextCheckAt,
        message: "当前候选已登记合入，但 IR、SR 或方案文档不完整，保留提案，下一轮继续检查。",
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
      .map((item) =>
        prototypeMaterialIssue(item.path)
          ? { ...item, error: prototypeMaterialIssue(item.path), content: undefined }
          : item,
      ),
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
  // 交付阶段不绑定方案会话；历史阶段仍按用户的显式选择读取。
  if (proposal && proposalViewedIndex(proposal, selection) === 3) return;
  const selectedReview =
    proposal &&
    (proposalViewedIndex(proposal, selection) === 1
      ? proposal.originalReview
      : selection.reviewAgent
        ? proposal.review
        : undefined);
  if (selectedReview) {
    const reviewer =
      selectedReview.agents?.find(
        (agent) =>
          agent.id ===
          (selection.reviewAgent ?? (selectedReview.kind === "full" ? "summary" : "a")),
      )?.session ?? selectedReview.reviewer;
    return reviewer && "projectId" in reviewer ? reviewer : undefined;
  }
  if (!proposal) return;
  if (proposal)
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
export function getPrototypeMaterial(
  selection: AIReqSelection,
  path: string,
): AIReqMaterialView | undefined {
  return getPrototypeWorkflow(selection).materials.find(
    (item) =>
      item.irId === selection.irId &&
      item.path === path &&
      (!selection.srId || !item.srId || item.srId === selection.srId),
  );
}
/** Small UI-only transitions, not backend workflow approvals or an execution engine. */
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
      targetProposal.status === "requirements-pr" &&
      !["closeProposalPr", "publishProposal"].includes(action.type)
    )
      throw businessRule("文档 PR 已提交，当前材料冻结；请先关闭未合并 PR。");
  }
  if (action.type === "runRequirementsReview") {
    const material = state.materials.find(
      (item) =>
        item.projectId === targetProjectId &&
        item.irId === targetProposal!.id &&
        item.path === targetProposal!.documentPath,
    );
    if (
      !material?.valid ||
      !material.content?.trim() ||
      material.error ||
      prototypeMaterialIssue(material.path)
    )
      throw businessRule("IR 原始需求材料缺失或不可读取，不能评审。");
    const issue = requirementsReviewStartBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (!inRequirements) throw businessRule("原始单评审仅在业务澄清阶段发起。");
  }
  if (action.type === "acceptProposal") {
    const issue = requirementsReviewReadyBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (
      currentProposalState !== "ir-confirmation-pending" ||
      action.reviewId !== targetProposal!.originalReview?.id ||
      action.snapshotDigest !== targetProposal!.originalReview?.snapshotDigest
    )
      throw businessRule("人工通过须绑定当前原始单评审及业务文档版本。");
  }
  if (action.type === "generateRequirements" || action.type === "supplementRequirements") {
    if (!inRequirements || !action.note.trim())
      throw businessRule("请在业务澄清阶段提交明确内容。");
  }
  if (action.type === "generateProposalSolution" || action.type === "runFullReview") {
    const issue = requirementsReviewBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (!currentProposalState || inRequirements)
      throw businessRule("请先通过业务需求，再进入方案阶段。");
  }
  if (action.type === "runFullReview") {
    if (!hasCurrentProposalSolution(targetProposal!))
      throw businessRule("完整材料未齐备，不能送三路审查。");
    if (
      completeProposalPaths(targetProposal!).some(
        (path) =>
          !state.materials.some(
            (material) =>
              material.projectId === targetProjectId &&
              material.irId === targetProposal!.id &&
              material.path === path &&
              material.valid &&
              !material.error &&
              Boolean(material.content?.trim()) &&
              targetProposal!.files.some(
                (file) =>
                  file.path === path &&
                  file.sha256 === material.sha256 &&
                  file.size === material.size,
              ),
          ),
      )
    )
      throw businessRule("完整材料缺失、不可读取或版本不符。");
    prototypeReviewModelBindings();
  }
  if (action.type === "approveFullReview") {
    const issue = fullReviewReadyBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (
      action.reviewId !== targetProposal!.review?.id ||
      action.snapshotDigest !== targetProposal!.review?.snapshotDigest
    )
      throw businessRule("完整审查版本已变化，请刷新后重新判断。");
  }
  if (action.type === "confirmAlignment") {
    const issue = fullReviewBlocker(targetProposal!);
    if (issue) throw businessRule(issue);
    if (
      !["business", "development", "testing"].includes(action.perspective) ||
      action.version !== proposalVersion(targetProposal!)
    )
      throw businessRule("三方确认须绑定当前材料版本和明确视角。");
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
  if (action.type === "returnProposal" && !action.reason.trim())
    throw businessRule("请填写业务需补充的原因。");
  if (
    action.type === "closeProposalPr" &&
    (targetProposal!.status !== "requirements-pr" ||
      !targetProposal!.requirementsPr ||
      targetProposal!.requirementsPr.status === "merged" ||
      action.candidate !== targetProposal!.proposalDelivery?.candidate)
  )
    throw businessRule("只能关闭当前候选的未合并文档 PR。");
  if (isPrototypeProposalDeliveryAction(action) && targetProposal)
    validatePrototypeProposalDeliveryAction(
      getPrototypeWorkflow({ projectId: targetProjectId }),
      targetProposal,
      action,
    );
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
  // 原子导入属于本批新 IR，不得把此前查看的 IR/SR 记录为创建来源。
  const globalIdeaAction = ["createIdea", "importIdeas", "updateIdea", "transferIdea"].includes(
    action.type,
  );
  let irId =
    action.type === "importProposals" || globalIdeaAction
      ? undefined
      : (action.irId ?? selection.irId);
  const srId =
    proposalAction || action.type === "importProposals" || globalIdeaAction
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
  try {
    irId = applyProposalMutation(state, action, projectId, irId, operation, solutionDiscussion);
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
