import {
  proposalVersion,
  type AIReqGitFileCommit,
  type AIReqMaterialHistory,
  type AIReqMaterialView,
} from "@zcode/services/aireq";
import { contentVersion, digestValue } from "./content-digest.js";
import { businessRule } from "./errors.js";
import { prototypeGitDocumentRevision } from "./fixture-content.js";
import { readPrototypeMaterial } from "./recovery.js";
import { prototypeRepositoryKey, readPrototypeProjectSetting } from "./project-settings.js";
import type {
  Project,
  PrototypeRepositoryTarget,
  RequirementGroup,
  WorkflowState,
} from "./workflow-state.js";

export function capturePrototypeMaterialHistory(
  state: WorkflowState,
  proposal: RequirementGroup,
  materials: AIReqMaterialView[],
  reason: string,
): AIReqMaterialHistory {
  return {
    version: proposalVersion(proposal),
    reason,
    changedAt: new Date().toISOString(),
    documentPath: proposal.documentPath,
    proposalRound: proposal.proposalRound ?? 1,
    srs: state.srs
      .filter((row) => row.projectId === proposal.projectId && row.irId === proposal.id)
      .map(({ id, title, documentPath }) => ({ id, title, documentPath })),
    materials: materials.map((item) => ({ ...readPrototypeMaterial(item) })),
    requirementsCheck: structuredClone(proposal.requirementsCheck),
    solutionCheck: structuredClone(proposal.solutionCheck),
  };
}

/** Stable business IDs own their material directories; titles and operators never rename them. */
export function prototypeChangeRoot(srId: string): string {
  return `openspec/changes/${srId}`;
}
export function prototypeIrRoot(irId: string): string {
  return `docs/requirements/${irId}`;
}
export function prototypeSpecPath(_irId: string, srId: string): string {
  return `${prototypeChangeRoot(srId)}/specs/${srId}/spec.md`;
}

// 每个 IR 记录同一 OMP 项目 dir；只返回内存材料路径，不写业务文件。
export function prototypeProposalLocation(projectId: string, employeeId: string) {
  const project = readPrototypeProjectSetting(projectId);
  if (!project) throw new Error("提案所属项目不存在。");
  return { employeeId, directory: project.root };
}

export interface GitDocumentSnapshot {
  commit: string;
  files: { path: string; content: string; change: AIReqGitFileCommit }[];
}

/** 读取器在固定提交中枚举完整受管目录，返回该提交内的文件正文及各自的 Git 提交记录。 */
export type GitDocumentReader = (
  project: Pick<Project, "id"> & PrototypeRepositoryTarget,
  roots: readonly string[],
) => Promise<GitDocumentSnapshot>;

/** 内存仓库保存独立的文件树，平台同步只读该树。 */
export function createPrototypeGitDocumentSource(initial: WorkflowState) {
  type GitFile = GitDocumentSnapshot["files"][number];
  type Repository = { commit: string; files: Map<string, GitFile> };
  const repositories = new Map<string, Repository>();

  function recordMerge(
    view: WorkflowState,
    group: RequirementGroup,
    target: PrototypeRepositoryTarget,
  ): void {
    const merge = group.merge!;
    const key = prototypeRepositoryKey(target);
    const files = repositories.get(key)?.files ?? new Map<string, GitFile>();
    const archived = new Map(merge.files.map((file) => [file.path, file.sha256]));
    const change: AIReqGitFileCommit = {
      hash: merge.commit,
      message: "合入正式文档：" + group.title,
      employee: group.submittedBy,
      committedAt: merge.checkedAt,
    };
    for (const file of view.materials) {
      if (
        file.projectId === group.projectId &&
        file.irId === group.id &&
        archived.get(file.path) === file.sha256 &&
        file.content !== undefined
      )
        files.set(file.path, { path: file.path, content: file.content, change });
    }
    repositories.set(key, { commit: merge.commit, files });
  }

  for (const group of initial.groups) {
    const project = initial.projects.find((item) => item.id === group.projectId);
    if (!project?.repositoryUrl || !group.merge) continue;
    recordMerge(initial, group, {
      repositoryId: project.repositoryId,
      repositoryUrl: project.repositoryUrl,
      defaultBranch: group.merge.branch,
    });
  }
  for (const project of initial.projects) {
    const key = prototypeRepositoryKey(project);
    const repository = repositories.get(key);
    const head = initial.repositoryHeads[key];
    if (repository && head) repository.commit = head;
  }

  const seed = prototypeGitDocumentRevision;
  const project = initial.projects.find((item) => item.id === seed.projectId);
  const repository = project && repositories.get(prototypeRepositoryKey(project));
  if (project && repository) {
    const commit = digestValue([repository.commit, seed]);
    const change: AIReqGitFileCommit = {
      hash: commit,
      message: seed.message,
      employee: seed.employee,
      committedAt: seed.committedAt,
    };
    for (const { path, text } of seed.appended) {
      const file = repository.files.get(path);
      if (file) repository.files.set(path, { path, content: file.content + text, change });
    }
    repository.files.delete(seed.removed);
    const moved = repository.files.get(seed.moved.from);
    if (moved) {
      repository.files.delete(seed.moved.from);
      repository.files.set(seed.moved.to, { path: seed.moved.to, content: moved.content, change });
    }
    repository.commit = commit;
    initial.repositoryHeads[prototypeRepositoryKey(project)] = commit;
  }

  const read: GitDocumentReader = async (project, roots) => {
    const repository = repositories.get(prototypeRepositoryKey(project));
    if (!repository) throw businessRule("配置的 Git 仓库分支暂无已登记的文档快照。");
    const files = [...repository.files.values()].filter((file) =>
      roots.some((root) => file.path.startsWith(root + "/")),
    );
    return structuredClone({ commit: repository.commit, files });
  };
  return { read, recordMerge };
}

export function applyGitDocumentSnapshot(
  state: WorkflowState,
  group: RequirementGroup,
  snapshot: GitDocumentSnapshot,
  employeeId: string,
  at: string,
): boolean {
  const expected = new Set(group.files.map((file) => file.path));
  const actual = new Map(snapshot.files.map((file) => [file.path, file]));
  const missing = [...expected].filter((path) => !actual.has(path));
  const extra = [...actual.keys()].filter((path) => !expected.has(path));
  if (missing.length || extra.length || actual.size !== snapshot.files.length) {
    const details = [
      missing.length ? "缺少：" + missing.join("、") : "",
      extra.length ? "新增或改名：" + extra.join("、") : "",
      actual.size !== snapshot.files.length ? "存在重复路径。" : "",
    ].filter(Boolean);
    throw businessRule(
      "Git 文档目录与上版不一致。预期 " +
        expected.size +
        " 份，实际 " +
        snapshot.files.length +
        " 份。" +
        details.join("；"),
    );
  }
  const materials = state.materials.filter(
    (file) =>
      file.projectId === group.projectId && file.irId === group.id && expected.has(file.path),
  );
  if (
    materials.length !== expected.size ||
    group.files.some(
      (entry) =>
        !materials.some((file) => file.path === entry.path && file.sha256 === entry.sha256),
    )
  )
    throw businessRule("平台当前正式文档清单不完整，请重新读取。");

  const changes = materials.flatMap((material) => {
    const file = actual.get(material.path)!;
    const version = contentVersion(file.content);
    return version.sha256 === material.sha256 ? [] : [{ material, file, version }];
  });
  if (!changes.length) return false;
  const history = (group.materialHistory ??= []);
  if (
    group.files.some(
      (entry) =>
        !history.some((record) =>
          record.materials.some((file) => file.path === entry.path && file.sha256 === entry.sha256),
        ),
    )
  ) {
    history.push({
      ...capturePrototypeMaterialHistory(state, group, materials, "正式文档上版"),
      changedAt: group.merge?.checkedAt ?? at,
    });
  }
  for (const { material, file, version } of changes)
    Object.assign(material, version, { content: file.content });
  group.files = materials.map(({ path, sha256, size }) => ({ path, sha256, size }));
  group.revision += 1;
  history.push({
    ...capturePrototypeMaterialHistory(state, group, materials, "Git 同步并确认"),
    version: digestValue([snapshot.commit, group.files]),
    changedAt: at,
    event: {
      type: "git-sync",
      commit: snapshot.commit,
      employeeId,
      files: changes.map(({ file }) => ({ path: file.path, change: file.change })),
    },
  });
  return true;
}
