// 修复原因：mention 只读同源业务/会话事实，不能恢复 demo 项目或枚举宿主文件系统。
import { z } from "zod";
import type { WebProjectService, WebProjectTree } from "@zcode/services";
import {
  assertSkillSession,
  prototypeSkillDesignWorkspaceIdentity,
  readPrototypeProjectDirectory,
} from "./aireq/contract.js";
import { businessRule } from "./aireq/errors.js";
import { currentIdentity } from "./aireq/identity.js";
import { isListedSession, type MockRuntime, type MockSession } from "./mock/runtime.js";

const sessionDirectoryRequestSchema = z.strictObject({
  taskId: z.string(),
  workspacePath: z.string(),
  workspaceIdentity: z.string().optional(),
});

type Workspace = { workspacePath: string; workspaceIdentity: string; projectId: string | null };
type Projection = {
  actor: string;
  projects: WebProjectTree["projects"];
  workspaces: Workspace[];
  published: Map<string, Workspace>;
  skillWorkspaces: Workspace[];
};

export class ProjectDirectoryService implements WebProjectService {
  constructor(private readonly runtime: MockRuntime) {}

  private projection(): Projection {
    const identity = currentIdentity();
    if (!identity) throw businessRule("连接身份或工作区无效，请重新进入工作区。");
    // 目录只需项目和 canonical 引用；逐项目走公开 readWorkflow 会嵌套重算全局进度与待办。
    // owner 一次复制目录事实，权限仍由下方 actor、私有 Skill 和精确 workspace 校验承担。
    const directory = readPrototypeProjectDirectory();
    const result: Projection = {
      actor: `${identity.employeeId}:${identity.clientId}`,
      projects: [],
      workspaces: [],
      published: new Map(),
      skillWorkspaces: [
        {
          workspacePath: directory.skillDesignWorkspacePath,
          workspaceIdentity: prototypeSkillDesignWorkspaceIdentity("personal"),
          projectId: null,
        },
      ],
    };
    const scopes = new Map<string, Workspace>();
    for (const project of directory.projects) {
      const projectId = project.id;
      const workspace = directory.workspaces[projectId];
      if (!workspace?.path || !workspace.identity)
        throw businessRule("项目工作区已变化，请刷新页面后重试。");
      const scope: Workspace = {
        workspacePath: workspace.path,
        workspaceIdentity: workspace.identity,
        projectId,
      };
      scopes.set(projectId, scope);
      result.workspaces.push(scope);
      result.skillWorkspaces.push({
        ...scope,
        workspaceIdentity: prototypeSkillDesignWorkspaceIdentity(projectId),
      });
      result.projects.push({
        id: projectId,
        name: project.name,
      });
    }
    // canonical 资格由 owner 以当前项目、IR 和故障过滤一次裁决，不接纳私有/未知引用。
    for (const ref of directory.sessions) {
      const scope = scopes.get(ref.projectId);
      if (scope) result.published.set(ref.sessionId, scope);
    }
    return result;
  }

  private accessibleWorkspace(session: MockSession, projection: Projection): Workspace | undefined {
    const published = projection.published.get(session.sessionId);
    if (!published && session.draftCreatorActor !== projection.actor) return undefined;
    const workspace =
      published ??
      [...projection.workspaces, ...projection.skillWorkspaces].find(
        (item) =>
          item.workspacePath === session.workspaceRef.workspacePath &&
          item.workspaceIdentity === session.workspaceRef.workspaceIdentity,
      );
    if (
      !workspace ||
      workspace.workspacePath !== session.workspaceRef.workspacePath ||
      workspace.workspaceIdentity !== session.workspaceRef.workspaceIdentity ||
      workspace.workspaceIdentity !== session.workspaceKey
    )
      return undefined;
    return workspace;
  }

  async readTree() {
    const projection = this.projection();
    const tasks: WebProjectTree["tasks"] = [];
    // 正常业务订阅和发送只创建原生会话；task 镜像缺失不能让合法会话从 mention 消失。
    for (const session of this.runtime.sessions.values()) {
      if (!isListedSession(session)) continue;
      const workspace = this.accessibleWorkspace(session, projection);
      if (!workspace) continue;
      tasks.push({
        taskId: session.sessionId,
        title: session.meta.title || "新任务",
        workspacePath: workspace.workspacePath,
        workspaceIdentity: workspace.workspaceIdentity,
        createdAt: session.createdAt,
        updatedAt: session.lastActivityAt,
        projectId: workspace.projectId,
      });
    }
    return { projects: projection.projects, tasks };
  }

  async resolveSessionDirectories(
    request: Parameters<WebProjectService["resolveSessionDirectories"]>[0],
  ) {
    const task = sessionDirectoryRequestSchema.parse(request);
    const projection = this.projection();
    const session = this.runtime.sessions.get(task.taskId);
    let workspace: Workspace | undefined;
    if (task.taskId.startsWith("prototype-skill-design:")) {
      // Skill 归属和项目由 owner 校验；目录查询不打开或创建会话。
      const stableIdentity = session?.workspaceRef.workspaceIdentity ?? task.workspaceIdentity;
      const skillWorkspace = projection.skillWorkspaces.find(
        (item) =>
          item.workspacePath === task.workspacePath && item.workspaceIdentity === stableIdentity,
      );
      if (
        skillWorkspace &&
        assertSkillSession(task.taskId) === (skillWorkspace.projectId ?? "personal") &&
        (!session ||
          (session.workspaceRef.workspacePath === task.workspacePath &&
            session.workspaceKey === stableIdentity))
      )
        workspace = skillWorkspace;
    } else {
      workspace = session
        ? this.accessibleWorkspace(session, projection)
        : projection.published.get(task.taskId);
    }
    if (
      !workspace ||
      task.workspacePath !== workspace.workspacePath ||
      (task.workspaceIdentity !== undefined &&
        task.workspaceIdentity !== workspace.workspaceIdentity)
    )
      throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
    return { projectId: workspace.projectId };
  }
}
