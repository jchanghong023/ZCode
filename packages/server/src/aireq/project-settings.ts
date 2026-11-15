import { prototypeRecoveryScenario } from "./recovery.js";
import type { AIReqProject } from "@zcode/services/aireq";

interface PrototypeProjectSettings {
  projects: AIReqProject[];
}
const createdAt = "2026-11-10T09:00:00.000Z";

function project(id: string, name: string, root: string): AIReqProject {
  return {
    id,
    name,
    storageName: root.split("/").filter(Boolean).at(-1)!,
    root,
    commonDir: `${root}/.git`,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    defaultBranch: "main",
    remote: "origin",
    repositoryId: `sample-repository-${id}`,
    repositoryUrl: `ssh://git@git.example.internal/team/${root.split("/").at(-1)}.git`,
  };
}

const projects = [
  project("demo-aurora", "Aurora 协作控制台", "/demo/aurora-console"),
  project("demo-mobile", "Mobile 移动工作台", "/demo/mobile-console"),
];
// 共享数据库项目表的内存投影；不访问真实 SQLite 或项目目录。
let settings: PrototypeProjectSettings = {
  projects: prototypeRecoveryScenario === "empty-projects" ? [] : projects,
};

export function readPrototypeProjectSettings(): PrototypeProjectSettings {
  return structuredClone(settings);
}

/** 设置页仅保存内存配置，不探测仓库、不拉取或推送，也不改既有样例工作区。 */
export function savePrototypeRepository(
  input: import("@zcode/services/aireq").AIReqRemoteRepositoryInput,
): boolean {
  const existing = input.projectId
    ? settings.projects.find((item) => item.id === input.projectId)
    : undefined;
  if (input.projectId && !existing) throw new Error("请选择已有项目。");
  if (input.expectedRevision !== (existing?.revision ?? 0))
    throw Object.assign(new Error("项目配置已变化，请重新读取。"), { code: "VERSION_CONFLICT" });
  const name = input.name.trim();
  const repositoryUrl = input.repositoryUrl.trim();
  const defaultBranch = input.defaultBranch.trim();
  if (!name) throw new Error("请输入项目名称。");
  let validRepository = /^[^\s/@:]+@[^\s/:]+:[^\s]+$/.test(repositoryUrl);
  if (!validRepository && /^(?:https?|ssh|git):\/\/[^\s]+$/.test(repositoryUrl)) {
    try {
      validRepository = Boolean(new URL(repositoryUrl).hostname);
    } catch {
      /* Malformed remote URL. */
    }
  }
  if (!validRepository)
    throw new Error("请输入 Git 远程仓库地址（HTTP(S)、SSH 或 git@host:path）。");
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
    throw new Error("请输入有效的默认分支名称。");
  if (
    existing &&
    existing.name === name &&
    existing.repositoryUrl === repositoryUrl &&
    existing.defaultBranch === defaultBranch
  )
    return false;
  const id = existing?.id ?? `demo-project-${crypto.randomUUID()}`;
  const updated = {
    ...(existing ?? project(id, name, `/demo/platform-managed/${id}`)),
    name,
    repositoryUrl,
    defaultBranch,
    revision: existing ? existing.revision + 1 : 1,
    updatedAt: new Date().toISOString(),
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
