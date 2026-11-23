import { businessRule } from "./errors.js";
import type { InternalWorkflowAction, RequirementGroup, WorkflowState } from "./workflow-state.js";
import {
  proposalVersion,
  proposalState,
  proposalReviewCanRetry,
  proposalReviewSubmitBlocker,
  proposalReturnBlocker,
  hasProjectRole,
  AIREQ_ROLE_ADMINISTRATOR,
  fullReviewReadyBlocker,
  fullReviewCurrent,
  requirementsReviewCurrent,
} from "@zcode/services/aireq";
import { validatePrototypeProposalArchive } from "./proposal-delivery.js";
import { createPrototypeEvent } from "./events.js";
import {
  projectNativeContext,
  projectDirectory,
  projectReceipt,
  projectReleases,
  projectRequirement,
  projectSessionRef,
  projectSummary,
  projectSystemRequirement,
  readProjectWorkspace,
  readProjectWorkspaces,
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
import { readPrototypeProjectSetting, readPrototypeProjectSettings } from "./project-settings.js";
import { readPrototypeProjectReleases } from "./project-releases.js";
import type {
  AIReqCommandTarget,
  AIReqMaterialReadRequest,
  AIReqNativeSessionRef,
  AIReqWorkflowResult,
  AIReqWorkflowTarget,
  AIReqWorkflowView,
  AIReqWorkspace,
} from "@zcode/services/aireq";

import { DEFAULT_SELECTION, receipt } from "./fixture-builders.js";
import {
  applyProposalMutation,
  stageNativeProposalOutput,
  type NativeProposalOutput,
} from "./proposal-mutations.js";
import { createPrototypeWorkflow } from "./fixtures.js";
export { DEFAULT_SELECTION } from "./fixture-builders.js";
let state = createPrototypeWorkflow();
export const prototypeWorkflowChanges = createPrototypeEvent<void>();
/** 同一个业务 owner 的事务入口：callback 失败或返回 false 时不发布任何修改。 */
function mutatePrototypeWorkflow(update: (next: WorkflowState) => void | boolean): void {
  const next = structuredClone(state);
  if (update(next) === false) return;
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
      ) {
        (proposal.rejectedReviewResults ??= []).push({
          reviewId: run.reviewId,
          at: new Date().toISOString(),
          reason: "该评审结果对应的轮次或材料版本已过期，未采用",
        });
        return;
      }
      continueToSummary = advancePrototypeReview(current);
    });
    if (continueToSummary) schedulePrototypeReview(run);
  });
}
export function readPrototypeWorkflowRevision(): number {
  return state.revision;
}

/** 即时读取唯一 owner，不派生或缓存完整业务报表。 */
export function readPrototypeNativeContext(sessionId: string, includeRequirement = false) {
  return projectNativeContext(state, sessionId, includeRequirement);
}
export function readPrototypeProjectDirectory() {
  return projectDirectory(state);
}
export function readPrototypeProjectWorkspace(projectId?: string) {
  return readProjectWorkspace(projectId);
}
export function readPrototypeProjectWorkspaces(): Record<string, AIReqWorkspace> {
  return readProjectWorkspaces();
}
/** Settings writes call this synchronously before the next command reads settings. */
export function notifyPrototypeProjectSettingsChanged(): void {
  state.projects = readPrototypeProjectSettings().projects;
  state.revision += 1;
  prototypeWorkflowChanges.fire();
}

export function requireProjectRole(
  projectId: string | undefined,
  role: "development" | "testing",
): void {
  if (!hasProjectRole(state, projectId, getEmployeeId(), role))
    throw businessRule(
      role === "development" ? "此操作需要当前项目的开发角色。" : "此操作需要当前项目的测试角色。",
    );
}

function canViewSolutionSession(projectId: string | undefined): boolean {
  return (
    hasProjectRole(state, projectId, getEmployeeId(), "development") ||
    hasProjectRole(state, projectId, getEmployeeId(), "testing")
  );
}

export function getPrototypeWorkflow(
  selection: AIReqWorkflowTarget = DEFAULT_SELECTION,
): AIReqWorkflowView {
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  const employeeId = getEmployeeId();
  const roleAdministrator = employeeId === AIREQ_ROLE_ADMINISTRATOR;
  const requirements = [...state.drafts, ...state.groups].filter(
    (item) => item.projectId === projectId,
  );
  const irIds = new Set(requirements.map((item) => item.id));
  return {
    revision: state.revision,
    documentFormats: state.documentFormats,
    ideas: state.ideas,
    roleAdministrator,
    projectRoleMembers: state.projectRoleMembers,
    projects: state.projects.map(projectSummary),
    releases: projectReleases(state, readPrototypeProjectReleases()),
    requirements: requirements.map(projectRequirement),
    srs: state.srs.filter((item) => item.projectId === projectId).map(projectSystemRequirement),
    materials: state.materials
      .filter((item) => item.projectId === projectId)
      .map(readPrototypeMaterial),
    sessions: state.sessions
      .filter((item) => item.projectId === projectId && !prototypeSessionReadIssue(item.sessionId))
      .map(projectSessionRef),
    running: state.running.filter((item) => item.projectId === projectId).map(projectSessionRef),
    operations: state.operations
      .filter(
        (item) =>
          (!item.irId && !item.irIds?.length) ||
          (item.irId !== undefined && irIds.has(item.irId)) ||
          item.irIds?.some((irId) => irIds.has(irId)),
      )
      .map(projectReceipt),
  };
}
/** 提案内的 IR/SR 是查看目标；业务需求会话始终归属于整份提案。 */
export function resolvePrototypeSession(
  view: Pick<AIReqWorkflowView, "requirements">,
  selection: AIReqWorkflowTarget,
): AIReqNativeSessionRef | undefined {
  if (!selection.irId) return;
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  if (selection.srId) return;
  const proposal = view.requirements.find(
    (item) => item.projectId === projectId && item.id === selection.irId,
  );
  if (!proposal || proposal.archive) return;
  const viewed = proposalViewedIndex(proposal, selection);
  if (viewed === 2 && !canViewSolutionSession(proposal.projectId)) return;
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

export function stagePrototypeNativeMaterials(
  proposal: RequirementGroup,
  kind: NativeProposalOutput["kind"],
  text: string,
): NativeProposalOutput {
  return stageNativeProposalOutput(state, proposal, kind, text);
}

/** Validate and commit a business command in the single workflow owner. */
export function applyPrototypeAction(
  action: InternalWorkflowAction,
  selection: AIReqCommandTarget,
  stagedOutput?: NativeProposalOutput,
  request?: { operationId: string },
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
  if (action.type === "addProjectRoleMember" || action.type === "removeProjectRoleMember") {
    if (getEmployeeId() !== AIREQ_ROLE_ADMINISTRATOR)
      throw businessRule("只有管理员可以修改项目角色名单。");
    if (!readPrototypeProjectSetting(action.projectId) || !isEmployeeId(action.employeeId))
      throw businessRule("请选择已有项目并输入有效工号。");
    if (action.employeeId === AIREQ_ROLE_ADMINISTRATOR)
      throw businessRule("管理员已拥有所有项目的开发和测试权限。");
    const exists = state.projectRoleMembers.some(
      (entry) =>
        entry.projectId === action.projectId &&
        entry.employeeId === action.employeeId &&
        entry.role === action.role,
    );
    if (action.type === "addProjectRoleMember" && exists)
      throw businessRule("该工号已在当前角色名单中。");
    if (action.type === "removeProjectRoleMember" && !exists)
      throw businessRule("该工号已不在当前角色名单中，请重新读取。");
  }
  if (action.type === "confirmAlignment" && action.perspective !== "business")
    requireProjectRole(targetProjectId, action.perspective);
  if (
    action.type === "generateProposalSolution" ||
    action.type === "runFullReview" ||
    action.type === "archiveProposal" ||
    (action.type === "submitProposalReview" && action.kind === "full")
  )
    requireProjectRole(targetProjectId, "development");
  const proposalAction = ![
    "createIdea",
    "importIdeas",
    "updateIdea",
    "transferIdea",
    "saveDocumentFormats",
    "createRelease",
    "createProposal",
    "importProposals",
    "addProjectRoleMember",
    "removeProjectRoleMember",
  ].includes(action.type);
  const currentProposalState = targetProposal ? proposalState(targetProposal) : undefined;
  // 业务状态取当前材料和批准事实；底层讨论路由标记不能阻挡材料失效后的合法重审。
  const inRequirements = ["not-started", "ir-review-pending", "ir-confirmation-pending"].includes(
    currentProposalState ?? "",
  );
  if (proposalAction) {
    if (!targetProposal) throw businessRule("请选择需求提案，正式需求不能重新进入提案流程。");
    if (!isEmployeeId(getEmployeeId())) throw businessRule("请先输入有效工号。");
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
  if (action.type === "returnProposal") {
    // 业务尚未确认时可以直接回澄清，在讨论中说明需要完善的内容。
    if (!action.reason.trim() && !(inRequirements && action.target !== "solution"))
      throw businessRule("请填写退回原因。");
    const issue = proposalReturnBlocker(targetProposal!, action.target);
    if (issue) throw businessRule(issue);
    if (!inRequirements) requireProjectRole(targetProjectId, "development");
  }
  if (action.type === "archiveProposal")
    validatePrototypeProposalArchive(state, targetProposal!, action.candidate);
  if (
    action.type === "deleteRequirement" &&
    (!targetProposal ||
      targetProposal.proposalRevisions?.length ||
      targetProposal.archive ||
      targetProposal.freeze)
  )
    throw businessRule("正式提案的修订必须保留归档记录，不能作为普通草稿删除。");
  if (
    action.type === "deleteRequirement" &&
    state.groups.some(
      (item) =>
        item.projectId === targetProjectId &&
        item.id === (action.irId ?? selection.irId) &&
        (item.archive || item.freeze),
    )
  )
    throw businessRule("已归档需求的材料及历史须保留。");
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
    "addProjectRoleMember",
    "removeProjectRoleMember",
  ].includes(action.type);
  let irId =
    action.type === "importProposals" || globalAction ? undefined : (action.irId ?? selection.irId);
  const srId =
    proposalAction || action.type === "importProposals" || globalAction
      ? undefined
      : (action.srId ?? selection.srId);
  const operation = receipt(action.type, ++state.revision, irId, srId, new Date().toISOString());
  // 请求回执元数据与状态在同一事务形成，不能发布事件后再覆盖导致返回投影和回执不一致。
  if (request) operation.operationId = request.operationId;
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
      stagedOutput,
    );
  } catch (error) {
    state = previous;
    throw error;
  }
  state.operations.push(operation);
  for (const run of reviewRuns) schedulePrototypeReview(run);
  prototypeWorkflowChanges.fire();
  return {
    projectId,
    irId,
    receipt: projectReceipt(operation),
    transferredRequirements:
      action.type === "transferIdea"
        ? action.targets.map((target, index) => ({ ...target, irId: operation.irIds![index]! }))
        : undefined,
    ...(action.type === "saveDocumentFormats" && {
      documentFormatSnapshot: { documentFormats: state.documentFormats, revision: state.revision },
    }),
  };
}
