import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { AIReqRemoteRepositoryInput } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import {
  createSharedDirectories,
  isProjectPathSegment,
  prepareProjectDocuments,
  resolveProjectDirectory,
} from "./project-files.js";
import { prototypeRecoveryScenario } from "./recovery.js";
import type { Project } from "./workflow-state.js";

interface PrototypeProjectSettings {
  projects: Project[];
}

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

export function savePrototypeRepository(
  input: AIReqRemoteRepositoryInput,
  publishDocuments: (projectId: string, documents: string) => void,
): boolean {
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
  if (!givenDirectory.startsWith("/") || workDirectory === "/" || /\p{Cc}/u.test(givenDirectory))
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
  const storageDirectory = resolveProjectDirectory(workDirectory);
  if (storageDirectory === "/") throw businessRule("请输入可用于项目的独立工作目录。");
  if (
    settings.projects.some((item) => {
      if (item.id === id || !item.storageDirectory) return false;
      const other = item.storageDirectory;
      return (
        other === storageDirectory ||
        storageDirectory.startsWith(other + "/") ||
        other.startsWith(storageDirectory + "/")
      );
    })
  )
    throw businessRule("该工作目录已由其他项目使用，请选择独立目录。");
  try {
    createSharedDirectories(storageDirectory);
    if (realpathSync(workDirectory) !== storageDirectory)
      throw businessRule("工作目录已变化，请核对路径后重试。");
    const alreadyOwned = existing?.storageDirectory === storageDirectory;
    // 原型保存只准备共享文档。仓库访问不应成为提交配置的网络等待。
    const documents = prepareProjectDocuments(storageDirectory, alreadyOwned);
    if (!alreadyOwned) publishDocuments(id, documents);
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
