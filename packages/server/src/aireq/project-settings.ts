import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AIReqRemoteRepositoryInput } from "@zcode/services/aireq";
import { businessRule } from "./errors.js";
import {
  prepareProjectDocuments,
  publishInitialProjectDocuments,
  queueSharedDocument,
  resolveProjectDirectory,
  type ProjectDocumentSnapshot,
} from "./project-files.js";
import type { CloudDragonProject } from "./clouddragon.js";
import type { Project } from "./workflow-state.js";
import { onProductionOpen, production } from "./production-store.js";

type RepositorySettings = Pick<
  Project,
  "revision" | "repositoryUrl" | "defaultBranch" | "workDirectory" | "storageDirectory"
>;

// 云龙目录与本地代码配置各自持有自己的字段，通过稳定的项目组 ID 关联。
let projectNames = new Map<string, string>();
let repositories = new Map<string, RepositorySettings>();
onProductionOpen((store) => {
  repositories = new Map(store.get<[string, RepositorySettings][]>("repositories"));
});

export function syncPrototypeProjectNames(projects: readonly CloudDragonProject[]): void {
  projectNames = new Map(projects.map(({ id, name }) => [id, name]));
}

export function readPrototypeProjectSettings(): { projects: Project[] } {
  return { projects: mapPrototypeProjectSettings((project) => project) };
}

export function configuredStorageDirectory(projectId: string): string | undefined {
  return repositories.get(projectId)?.storageDirectory;
}

export function readPrototypeProjectSetting(projectId?: string): Project | undefined {
  if (projectId === undefined) return;
  const name = projectNames.get(projectId);
  if (!name) return;
  return projectSettingsForSource({ id: projectId, name });
}

export function projectSettingsForSource({ id: projectId, name }: CloudDragonProject): Project {
  return {
    id: projectId,
    name,
    root: `/aireq/projects/${projectId}`,
    revision: 0,
    defaultBranch: "main",
    ...repositories.get(projectId),
  };
}

export function mapPrototypeProjectSettings<T>(map: (project: Readonly<Project>) => T): T[] {
  return Array.from(projectNames.keys(), (id) => map(readPrototypeProjectSetting(id)!));
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
  commitReceipt?: () => void,
): Promise<boolean> {
  const save = projectSaves.then(() =>
    prepareAndSaveRepository(input, captureDocuments, commitReceipt),
  );
  projectSaves = save.then(
    () => {},
    () => {},
  );
  return save;
}

async function prepareAndSaveRepository(
  input: AIReqRemoteRepositoryInput,
  captureDocuments: (projectId: string) => ProjectDocumentSnapshot,
  commitReceipt?: () => void,
): Promise<boolean> {
  const id = input.projectId;
  // 项目身份由云龙目录提供，仓库配置不能凭请求创建或重命名项目。
  const existing = readPrototypeProjectSetting(id);
  if (!existing) throw businessRule("请选择云龙中已有的项目。");
  if (input.expectedRevision !== existing.revision)
    throw businessRule("项目配置已变化，请重新读取。");
  const repositoryUrl = input.repositoryUrl.trim();
  const defaultBranch = input.defaultBranch.trim();
  const givenDirectory = input.workDirectory.trim();
  const workDirectory = resolve(givenDirectory);
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
    existing.repositoryUrl === repositoryUrl &&
    existing.defaultBranch === defaultBranch &&
    existing.workDirectory === workDirectory
  ) {
    commitReceipt?.();
    return false;
  }
  const storageDirectory = await resolveProjectDirectory(workDirectory);
  if (dirname(storageDirectory) === storageDirectory)
    throw businessRule("请输入可用于项目的独立工作目录。");
  if (
    Array.from(repositories.entries()).some(([projectId, item]) => {
      if (projectId === id || !item.storageDirectory) return false;
      const other = item.storageDirectory;
      return (
        containsDirectory(other, storageDirectory) || containsDirectory(storageDirectory, other)
      );
    })
  )
    throw businessRule("该工作目录已由其他项目使用，请选择独立目录。");
  const alreadyOwned =
    existing.storageDirectory !== undefined &&
    relative(existing.storageDirectory, storageDirectory) === "";
  try {
    const documents = await prepareProjectDocuments(workDirectory, storageDirectory, alreadyOwned);
    if (!alreadyOwned && !production) {
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
  const entry = {
    repositoryUrl,
    defaultBranch,
    workDirectory,
    storageDirectory,
    revision: existing.revision + 1,
  };
  if (production) {
    const store = production;
    store.db.transaction(() => {
      store.set("repositories", [...new Map(repositories).set(id, entry)]);
      if (!alreadyOwned) {
        // 先发布到磁盘再提交配置会在崩溃后留下无主目录，重试也会因目录非空被拒绝。
        for (const { irId } of captureDocuments(id).requirements)
          queueSharedDocument(store, id, irId);
      }
      commitReceipt?.();
    })();
  }
  repositories.set(id, entry);
  return true;
}

/** A valid business project always has an explicit platform-managed mock path. */
export function readPrototypeDevelopmentRoot(
  projectId: string,
  _employeeId?: string,
): string | undefined {
  return readPrototypeProjectSetting(projectId)?.root;
}
