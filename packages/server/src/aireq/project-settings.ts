import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createServiceLogger } from "@zcode/services/logger";
import type { AIReqRemoteRepositoryInput } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import {
  isProjectPathSegment,
  prepareProjectDocuments,
  prepareSeedProjectDocuments,
  publishInitialProjectDocuments,
  resolveProjectDirectory,
  type ProjectDocumentSnapshot,
} from "./project-files.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import type { Project } from "./workflow-state.js";

interface PrototypeProjectSettings {
  projects: Project[];
}

const logger = createServiceLogger("aireq-project-settings");

function project(id: string, name: string, root: string): Project {
  return {
    id,
    name,
    root,
    revision: 1,
    defaultBranch: "main",
    repositoryUrl: `ssh://git@git.example.internal/team/${root.split("/").at(-1)}.git`,
  };
}

const projects = [
  project("demo-aurora", "Aurora 协作控制台", "/demo/aurora-console"),
  project("demo-mobile", "Mobile 移动工作台", "/demo/mobile-console"),
  project("demo-atlas", "Atlas 客户需求门户", "/demo/atlas-portal"),
];
// 项目配置的内存所有者。共享文档保存在配置的工作目录。
let settings: PrototypeProjectSettings = {
  projects: prototypeRecoveryScenario === "empty-projects" ? [] : projects,
};

export function readPrototypeProjectSettings(): PrototypeProjectSettings {
  return structuredClone(settings);
}

export function readPrototypeProjectSetting(projectId?: string): Readonly<Project> | undefined {
  return settings.projects.find((project) => project.id === projectId);
}

export function mapPrototypeProjectSettings<T>(map: (project: Readonly<Project>) => T): T[] {
  return settings.projects.map(map);
}

export async function initializePrototypeProjectSettings(
  workspacePath: string,
  captureDocuments: (projectId: string) => ProjectDocumentSnapshot,
): Promise<void> {
  settings = {
    projects: await Promise.all(
      settings.projects.map(async (project) => {
        const workDirectory = resolve(
          workspacePath,
          ".zcode-runtime",
          "aireq-projects",
          project.id,
        );
        const configured = { ...project, workDirectory, storageDirectory: undefined };
        try {
          const storageDirectory = await resolveProjectDirectory(workDirectory);
          await prepareSeedProjectDocuments(
            project.id,
            workDirectory,
            storageDirectory,
            captureDocuments(project.id).requirements,
          );
          return { ...configured, storageDirectory };
        } catch (error) {
          logger.warn(undefined, "Failed to prepare demo project directory", {
            projectId: project.id,
            code: error instanceof Error && "code" in error ? error.code : undefined,
          });
          // 目录发布失败时仍保留示例配置，复制入口只依赖配置路径。
          return configured;
        }
      }),
    ),
  };
}

// 保存串行校验 revision 与目录归属。异步文件操作期间，读取仍使用上一次已提交配置。
let projectSaves = Promise.resolve();

function containsDirectory(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(".." + sep);
}

export function savePrototypeRepository(
  input: AIReqRemoteRepositoryInput,
  captureDocuments: (projectId: string) => ProjectDocumentSnapshot,
): Promise<boolean> {
  const save = projectSaves.then(() => prepareAndSaveRepository(input, captureDocuments));
  projectSaves = save.then(
    () => {},
    () => {},
  );
  return save;
}

async function prepareAndSaveRepository(
  input: AIReqRemoteRepositoryInput,
  captureDocuments: (projectId: string) => ProjectDocumentSnapshot,
): Promise<boolean> {
  const existing = input.projectId
    ? settings.projects.find((item) => item.id === input.projectId)
    : undefined;
  if (input.projectId && !existing) throw businessRule("请选择已有项目。");
  if (input.expectedRevision !== (existing?.revision ?? 0))
    throw businessRule("项目配置已变化，请重新读取。");
  const name = input.name.trim();
  const repositoryUrl = input.repositoryUrl.trim();
  const defaultBranch = input.defaultBranch.trim();
  const givenDirectory = input.workDirectory.trim();
  const workDirectory = resolve(givenDirectory);
  if (!isProjectPathSegment(name)) throw businessRule("请输入可用作目录名的项目名称。");
  if (
    !isAbsolute(givenDirectory) ||
    dirname(workDirectory) === workDirectory ||
    /\p{Cc}/u.test(givenDirectory)
  )
    throw businessRule("请输入项目工作目录的绝对路径。");
  let validRepository = /^[^\s/@:]+@[^\s/:]+:[^\s]+$/.test(repositoryUrl);
  if (!validRepository && /^(?:https?|ssh|git):\/\/[^\s]+$/.test(repositoryUrl)) {
    try {
      const url = new URL(repositoryUrl);
      validRepository = Boolean(url.hostname) && !url.password;
    } catch {
      /* Malformed remote URL. */
    }
  }
  if (!validRepository)
    throw businessRule("请输入 Git 远程仓库地址（HTTP(S)、SSH 或 git@host:path）。");
  if (
    !defaultBranch ||
    /[\s~^:?*[\\]/.test(defaultBranch) ||
    defaultBranch.includes("..") ||
    defaultBranch.includes("@{") ||
    defaultBranch.startsWith("-") ||
    defaultBranch.startsWith("/") ||
    defaultBranch.endsWith("/") ||
    defaultBranch.endsWith(".") ||
    defaultBranch.endsWith(".lock") ||
    defaultBranch.includes("//") ||
    defaultBranch === "@" ||
    defaultBranch.split("/").some((part) => part.startsWith("."))
  )
    throw businessRule("请输入有效的默认分支名称。");
  if (
    existing &&
    existing.name === name &&
    existing.repositoryUrl === repositoryUrl &&
    existing.defaultBranch === defaultBranch &&
    existing.workDirectory === workDirectory
  )
    return false;
  const id = existing?.id ?? `demo-project-${crypto.randomUUID()}`;
  const storageDirectory = await resolveProjectDirectory(workDirectory);
  if (dirname(storageDirectory) === storageDirectory)
    throw businessRule("请输入可用于项目的独立工作目录。");
  if (
    settings.projects.some((item) => {
      if (item.id === id || !item.storageDirectory) return false;
      const other = item.storageDirectory;
      return (
        containsDirectory(other, storageDirectory) || containsDirectory(storageDirectory, other)
      );
    })
  )
    throw businessRule("该工作目录已由其他项目使用，请选择独立目录。");
  try {
    const alreadyOwned =
      existing?.storageDirectory !== undefined &&
      relative(existing.storageDirectory, storageDirectory) === "";
    const documents = await prepareProjectDocuments(workDirectory, storageDirectory, alreadyOwned);
    if (!alreadyOwned) {
      const snapshot = captureDocuments(id);
      const discard = await publishInitialProjectDocuments(documents, snapshot.requirements);
      // 发布时原目录仍可能接收文档更新。核对成功后才能把新目录设为当前配置。
      if (!snapshot.isCurrent()) {
        await discard();
        throw businessRule("项目文档已更新，请重新保存项目配置。");
      }
    }
  } catch (error) {
    if (error instanceof Error && "publicMessage" in error) throw error;
    throw businessRule("无法准备项目工作目录，请检查服务端路径和写入权限。");
  }
  const updated = {
    ...(existing ?? project(id, name, `/demo/platform-managed/${id}`)),
    name,
    repositoryUrl,
    defaultBranch,
    workDirectory,
    storageDirectory,
    revision: existing ? existing.revision + 1 : 1,
  };
  settings = {
    projects: existing
      ? settings.projects.map((item) => (item.id === id ? updated : item))
      : [...settings.projects, updated],
  };
  return true;
}

/** A valid business project always has an explicit platform-managed mock path. */
export function readPrototypeDevelopmentRoot(
  projectId: string,
  _employeeId?: string,
): string | undefined {
  return settings.projects.find((project) => project.id === projectId)?.root;
}
