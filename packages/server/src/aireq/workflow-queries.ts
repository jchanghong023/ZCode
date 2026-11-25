// 无缓存的即时只读投影；可变事实只由 workflow owner 持有并在调用时传入。
import type {
  AIReqNativeSessionRef,
  AIReqProject,
  AIReqReleaseSummary,
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
    clientDraftId: _clientDraftId,
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

export function projectReleaseSummaries({
  projects,
  requirements,
}: Pick<WorkflowState, "projects" | "requirements">): AIReqReleaseSummary[] {
  const active = new Set(projects.map(({ id }) => id));
  const releases = new Map<string, AIReqReleaseSummary>();
  for (const { projectId, releaseId, releaseName, documentVersion } of requirements) {
    if (!active.has(projectId) || !releaseId) continue;
    const key = JSON.stringify([projectId, releaseId]);
    let release = releases.get(key);
    if (!release) {
      release = {
        id: releaseId,
        projectId,
        title: releaseName || releaseId,
        createdAt: "",
        requirementCount: 0,
        confirmedRequirementCount: 0,
      };
      releases.set(key, release);
    } else if (release.title === releaseId && releaseName) {
      release.title = releaseName;
    }
    release.requirementCount++;
    if (documentVersion?.confirmation) release.confirmedRequirementCount++;
  }
  return [...releases.values()].sort(
    (a, b) =>
      b.title.localeCompare(a.title, undefined, { numeric: true }) || a.id.localeCompare(b.id),
  );
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
export function readProjectWorkspaces(): Record<string, AIReqWorkspace> {
  return Object.fromEntries(
    mapPrototypeProjectSettings((project) => [project.id, projectWorkspace(project)] as const),
  );
}

export function readProjectWorkspace(projectId?: string): AIReqWorkspace {
  return projectWorkspace(readPrototypeProjectSetting(projectId));
}
