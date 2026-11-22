// 无缓存的即时只读投影；可变事实只由 workflow owner 持有并在调用时传入。
import type {
  AIReqNativeSessionRef,
  AIReqOperationReceipt,
  AIReqProject,
  AIReqProposalDelivery,
  AIReqRelease,
  AIReqReleaseSummary,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqWorkspace,
} from "@zcode/services/aireq";
import { PROTOTYPE_BACKEND } from "./backend.js";
import { PROTOTYPE_WORKSPACE_IDENTITY } from "./fixture-builders.js";
import { mapPrototypeProjectSettings, readPrototypeProjectSetting } from "./project-settings.js";
import { prototypeSessionReadIssue } from "./recovery.js";
import type {
  Project,
  ProposalDelivery,
  Receipt,
  RequirementGroup,
  Review,
  WorkflowState,
} from "./workflow-state.js";

export function projectSummary(project: Project): AIReqProject {
  const { id, name, revision, defaultBranch, repositoryUrl } = project;
  return {
    id,
    name,
    revision,
    defaultBranch,
    ...(repositoryUrl === undefined ? {} : { repositoryUrl }),
  };
}

export function projectReceipt(receipt: Receipt): AIReqOperationReceipt {
  return {
    operationId: receipt.operationId,
    ...(receipt.identity && { actorEmployeeId: receipt.identity.employeeId }),
    type: receipt.type,
    status: receipt.status,
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    revision: receipt.revision,
    irId: receipt.irId,
    irIds: receipt.irIds,
    srId: receipt.srId,
    steps: receipt.steps,
    error: receipt.error,
  };
}

function projectReview(review: Review): AIReqReview {
  return {
    id: review.id,
    kind: review.kind,
    snapshotDigest: review.snapshotDigest,
    passed: review.passed,
    report: review.report,
    reviewer: review.reviewer,
    createdAt: review.createdAt,
    invalidatedReason: review.invalidatedReason,
    agents: review.agents?.map(({ id, name, status, session, report }) => ({
      id,
      name,
      status,
      session,
      report,
    })),
    humanDecision: review.humanDecision,
    modelConfig: review.modelConfig,
    inputFiles: review.inputFiles,
    round: review.round,
    findings: review.findings,
  };
}

function projectDelivery(delivery: ProposalDelivery): AIReqProposalDelivery {
  return {
    candidate: delivery.candidate,
    version: delivery.version,
    files: delivery.files,
    confirmedBy: delivery.confirmedBy,
    confirmedAt: delivery.confirmedAt,
    pushedCandidate: delivery.pushedCandidate,
    pushedAt: delivery.pushedAt,
    prCandidate: delivery.prCandidate,
    branch: delivery.branch,
    publishError: delivery.publishError,
    closedPr: delivery.closedPr,
    mergeCheck: delivery.mergeCheck,
  };
}

export function projectRequirement(group: RequirementGroup): AIReqRequirementGroup {
  return {
    id: group.id,
    projectId: group.projectId,
    releaseId: group.releaseId,
    title: group.title,
    documentPath: group.documentPath,
    origin: group.origin,
    status: group.status,
    revision: group.revision,
    srIds: group.srIds,
    files: group.files,
    sessions: group.sessions,
    createdAt: group.createdAt,
    originalText: group.originalText,
    submittedBy: group.submittedBy,
    sourceIrId: group.sourceIrId,
    contacts: group.contacts,
    clientDraftId: group.clientDraftId,
    originalReview: group.originalReview && projectReview(group.originalReview),
    originalReviewHistory: group.originalReviewHistory?.map(projectReview),
    review: group.review && projectReview(group.review),
    reviewHistory: group.reviewHistory?.map(projectReview),
    alignment: group.alignment,
    alignmentHistory: group.alignmentHistory,
    requirementsCheck: group.requirementsCheck,
    solutionCheck: group.solutionCheck,
    materialHistory: group.materialHistory,
    rejectedReviewResults: group.rejectedReviewResults,
    snapshot: group.snapshot,
    requirementsPr: group.requirementsPr,
    merge: group.merge,
    proposalDelivery: group.proposalDelivery && projectDelivery(group.proposalDelivery),
    proposalDeliveryHistory: group.proposalDeliveryHistory?.map(projectDelivery),
    proposalRevisions: group.proposalRevisions?.map((revision) => ({
      reason: revision.reason,
      employeeId: revision.employeeId,
      startedAt: revision.startedAt,
      completedAt: revision.completedAt,
      snapshot: revision.snapshot,
      merge: revision.merge,
      materials: revision.materials,
      requirementsPr: revision.requirementsPr,
      delivery: revision.delivery && projectDelivery(revision.delivery),
      review: revision.review && projectReview(revision.review),
    })),
    requirementsDecisions: group.requirementsDecisions?.map((decision) => ({
      reviewId: decision.reviewId,
      snapshotDigest: decision.snapshotDigest,
      inputFiles: decision.inputFiles,
      opinion: decision.opinion,
      outcome: decision.outcome,
      result: decision.result,
      employeeId: decision.employeeId,
      createdAt: decision.createdAt,
      review: projectReview(decision.review),
    })),
    freeze: group.freeze,
    srDependencyFile: group.srDependencyFile,
    proposalStage: group.proposalStage,
    proposalRound: group.proposalRound,
    developerHandoff: group.developerHandoff,
    developerAcceptance: group.developerAcceptance,
    requirementSupplements: group.requirementSupplements,
    proposalSolution: group.proposalSolution,
    returnFeedback: group.returnFeedback,
    returnFeedbackHistory: group.returnFeedbackHistory,
    proposalLocation: group.proposalLocation,
  };
}

/** 统计只读取已登记的 Release 和同一工作流的提案／转正事实。 */
export function projectReleases(
  state: Pick<WorkflowState, "groups" | "drafts" | "projects">,
  releases: readonly AIReqRelease[],
): AIReqReleaseSummary[] {
  const byProject = new Map(
    state.projects.map(({ id }) => [id, new Map<string, AIReqReleaseSummary>()]),
  );
  const summaries: AIReqReleaseSummary[] = [];
  for (const { id, projectId, title, createdAt } of releases) {
    const index = byProject.get(projectId);
    if (!index) continue;
    const summary = { id, projectId, title, createdAt, proposalCount: 0, formalCount: 0 };
    index.set(id, summary);
    summaries.push(summary);
  }
  for (const group of state.drafts) {
    const summary = byProject.get(group.projectId)?.get(group.releaseId);
    if (summary) summary.proposalCount++;
  }
  for (const group of state.groups) {
    const summary = byProject.get(group.projectId)?.get(group.releaseId);
    if (summary) summary.formalCount++;
  }
  return summaries;
}

/** 原生会话热路径只读取其所属对象，不构建全工作流、待办或进度聚合。 */
export function projectNativeContext(
  state: WorkflowState,
  sessionId: string,
  includeRequirement = false,
):
  | {
      ref: AIReqNativeSessionRef;
      published: boolean;
      draft?: RequirementGroup;
      formal?: RequirementGroup;
    }
  | undefined {
  if (prototypeSessionReadIssue(sessionId)) return undefined;
  const ref = state.sessions.find((item) => item.sessionId === sessionId);
  if (!ref || !readPrototypeProjectSetting(ref.projectId)) return undefined;
  const matches = (item: RequirementGroup) =>
    item.projectId === ref.projectId && item.id === ref.irId;
  const draft = state.drafts.find(matches);
  const formal = state.groups.find(matches);
  if (!draft && !formal) return undefined;
  return structuredClone({
    ref,
    published: true,
    ...(includeRequirement ? { draft, formal } : {}),
  });
}

/** 项目树只读 canonical 元数据；不为目录请求派生所有项目的业务报表。 */
export function projectDirectory(state: WorkflowState): {
  projects: Pick<AIReqProject, "id" | "name">[];
  sessions: AIReqNativeSessionRef[];
  workspaces: Record<string, AIReqWorkspace>;
  skillDesignWorkspacePath: string;
} {
  const entries = mapPrototypeProjectSettings((project) => ({
    project: { id: project.id, name: project.name },
    workspace: projectWorkspace(project),
  }));
  const projectIds = new Set(entries.map(({ project }) => project.id));
  const groups = new Set(
    [...state.groups, ...state.drafts].map((group) => JSON.stringify([group.projectId, group.id])),
  );
  const sessions = state.sessions.filter(
    (ref) =>
      projectIds.has(ref.projectId) &&
      groups.has(JSON.stringify([ref.projectId, ref.irId])) &&
      !prototypeSessionReadIssue(ref.sessionId),
  );
  return {
    projects: entries.map(({ project }) => project),
    sessions: structuredClone(sessions),
    workspaces: Object.fromEntries(entries.map(({ project, workspace }) => [project.id, workspace])),
    skillDesignWorkspacePath: PROTOTYPE_BACKEND.configDirectory,
  };
}

function projectWorkspace(project?: Readonly<Project>): AIReqWorkspace {
  return {
    path: project?.root,
    identity: `${PROTOTYPE_WORKSPACE_IDENTITY}:${project?.id ?? "personal"}`,
    kind: project ? "proposal" : "unavailable",
  };
}

/** 项目目录、bootstrap 和详情只从同源设置投影工作区。 */
export function readProjectWorkspaces(): Record<string, AIReqWorkspace> {
  return Object.fromEntries(
    mapPrototypeProjectSettings((project) => [project.id, projectWorkspace(project)] as const),
  );
}

export function readProjectWorkspace(projectId?: string): AIReqWorkspace {
  return projectWorkspace(readPrototypeProjectSetting(projectId));
}
