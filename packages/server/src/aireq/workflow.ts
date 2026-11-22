import { businessRule, businessFailureMessage } from "./errors.js";
import type { InternalWorkflowAction, RequirementGroup, WorkflowState } from "./workflow-state.js";
import {
  proposalVersion,
  proposalState,
  proposalPrCurrent,
  proposalReviewCanRetry,
  proposalReviewSubmitBlocker,
  proposalReturnBlocker,
  deriveAIReqTodos,
  hasProjectRole,
  AIREQ_ROLE_ADMINISTRATOR,
  fullReviewReadyBlocker,
  fullReviewCurrent,
  requirementsReviewCurrent,
} from "@zcode/services/aireq";
import {
  prototypeProposalMaterialsIssue,
  validatePrototypeProposalPublication,
  observePrototypeProposalMr,
  completePrototypeProposal,
} from "./proposal-delivery.js";
import {
  prototypeProposalRepositoryIssue,
  readPrototypeProposalPrHandoff,
} from "./proposal-pr-handoff.js";
import { createPrototypeEvent } from "./events.js";
import {
  projectNativeContext,
  projectDirectory,
  projectReceipt,
  projectReleases,
  projectRequirement,
  projectRoleRegistration,
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
  applyGitDocumentSnapshot,
  createPrototypeGitDocumentSource,
  type GitDocumentSnapshot,
} from "./proposal-storage.js";
import {
  applyProposalMutation,
  stageNativeProposalOutput,
  type NativeProposalOutput,
} from "./proposal-mutations.js";
import { createPrototypeWorkflow } from "./fixtures.js";
export { DEFAULT_SELECTION } from "./fixture-builders.js";
let state = createPrototypeWorkflow();
const prototypeGit = createPrototypeGitDocumentSource(state);
export const readPrototypeGitDocuments = prototypeGit.read;
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
/** Settings writes call this synchronously before a command or merge poll can read the new target. */
export function notifyPrototypeProjectSettingsChanged(): void {
  state.projects = readPrototypeProjectSettings().projects;
  state.revision += 1;
  prototypeWorkflowChanges.fire();
}

/** 原型五秒轮询检查内部 MR 生命周期，不连接真实 Git、PR API 或模型。 */
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
    const observation = observePrototypeProposalMr(group, now);
    if (observation === "unmerged") {
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
    const project = state.projects.find((item) => item.id === group.projectId);
    const issue =
      prototypeProposalRepositoryIssue(group, project) ??
      (observation === "stale-version"
        ? "合入证据对应旧版本，当前需求不能转正。"
        : observation === "incomplete"
          ? "合入提交缺少当前候选的完整文件清单。"
          : prototypeProposalMaterialsIssue(state, group));
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
      message: "当前候选已登记合入且材料版本完整，提案转正，正式文档可查阅。",
    };
    const operation = receipt(
      "提案合入登记与材料版本检查，并归档正式文档",
      ++state.revision,
      group.id,
    );
    operation.startedAt = at;
    operation.completedAt = at;
    const target = completePrototypeProposal(state, group, at);
    prototypeGit.recordMerge(state, group, target);
    state.operations.push(operation);
  }
  if (checked) {
    // 检查时间更新只刷新投影，不推进业务修订。
    prototypeWorkflowChanges.fire();
  }
}

export function requireProjectRole(
  projectId: string | undefined,
  role: "development" | "testing",
): void {
  if (!hasProjectRole(state, projectId, getEmployeeId(), role))
    throw businessRule(
      role === "development"
        ? "请先申请并获批当前项目的开发角色。"
        : "请先申请并获批当前项目的测试角色。",
    );
}

function canSyncFormalDocuments(projectId: string | undefined): boolean {
  return (
    hasProjectRole(state, projectId, getEmployeeId(), "development") ||
    hasProjectRole(state, projectId, getEmployeeId(), "testing")
  );
}

export function getPrototypeProposalPrHandoff(target: { projectId: string; irId: string }) {
  const matches = (item: RequirementGroup) =>
    item.id === target.irId && item.projectId === target.projectId;
  const group = state.drafts.find(matches) ?? state.groups.find(matches);
  if (!group) throw businessRule("需求不存在或已删除。");
  const project = state.projects.find((item) => item.id === target.projectId);
  return readPrototypeProposalPrHandoff(group, project);
}

function requireArchivedFormalGroup(target: { projectId: string; irId: string }): RequirementGroup {
  if (!canSyncFormalDocuments(target.projectId))
    throw businessRule("需要当前项目已授权的开发或测试角色。");
  const group = state.groups.find(
    (item) => item.projectId === target.projectId && item.id === target.irId,
  );
  if (!group?.merge || !group.files.length) throw businessRule("只有已归档的正式文档可以同步。");
  return group;
}

/** 核验角色、归档事实和当前仓库设置，不构建公共视图。 */
export function readPrototypeFormalGitTarget(target: { projectId: string; irId: string }): {
  group: { id: string; srIds: string[] };
  project: { id: string; repositoryId: string; repositoryUrl: string; defaultBranch: string };
} {
  const group = requireArchivedFormalGroup(target);
  const project = state.projects.find((item) => item.id === target.projectId);
  if (!project?.repositoryUrl) throw businessRule("请先为项目配置 Git 仓库。");
  return {
    group: { id: group.id, srIds: [...group.srIds] },
    project: {
      id: project.id,
      repositoryId: project.repositoryId,
      repositoryUrl: project.repositoryUrl,
      defaultBranch: project.defaultBranch,
    },
  };
}

export function getPrototypeWorkflow(
  selection: AIReqWorkflowTarget = DEFAULT_SELECTION,
): AIReqWorkflowView {
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  const employeeId = getEmployeeId();
  const roleAdministrator = employeeId === AIREQ_ROLE_ADMINISTRATOR;
  const groups = state.groups.filter((item) => item.projectId === projectId);
  const drafts = state.drafts.filter((item) => item.projectId === projectId);
  const irIds = new Set<string>();
  for (const group of groups) irIds.add(group.id);
  for (const group of drafts) irIds.add(group.id);
  return {
    revision: state.revision,
    documentFormats: state.documentFormats,
    ideas: state.ideas,
    roleAdministrator,
    roleRegistrations:
      state.roleRegistrations
        ?.filter((entry) => roleAdministrator || entry.employeeId === employeeId)
        .map(projectRoleRegistration) ?? [],
    todos: deriveAIReqTodos(state).filter((todo) =>
      hasProjectRole(state, todo.projectId, employeeId, todo.assignmentPerspective),
    ),
    projects: state.projects.map(projectSummary),
    releases: projectReleases(state, readPrototypeProjectReleases()),
    groups: groups.map(projectRequirement),
    drafts: drafts.map(projectRequirement),
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
  view: Pick<AIReqWorkflowView, "drafts">,
  selection: AIReqWorkflowTarget,
): AIReqNativeSessionRef | undefined {
  if (!selection.irId) return;
  const projectId = selection.projectId ?? DEFAULT_SELECTION.projectId;
  if (selection.srId) return;
  const proposal = view.drafts.find(
    (item) => item.projectId === projectId && item.id === selection.irId,
  );
  if (!proposal) return;
  const viewed = proposalViewedIndex(proposal, selection);
  if (viewed === 2 && !canSyncFormalDocuments(proposal.projectId)) return;
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
  request?: { operationId: string; gitSnapshot?: GitDocumentSnapshot },
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
  if (action.type === "requestProjectRoles" || action.type === "decideProjectRole") {
    if (!isEmployeeId(getEmployeeId()) || !readPrototypeProjectSetting(action.projectId))
      throw businessRule("请使用有效工号并选择已有项目。");
    if (action.type === "requestProjectRoles") {
      if (
        !action.roles.length ||
        new Set(action.roles).size !== action.roles.length ||
        action.roles.some((role) => role !== "development" && role !== "testing")
      )
        throw businessRule("请选择开发或测试角色。");
      if (
        action.roles.some((role) =>
          hasProjectRole(state, action.projectId, getEmployeeId(), role),
        ) ||
        state.roleRegistrations?.some(
          (entry) =>
            entry.projectId === action.projectId &&
            entry.employeeId === getEmployeeId() &&
            action.roles.includes(entry.role) &&
            entry.status === "pending",
        )
      )
        throw businessRule("所选角色已有待审批或已获批记录，请重新选择。");
    } else {
      if (getEmployeeId() !== AIREQ_ROLE_ADMINISTRATOR)
        throw businessRule("只有管理员可以处理角色申请。");
      const entry = state.roleRegistrations?.find(
        (item) => item.id === action.registrationId && item.projectId === action.projectId,
      );
      const expected = action.decision === "revoked" ? "approved" : "pending";
      if (entry?.status !== expected) throw businessRule("申请状态已变化，请重新读取。");
    }
  }
  if (action.type === "syncFormalDocuments") {
    requireArchivedFormalGroup(action);
    if (!request?.gitSnapshot) throw businessRule("Git 快照未读取，请重新同步。");
  }
  if (action.type === "confirmAlignment" && action.perspective !== "business")
    requireProjectRole(targetProjectId, action.perspective);
  if (
    action.type === "generateProposalSolution" ||
    action.type === "runFullReview" ||
    action.type === "publishProposal" ||
    action.type === "closeProposalPr" ||
    (action.type === "submitProposalReview" && action.kind === "full") ||
    (action.type === "reviseProposalMaterial" && action.target === "solution")
  )
    requireProjectRole(targetProjectId, "development");
  if (action.type === "reviseProposalMaterial" && action.target === "test-plan") {
    if (!canSyncFormalDocuments(targetProjectId))
      throw businessRule("需要当前项目已授权的开发或测试角色。");
  }
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
    "requestProjectRoles",
    "decideProjectRole",
    "syncFormalDocuments",
  ].includes(action.type);
  if (action.type === "assignContacts") {
    if (!targetProposal) throw businessRule("只能为未转正的需求提案分工。");
    if (
      !action.contacts ||
      Object.keys(action.contacts).some(
        (key) => !["business", "development", "testing"].includes(key),
      ) ||
      Object.values(action.contacts).some((value) => value !== undefined && !isEmployeeId(value))
    )
      throw businessRule("联系人须为合法工号，空归属请清除该字段。");
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
    if (!inRequirements) requireProjectRole(targetProjectId, "development");
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
      targetProposal.freeze)
  )
    throw businessRule("正式提案的修订必须保留原入库记录，不能作为普通草稿删除。");
  if (
    action.type === "deleteRequirement" &&
    state.groups.some(
      (item) =>
        item.projectId === targetProjectId &&
        item.id === (action.irId ?? selection.irId) &&
        (item.merge || item.freeze),
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
    "requestProjectRoles",
    "decideProjectRole",
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
    if (action.type === "syncFormalDocuments") {
      const group = state.groups.find(
        (entry) => entry.projectId === action.projectId && entry.id === action.irId,
      )!;
      operation.type = applyGitDocumentSnapshot(
        state,
        group,
        request!.gitSnapshot!,
        getEmployeeId(),
        operation.startedAt,
      )
        ? "Git 同步并确认"
        : "Git 文档已是最新";
    } else
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
