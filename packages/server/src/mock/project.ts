// 当前后端项目服务：草稿、只读服务器目录浏览与共享内存项目表；local 不是浏览器电脑。
// 文件/Git 仍使用虚拟 fixture，不扩展真实文件写入。
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import * as nodePath from "node:path";

import type { IProjectService, ProjectTask, VirtualProject } from "@zcode/services";
import { createUuid, type FileEntry } from "@zcode/shared";

import { isListedSession, workspaceIdentityOf, type MockRuntime } from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 复杂 result 的空实现统一经 unknown 收敛；字段缺失由 UI 空集合兜底。 */
function asResult<T>(value: unknown): T {
  return value as T;
}

export class MockProjectService implements IProjectService {
  private readonly projects = new Map<string, VirtualProject>();

  constructor(private readonly runtime: MockRuntime) {
    const demo = this.demoProject();
    this.projects.set(demo.id, demo);
  }

  private demoProject(): VirtualProject {
    return {
      id: "project_demo",
      hostId: "local",
      name: "ZCode Web Demo",
      nameOverridden: false,
      roots: [{ rootPath: this.runtime.workspacePath, position: 0, isPrimary: true }],
      position: 0,
      pinned: false,
      deleted: false,
      createdAt: this.runtime.startedAt,
      updatedAt: this.runtime.startedAt,
    };
  }

  private projectForWorkspace(workspacePath: string): VirtualProject | undefined {
    return [...this.projects.values()].find(
      (project) =>
        !project.deleted && project.roots.some((root) => root.rootPath === workspacePath),
    );
  }

  async readDirectory(
    params?: P<IProjectService["readDirectory"]>,
  ): Promise<AR<IProjectService["readDirectory"]>> {
    const hostId = params?.hostId;
    if (hostId && hostId !== "local") {
      throw new Error("mock: 远程目录浏览未启用");
    }
    const requested = params?.path?.trim();
    const home = homedir();
    const expanded =
      !requested || requested === "~"
        ? home
        : requested === "~/" || requested === "~\\"
          ? home
          : requested.startsWith("~/") || requested.startsWith("~\\")
            ? nodePath.join(home, requested.slice(2))
            : requested;
    const resolved = nodePath.resolve(expanded);
    // 本地项目选择需要真实路径：只读取目录名/类型，不读写文件内容。
    const dirents = await readdir(resolved, { withFileTypes: true });
    const includeHidden = params?.includeHidden === true;
    const entries: FileEntry[] = [];
    for (const dirent of dirents) {
      if (!includeHidden && dirent.name.startsWith(".")) continue;
      const entryPath = nodePath.join(resolved, dirent.name);
      let type: FileEntry["type"] = dirent.isDirectory() ? "directory" : "file";
      const isSymbolicLink = dirent.isSymbolicLink();
      if (isSymbolicLink) {
        try {
          type = (await stat(entryPath)).isDirectory() ? "directory" : "file";
        } catch {
          // 断链保留为文件条目，让 UI 跳过而不是整页失败。
        }
      }
      entries.push({
        name: dirent.name,
        path: entryPath,
        type,
        ...(isSymbolicLink ? { isSymbolicLink: true } : {}),
      });
    }
    entries.sort((left, right) =>
      left.type === right.type
        ? left.name.localeCompare(right.name)
        : left.type === "directory"
          ? -1
          : 1,
    );
    return asResult({ path: resolved, entries });
  }

  async readProjects(
    params?: P<IProjectService["readProjects"]>,
  ): Promise<AR<IProjectService["readProjects"]>> {
    return [...this.projects.values()].filter(
      (project) => params?.includeDeleted || !project.deleted,
    );
  }

  async readTree(
    params?: P<IProjectService["readTree"]>,
  ): Promise<AR<IProjectService["readTree"]>> {
    // 树投影：项目 + 任务；任务行镜像会话运行时的 task 记录。
    const projects = [...this.projects.values()].filter(
      (project) => params?.includeDeleted || !project.deleted,
    );
    const tasks: ProjectTask[] = [...this.runtime.tasks.values()]
      .filter((record) => {
        const session = this.runtime.sessions.get(record.sessionId);
        return !session || isListedSession(session);
      })
      .map((record) => ({
        taskId: record.sessionId,
        traceId: `trace_${record.sessionId}`,
        title: record.title || "新任务",
        workspacePath: record.workspacePath,
        workspaceIdentity: record.workspaceIdentity,
        createdAt: record.createdAt,
        updatedAt: record.lastActivityAt,
        mode: "build" as const,
        provider: "glm" as const,
        projectId: this.projectForWorkspace(record.workspacePath)?.id ?? null,
        hostId: "local",
        pinned: record.pinned,
        archived: record.archived,
      }));
    return { projects, tasks };
  }

  async saveProject(
    input: P<IProjectService["saveProject"]>,
  ): Promise<AR<IProjectService["saveProject"]>> {
    const existing = input.id ? this.projects.get(input.id) : undefined;
    const now = Date.now();
    const requestedRoots = (input.roots ?? (input.primaryRoot ? [input.primaryRoot] : []))
      .map((root) => root.trim())
      .filter(Boolean);
    const primaryRoot =
      input.primaryRoot?.trim() || requestedRoots[0] || this.runtime.workspacePath;
    const orderedRoots = [primaryRoot, ...requestedRoots.filter((root) => root !== primaryRoot)];
    if (input.reuseExistingRoot) {
      const reuse = this.projectForWorkspace(primaryRoot);
      if (reuse) return reuse;
    }
    const project: VirtualProject = {
      id: existing?.id ?? input.id ?? `project_${createUuid()}`,
      hostId: "local",
      name:
        input.name?.trim() ||
        input.defaultName?.trim() ||
        nodePath.basename(primaryRoot) ||
        "未命名项目",
      nameOverridden: Boolean(input.name?.trim()),
      roots: orderedRoots.map((rootPath, position) => ({
        rootPath,
        position,
        isPrimary: rootPath === primaryRoot,
      })),
      position: existing?.position ?? this.projects.size,
      pinned: input.pinned ?? existing?.pinned ?? false,
      deleted: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    this.runtime.onProjectsChanged.fire();
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    const project = this.projects.get(id);
    if (project) {
      this.projects.set(id, { ...project, deleted: true, updatedAt: Date.now() });
      this.runtime.onProjectsChanged.fire();
    }
  }

  async restoreProject(id: string): Promise<AR<IProjectService["restoreProject"]>> {
    const project = this.projects.get(id);
    if (!project) return this.demoProject();
    const restored = { ...project, deleted: false, updatedAt: Date.now() };
    this.projects.set(id, restored);
    this.runtime.onProjectsChanged.fire();
    return restored;
  }

  async moveTask(_input: P<IProjectService["moveTask"]>): Promise<void> {}

  async reorderProjects(_ids: string[]): Promise<void> {}

  async prepareSession(
    params?: P<IProjectService["prepareSession"]>,
  ): Promise<AR<IProjectService["prepareSession"]>> {
    const project = params?.projectId ? this.projects.get(params.projectId) : undefined;
    const primaryRoot = project?.deleted
      ? undefined
      : project?.roots.find((root) => root.isPrimary)?.rootPath;
    return asResult({
      workspacePath: primaryRoot ?? this.runtime.workspacePath,
      workspaceIdentity: workspaceIdentityOf(primaryRoot ?? this.runtime.workspacePath),
      additionalDirectories:
        project && primaryRoot
          ? project.roots
              .filter((root) => root.rootPath !== primaryRoot)
              .map((root) => root.rootPath)
          : [],
      projectId: project && primaryRoot ? project.id : null,
    });
  }

  async measureProjectData(_ids: string[]): Promise<AR<IProjectService["measureProjectData"]>> {
    return asResult({ projects: [] });
  }

  async deleteProjectData(_id: string): Promise<AR<IProjectService["deleteProjectData"]>> {
    return asResult({ deletedBytes: 0 });
  }

  async resolveSessionDirectories(
    task: P<IProjectService["resolveSessionDirectories"]>,
  ): Promise<AR<IProjectService["resolveSessionDirectories"]>> {
    const project = this.projectForWorkspace(task.workspacePath);
    return asResult({
      workspacePath: task.workspacePath,
      workspaceIdentity: workspaceIdentityOf(task.workspacePath),
      additionalDirectories: project
        ? project.roots
            .filter((root) => root.rootPath !== task.workspacePath)
            .map((root) => root.rootPath)
        : [],
      projectId: project?.id ?? null,
    });
  }
}
