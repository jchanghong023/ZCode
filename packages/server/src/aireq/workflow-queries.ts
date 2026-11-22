// 无缓存的即时只读投影；可变事实只由 workflow owner 持有并在调用时传入。
import type {
  AIReqNativeSessionRef,
  AIReqRequirementGroup,
  AIReqWorkflowView,
  AIReqWorkspace,
} from "@zcode/services/aireq";
import { PROTOTYPE_BACKEND } from "./backend.js";
import { PROTOTYPE_WORKSPACE_IDENTITY } from "./fixture-builders.js";
import { readPrototypeProjectSettings } from "./project-settings.js";
import { prototypeSessionReadIssue } from "./recovery.js";

/** 只读统计使用同一工作流的提案和转正事实，按 Release 汇总。 */
export function projectDocuments(
  state: Pick<AIReqWorkflowView, "groups" | "drafts">,
  projects: AIReqWorkflowView["projects"],
  releases: AIReqWorkflowView["availableReleases"],
): NonNullable<AIReqWorkflowView["projectDocuments"]> {
  const summaries = new Map(
    projects.map((project) => [
      project.id,
      {
        projectId: project.id,
        releases: [] as NonNullable<AIReqWorkflowView["projectDocuments"]>[number]["releases"],
      },
    ]),
  );
  const totals = new Map(
    releases.map((release) => {
      const summary = {
        releaseId: release.id,
        title: release.title,
        createdAt: release.createdAt,
        proposalCount: 0,
        formalCount: 0,
      };
      summaries.get(release.projectId)?.releases.push(summary);
      return [JSON.stringify([release.projectId, release.id]), summary];
    }),
  );
  for (const group of state.drafts) {
    const summary = totals.get(JSON.stringify([group.projectId, group.releaseId]));
    if (summary) summary.proposalCount++;
  }
  for (const group of state.groups) {
    const summary = totals.get(JSON.stringify([group.projectId, group.releaseId]));
    if (summary) summary.formalCount++;
  }
  return [...summaries.values()];
}

/** 原生会话热路径只读取其所属对象，不构建全工作流、待办或进度聚合。 */
export function projectNativeContext(
  state: AIReqWorkflowView,
  sessionId: string,
  includeRequirement = false,
):
  | {
      ref: AIReqNativeSessionRef;
      published: boolean;
      draft?: AIReqRequirementGroup;
      formal?: AIReqRequirementGroup;
    }
  | undefined {
  if (prototypeSessionReadIssue(sessionId)) return undefined;
  const ref = state.sessions.find((item) => item.sessionId === sessionId);
  if (!ref || !readPrototypeProjectSettings().projects.some((item) => item.id === ref.projectId))
    return undefined;
  const matches = (item: AIReqRequirementGroup) =>
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
export function projectDirectory(state: AIReqWorkflowView): {
  projects: AIReqWorkflowView["projects"];
  sessions: AIReqNativeSessionRef[];
  workspaces: Record<string, AIReqWorkspace>;
  skillDesignWorkspacePath: string;
} {
  const projects = readPrototypeProjectSettings().projects;
  const projectIds = new Set(projects.map((project) => project.id));
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
    projects,
    sessions: structuredClone(sessions),
    workspaces: Object.fromEntries(
      projects.map((project) => [
        project.id,
        {
          path: project.root,
          identity: `${PROTOTYPE_WORKSPACE_IDENTITY}:${project.id}`,
          kind: "proposal" as const,
        },
      ]),
    ),
    skillDesignWorkspacePath: PROTOTYPE_BACKEND.configDirectory,
  };
}

/** 目录与原生会话共用工作区身份；展示路径不成为另一份会话 owner。 */
export function readProjectWorkspace(projectId?: string): AIReqWorkspace {
  const project = readPrototypeProjectSettings().projects.find((item) => item.id === projectId);
  return {
    path: project?.root,
    identity: `${PROTOTYPE_WORKSPACE_IDENTITY}:${project?.id ?? "personal"}`,
    kind: project ? "proposal" : "unavailable",
  };
}
