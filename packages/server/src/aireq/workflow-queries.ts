// 无缓存的即时只读投影；可变事实只由 workflow owner 持有并在调用时传入。
import type {
  AIReqNativeSessionRef,
  AIReqOperationReceipt,
  AIReqProject,
  AIReqRelease,
  AIReqReleaseSummary,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqSystemRequirement,
  AIReqWorkspace,
} from "@zcode/services/aireq";
import { PROTOTYPE_BACKEND } from "./backend.js";
import { PROTOTYPE_WORKSPACE_IDENTITY } from "./fixture-builders.js";
import { mapPrototypeProjectSettings, readPrototypeProjectSetting } from "./project-settings.js";
import { prototypeSessionReadIssue } from "./recovery.js";
import type {
  NativeSessionRef,
  Project,
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

export function projectSystemRequirement(
  requirement: AIReqSystemRequirement,
): AIReqSystemRequirement {
  const { id, projectId, irId, title, documentPath } = requirement;
  return { id, projectId, irId, title, documentPath };
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
    steps: receipt.steps,
    error: receipt.error,
  };
}

export function projectSessionRef(ref: NativeSessionRef): AIReqNativeSessionRef {
  const { projectId, irId, srId, sessionId, role, phase, round, modelConfig } = ref;
  const result: AIReqNativeSessionRef = { projectId, irId, sessionId, role, phase, round };
  if (srId !== undefined) result.srId = srId;
  if (modelConfig !== undefined) result.modelConfig = modelConfig;
  return result;
}

function projectReview(review: Review): AIReqReview {
  return {
    id: review.id,
    kind: review.kind,
    snapshotDigest: review.snapshotDigest,
    passed: review.passed,
    report: review.report,
    reviewer: "projectId" in review.reviewer ? projectSessionRef(review.reviewer) : review.reviewer,
    createdAt: review.createdAt,
    invalidatedReason: review.invalidatedReason,
    agents: review.agents?.map(({ id, name, status, session, report }) => ({
      id,
      name,
      status,
      session: projectSessionRef(session),
      report,
    })),
    humanDecision: review.humanDecision,
    modelConfig: review.modelConfig,
    inputFiles: review.inputFiles,
    round: review.round,
    findings: review.findings,
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
    sessions: group.sessions.map(projectSessionRef),
    createdAt: group.createdAt,
    originalText: group.originalText,
    submittedBy: group.submittedBy,
    sourceIrId: group.sourceIrId,
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
    archive: group.archive,
    proposalDelivery: group.proposalDelivery,
    proposalDeliveryHistory: group.proposalDeliveryHistory,
    proposalRevisions: group.proposalRevisions?.map((revision) => ({
      reason: revision.reason,
      employeeId: revision.employeeId,
      startedAt: revision.startedAt,
      completedAt: revision.completedAt,
      snapshot: revision.snapshot,
      archive: revision.archive,
      materials: revision.materials,
      delivery: revision.delivery,
      review: revision.review && projectReview(revision.review),
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
    const summary = { id, projectId, title, createdAt, requirementCount: 0 };
    index.set(id, summary);
    summaries.push(summary);
  }
  for (const group of [...state.drafts, ...state.groups]) {
    const summary = byProject.get(group.projectId)?.get(group.releaseId);
    if (summary) summary.requirementCount++;
  }
  return summaries;
}

/** 原生会话热路径只读取其所属对象，不构建完整工作流投影。 */
export function projectNativeContext(
  state: WorkflowState,
  sessionId: string,
  includeRequirement = false,
):
  | {
      ref: NativeSessionRef;
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
  sessions: Pick<NativeSessionRef, "projectId" | "sessionId">[];
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
    sessions: sessions.map(({ projectId, sessionId }) => ({ projectId, sessionId })),
    workspaces: Object.fromEntries(
      entries.map(({ project, workspace }) => [project.id, workspace]),
    ),
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
