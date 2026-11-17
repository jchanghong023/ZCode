// 修复原因：mention 只读同源业务/会话事实，不能恢复 demo 项目或枚举宿主文件系统。
import type { IProjectService, ProjectTask, VirtualProject } from "@zcode/services";
import type { IAIReqService } from "@zcode/services/aireq";
import { businessRule } from "../aireq/errors.js";
import { currentIdentity } from "../aireq/identity.js";
import { isListedSession, type MockRuntime, type MockSession } from "./runtime.js";

type Workspace = { workspacePath: string; workspaceIdentity: string; projectId: string | null };
type Projection = {
  actor: string;
  projects: VirtualProject[];
  workspaces: Workspace[];
  published: Map<string, Workspace>;
  skillWorkspaces: Workspace[];
};

export class MockProjectService implements IProjectService {
  constructor(
    private readonly runtime: MockRuntime,
    private readonly business: IAIReqService,
  ) {}

  private async projection(hostId?: string): Promise<Projection> {
    const identity = currentIdentity();
    if (!identity || (hostId && hostId !== "local"))
      throw businessRule("连接身份或工作区无效，请重新进入工作区。");
    const bootstrap = await this.business.bootstrap(identity);
    const result: Projection = {
      actor: `${identity.employeeId}:${identity.clientId}`,
      projects: [],
      workspaces: [],
      published: new Map(),
      skillWorkspaces: bootstrap.skillDesignStorage
        ? [
            {
              workspacePath: bootstrap.skillDesignStorage.workspacePath,
              // Skill 原生 scope 复用业务身份接口，不在投影层硬编码后端前缀。
              workspaceIdentity: `${await this.business.call(identity, "skillDesign.workspaceIdentity", ["personal"])}:skill-design`,
              projectId: null,
            },
          ]
        : [],
    };
    for (const [projectId, root] of Object.entries(bootstrap.projects.developmentRoots)) {
      const { view, workspace } = await this.business.call(identity, "readWorkflow", [
        { projectId },
      ]);
      const project = view.projects.find((item) => item.id === projectId);
      if (!project || project.root !== root || workspace.path !== root || !workspace.identity)
        throw businessRule("项目工作区已变化，请刷新页面后重试。");
      const scope: Workspace = {
        workspacePath: root,
        workspaceIdentity: workspace.identity,
        projectId,
      };
      result.workspaces.push(scope);
      result.skillWorkspaces.push({
        ...scope,
        workspaceIdentity: `${await this.business.call(identity, "skillDesign.workspaceIdentity", [projectId])}:skill-design`,
      });
      result.projects.push({
        id: projectId,
        hostId: "local",
        name: project.name,
        nameOverridden: false,
        roots: [{ rootPath: root, position: 0, isPrimary: true }],
        position: result.projects.length,
        pinned: false,
        deleted: false,
        createdAt: Date.parse(project.createdAt),
        updatedAt: Date.parse(project.updatedAt),
      });
      // 共享资格只来自业务 owner 的 canonical ref，不把未知/私有会话读取失败当成共享。
      for (const ref of view.sessions) {
        if (
          ref.projectId === projectId &&
          [...view.groups, ...view.drafts].some(
            (item) => item.projectId === projectId && item.id === ref.irId,
          )
        )
          result.published.set(ref.sessionId, scope);
      }
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

  async readTree(params?: Parameters<IProjectService["readTree"]>[0]) {
    const projection = await this.projection(params?.hostId);
    const tasks: ProjectTask[] = [];
    // 正常业务订阅和发送只创建原生会话；task 镜像缺失不能让合法会话从 mention 消失。
    for (const session of this.runtime.sessions.values()) {
      if (!isListedSession(session)) continue;
      const workspace = this.accessibleWorkspace(session, projection);
      if (!workspace) continue;
      const record = this.runtime.tasks.get(session.sessionId);
      // 镜像仅补组织态，且不能把旧工作区的 pinned/archived 带入当前会话。
      const organization =
        record?.workspacePath === workspace.workspacePath &&
        record.workspaceIdentity === workspace.workspaceIdentity
          ? record
          : undefined;
      tasks.push({
        taskId: session.sessionId,
        traceId: `trace_${session.sessionId}`,
        title: session.meta.title || "新任务",
        workspacePath: workspace.workspacePath,
        workspaceIdentity: workspace.workspaceIdentity,
        createdAt: session.createdAt,
        updatedAt: session.lastActivityAt,
        mode: "build",
        provider: "glm",
        projectId: workspace.projectId,
        hostId: "local",
        pinned: organization?.pinned ?? false,
        archived: organization?.archived ?? false,
      });
    }
    return { projects: projection.projects, tasks };
  }

  async resolveSessionDirectories(
    task: Parameters<IProjectService["resolveSessionDirectories"]>[0],
    hostId?: string,
  ) {
    const projection = await this.projection(hostId);
    const session = this.runtime.sessions.get(task.taskId);
    let workspace = session
      ? this.accessibleWorkspace(session, projection)
      : projection.published.get(task.taskId);
    // 隐藏 Skill 仍由原业务 owner 校验私有身份；不能从会话 ID 或异常推导共享资格。
    if (
      !workspace &&
      task.taskId.startsWith("prototype-skill-design:") &&
      projection.skillWorkspaces.some((item) => item.workspacePath === task.workspacePath)
    ) {
      const identity = currentIdentity()!;
      await this.business.call(identity, "skillDesign.binding", [task.taskId]);
      const stableIdentity = session?.workspaceRef.workspaceIdentity ?? task.workspaceIdentity;
      const skillWorkspace = projection.skillWorkspaces.find(
        (item) =>
          item.workspacePath === task.workspacePath && item.workspaceIdentity === stableIdentity,
      );
      if (
        skillWorkspace &&
        (!session ||
          (session.workspaceRef.workspacePath === task.workspacePath &&
            session.workspaceKey === stableIdentity))
      )
        workspace = skillWorkspace;
    }
    if (
      !workspace ||
      task.workspacePath !== workspace.workspacePath ||
      (task.workspaceIdentity !== undefined &&
        task.workspaceIdentity !== workspace.workspaceIdentity)
    )
      throw businessRule("会话不存在或当前无法访问，请返回需求重新打开。");
    return {
      workspacePath: workspace.workspacePath,
      // cwd/identity 创建后保持稳定；禁止重新按宿主路径哈希覆盖 AIReq 已登记身份。
      workspaceIdentity: task.workspaceIdentity ?? workspace.workspaceIdentity,
      additionalDirectories: [],
      projectId: workspace.projectId,
    };
  }
}
