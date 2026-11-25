// 无缓存的即时只读投影；可变事实只由 workflow owner 持有并在调用时传入。
import type {
  AIReqNativeSessionRef,
  AIReqProject,
  AIReqReleaseSummary,
  AIReqRequirementCounts,
  AIReqRequirementGroup,
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
  RequirementGroup,
  WorkflowState,
} from "./workflow-state.js";

export function projectSummary(project: Project): AIReqProject {
  const { id, name, revision, defaultBranch, repositoryUrl, workDirectory } = project;
  return {
    id,
    name,
    revision,
    defaultBranch,
    ...(repositoryUrl === undefined ? {} : { repositoryUrl }),
    ...(workDirectory === undefined ? {} : { workDirectory }),
  };
}

export function projectSystemRequirement(
  requirement: AIReqSystemRequirement,
): AIReqSystemRequirement {
  const { id, projectId, irId, title, documentPath } = requirement;
  return { id, projectId, irId, title, documentPath };
}

export function projectSessionRef(ref: NativeSessionRef): AIReqNativeSessionRef {
  const { projectId, irId, sessionId, phase, modelConfig } = ref;
  const result: AIReqNativeSessionRef = { projectId, irId, sessionId, phase };
  if (modelConfig !== undefined) result.modelConfig = modelConfig;
  return result;
}

export function projectRequirement(
  group: RequirementGroup,
  canAccessSolution: boolean,
): AIReqRequirementGroup {
  const {
    sourceDescription: _sourceDescription,
    releaseName: _releaseName,
    documentVersion,
    documentReviews,
    sessions,
    ...facts
  } = group;
  return {
    ...facts,
    sessions: sessions
      .filter((ref) => ref.phase !== "solution" || canAccessSolution)
      .map(projectSessionRef),
    documentVersion: documentVersion && {
      number: documentVersion.number,
      confirmation: documentVersion.confirmation,
    },
    documentReviews: documentReviews
      .filter((review) => review.agent !== "solution" || canAccessSolution)
      .map(({ materialDigest: _materialDigest, ...review }) => review),
  };
}

function emptyRequirementCounts(): AIReqRequirementCounts {
  return { requirementCount: 0, completedRequirementCount: 0, confirmedRequirementCount: 0 };
}

function countRequirement(counts: AIReqRequirementCounts, requirement: RequirementGroup) {
  counts.requirementCount++;
  if (requirement.process === "完成") counts.completedRequirementCount++;
  if (requirement.documentVersion?.confirmation) counts.confirmedRequirementCount++;
}

export function projectRequirementSummaries({
  projects,
  requirements,
}: Pick<WorkflowState, "projects" | "requirements">) {
  const projectCounts = new Map(projects.map(({ id }) => [id, emptyRequirementCounts()]));
  const releases = new Map<string, AIReqReleaseSummary>();
  for (const requirement of requirements) {
    const { projectId, releaseId, releaseName } = requirement;
    const counts = projectCounts.get(projectId);
    if (!counts) continue;
    countRequirement(counts, requirement);
    if (!releaseId) continue;
    const key = JSON.stringify([projectId, releaseId]);
    let release = releases.get(key);
    if (!release) {
      release = {
        id: releaseId,
        projectId,
        title: releaseName ?? "",
        createdAt: "",
        ...emptyRequirementCounts(),
      };
      releases.set(key, release);
    } else if (!release.title && releaseName) {
      release.title = releaseName;
    }
    countRequirement(release, requirement);
  }
  // 同一 PI 的任一条 IR 都可能提供名称；分组完仍无名称才显示占位，不把内部 ID 当作名称。
  const summaries = [...releases.values()];
  for (const release of summaries) release.title ||= "未提供名称";
  return {
    projectRequirementCounts: Object.fromEntries(projectCounts),
    releases: summaries.sort(
      (a, b) =>
        b.title.localeCompare(a.title, undefined, { numeric: true }) || a.id.localeCompare(b.id),
    ),
  };
}

/** 原生会话热路径只读取其所属对象，不构建完整工作流投影。 */
export function projectNativeContext(state: WorkflowState, sessionId: string) {
  const requirement = state.requirements.find((item) =>
    item.sessions.some((ref) => ref.sessionId === sessionId),
  );
  const ref = requirement?.sessions.find((item) => item.sessionId === sessionId);
  if (!ref || !requirement || !readPrototypeProjectSetting(ref.projectId)) return;
  return { ref, requirement };
}

/** 项目树只读 canonical 元数据；不为目录请求派生所有项目的业务报表。 */
export function projectDirectory(
  state: WorkflowState,
  canAccessSolution: (projectId: string) => boolean,
): {
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
  const sessions = state.requirements
    .flatMap((item) => item.sessions)
    .filter(
      (ref) =>
        projectIds.has(ref.projectId) &&
        (ref.phase !== "solution" || canAccessSolution(ref.projectId)) &&
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
export function readProjectWorkspaces(
  projects?: readonly Project[],
): Record<string, AIReqWorkspace> {
  return Object.fromEntries(
    projects
      ? projects.map((project) => [project.id, projectWorkspace(project)] as const)
      : mapPrototypeProjectSettings((project) => [project.id, projectWorkspace(project)] as const),
  );
}

export function readProjectWorkspace(
  projectId?: string,
  projects?: readonly Project[],
): AIReqWorkspace {
  return projectWorkspace(
    projects ? projects.find(({ id }) => id === projectId) : readPrototypeProjectSetting(projectId),
  );
}
