// 模拟工作区服务：文件系统 / Git / 文件监听 / 系统信息 / 媒体预览。
// 除系统信息返回本机 home 目录外，全部基于 MockRuntime 的虚拟状态，不触碰真实文件系统与进程。
import { homedir } from "node:os";
import * as nodePath from "node:path";

import { Emitter, type Event } from "@zcode/rpc";
import { createUuid } from "@zcode/shared";
import { packWorkspaceFileEntries } from "@zcode/shared/workspaceFileEntriesCodec";
import type {
  IGitService,
  IFileService,
  IFileWatcherService,
  IMediaPreviewService,
  ISystemService,
} from "@zcode/services";
import type {
  GitBranchComparison,
  GitBranchMutationResult,
  GitChangesRequest,
  GitCommitGraphRequest,
  GitCommitGraphResult,
  GitCommitRequest,
  GitCommitResult,
  GitDiffQuery,
  GitDiffResult,
  GitDiscardPathsRequest,
  GitFileChange,
  GitGenerateCommitMessageRequest,
  GitGenerateCommitMessageResult,
  GitIdentity,
  GitIgnoredPathsRequest,
  GitLocalBranchListResult,
  GitPathMutationRequest,
  GitPushRequest,
  GitPushResult,
  GitRefreshRequest,
  GitRefreshResult,
  GitRepositoryRequest,
  GitRepositorySummary,
  GitSwitchBranchRequest,
  GitWorkspaceRepositoryInfo,
  GitCreateBranchRequest,
  SystemInfo,
  FileEntry,
  FileStat,
  FileTextSlice,
  WorkspaceFileEntry,
} from "@zcode/shared";
import type { MockRuntime, VirtualFileNode } from "./runtime.js";
import { readPrototypeSkillNode } from "../aireq/contract.js";

// ── 虚拟文件系统工具 ──

function joinPath(root: string, segments: string[]): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const normalized = segments.filter((segment) => segment.length > 0).join(sep);
  if (!normalized) return root;
  return root.endsWith(sep) ? root + normalized : root + sep + normalized;
}

function splitRelativePath(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== ".");
}

function resolveNode(root: VirtualFileNode, path: string): VirtualFileNode | null {
  let node: VirtualFileNode = root;
  for (const segment of splitRelativePath(path)) {
    if (node.kind !== "directory" || !node.children) return null;
    const next = node.children.get(segment);
    if (!next) return null;
    node = next;
  }
  return node;
}

/**
 * 把跨过 RPC 的路径映射成虚拟工作区相对路径。
 * 修复原因：readdir 返回的是「工作区绝对路径 + 文件名」，UI 随后把该绝对路径原样交给
 * readTextFile/stat/readFileRange。旧实现直接按段解析，盘符与目录名被当成虚拟节点名，
 * 解析必然失败，预览因此恒为空（isBinary=false、totalBytes=0），而不是内容缺失。
 * 依据：真实服务以工作区根为基准接受绝对路径；虚拟 FS 的根就代表 runtime.workspacePath。
 */
function toWorkspaceRelativePath(workspacePath: string, path: string): string {
  if (!path || !nodePath.isAbsolute(path)) return path;
  const root = nodePath.resolve(workspacePath);
  const resolved = nodePath.resolve(path);
  // Windows 盘符与目录大小写不敏感；POSIX 保持原样比较。
  const normalize =
    process.platform === "win32"
      ? (value: string) => value.toLowerCase()
      : (value: string) => value;
  const rootComparable = normalize(root).replace(/[\\/]+$/, "");
  const resolvedComparable = normalize(resolved);
  if (resolvedComparable === rootComparable) return "";
  const prefix = `${rootComparable}${nodePath.sep}`;
  if (!resolvedComparable.startsWith(prefix)) return path;
  return resolved.slice(root.replace(/[\\/]+$/, "").length + 1);
}

export class MockFileService implements IFileService {
  constructor(private readonly runtime: MockRuntime) {}

  /** 统一入口：绝对路径先收敛为工作区相对路径，相对路径按原样解析。 */
  private resolveVirtual(path: string): VirtualFileNode | null {
    const relativePath = toWorkspaceRelativePath(this.runtime.workspacePath, path);
    const absolutePath = nodePath.isAbsolute(path)
      ? path
      : joinPath(this.runtime.workspacePath, splitRelativePath(path));
    // 保存与读取共用 Skill 文件 owner；目录叠加保留原虚拟树，不复制已接纳正文。
    return (
      readPrototypeSkillNode(absolutePath, resolveNode(this.runtime.virtualRoot, relativePath)) ??
      null
    );
  }

  private requireNode(path: string, kind?: VirtualFileNode["kind"]): VirtualFileNode {
    const node = this.resolveVirtual(path);
    // 缺失和类型错误不能伪装成空内容；空文件只由真实 file 节点表达。
    if (!node) throw new Error("文件或目录不存在。");
    if (kind && node.kind !== kind) {
      throw new Error(kind === "file" ? "该路径是目录，不能作为文件读取。" : "该路径不是目录。");
    }
    return node;
  }

  private workspaceEntries(rootPath: string): WorkspaceFileEntry[] {
    const root = rootPath || this.runtime.workspacePath;
    const entries: WorkspaceFileEntry[] = [];
    const walk = (node: VirtualFileNode, segments: string[]) => {
      for (const child of node.children?.values() ?? []) {
        const relativeSegments = [...segments, child.name];
        entries.push({
          name: child.name,
          path: joinPath(root, relativeSegments),
          relativePath: relativeSegments.join("/"),
          type: child.kind,
        });
        if (child.kind === "directory") walk(child, relativeSegments);
      }
    };
    walk(this.requireNode(root, "directory"), []);
    return entries;
  }

  async searchWorkspaceFiles(params: {
    rootPath: string;
    workspaceIdentity?: string;
    query: string;
    limit?: number;
    refresh?: boolean;
  }): Promise<WorkspaceFileEntry[]> {
    const query = params.query.trim().toLowerCase();
    const results: WorkspaceFileEntry[] = [];
    const root = params.rootPath || this.runtime.workspacePath;
    const walk = (node: VirtualFileNode, relativeSegments: string[]) => {
      if (node.kind === "directory" && node.children) {
        for (const child of node.children.values()) {
          walk(child, [...relativeSegments, child.name]);
        }
        return;
      }
      if (!query) return;
      const relativePath = relativeSegments.join("/");
      if (node.name.toLowerCase().includes(query) || relativePath.toLowerCase().includes(query)) {
        results.push({
          name: node.name,
          path: joinPath(root, relativeSegments),
          relativePath,
          type: "file",
        });
      }
    };
    walk(this.requireNode(root, "directory"), []);
    return results.slice(0, params.limit ?? 50);
  }

  async readdir(params: { path: string; includeHidden?: boolean }): Promise<FileEntry[]> {
    const base = params.path || this.runtime.workspacePath;
    const node = this.requireNode(base, "directory");
    const entries: FileEntry[] = [];
    for (const child of node.children?.values() ?? []) {
      if (!params.includeHidden && child.name.startsWith(".")) continue;
      entries.push({
        name: child.name,
        path: joinPath(base, [child.name]),
        type: child.kind,
      });
    }
    return entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async stat(params: { path: string }): Promise<FileStat> {
    const node = this.requireNode(params.path);
    return {
      path: params.path,
      type: node.kind,
      ...(node.kind === "file" ? { size: Buffer.byteLength(node.content ?? "", "utf8") } : {}),
      mtimeMs: node.mtimeMs,
    };
  }

  async checkFilesExist(params: { paths: string[] }) {
    return params.paths.map((path) => ({
      path,
      exists: this.resolveVirtual(path) !== null,
    }));
  }

  async readTextFile(params: {
    path: string;
    offset?: number;
    length?: number;
  }): Promise<FileTextSlice> {
    const node = this.requireNode(params.path, "file");
    const buffer = Buffer.from(node.content ?? "", "utf8");
    const bytes = buffer.length;
    const offset = params.offset ?? 0;
    const length = params.length ?? bytes;
    const slice = buffer.subarray(offset, offset + length);
    const sliced = slice.toString("utf8");
    return {
      path: params.path,
      content: sliced,
      offset,
      bytesRead: slice.length,
      totalBytes: bytes,
      truncated: offset + slice.length < bytes,
      isBinary: false,
    };
  }

  async readMediaPreview(_params: { path: string; maxBytes?: number }): Promise<never> {
    throw new Error("mock: 媒体预览未启用");
  }

  async readFileRange(params: {
    path: string;
    offset: number;
    length: number;
  }): Promise<Uint8Array> {
    const node = this.requireNode(params.path, "file");
    return Buffer.from(node.content ?? "", "utf8").subarray(
      params.offset,
      params.offset + params.length,
    );
  }

  async readBinaryPreview(_params: { path: string; maxBytes?: number }): Promise<never> {
    throw new Error("mock: 二进制预览未启用");
  }

  async listWorkspaceFilesLength(params: { rootPath: string }): Promise<number> {
    return packWorkspaceFileEntries(this.workspaceEntries(params.rootPath)).length;
  }

  async listWorkspaceFilesRange(params: {
    rootPath: string;
    offset: number;
    length: number;
  }): Promise<string> {
    return packWorkspaceFileEntries(this.workspaceEntries(params.rootPath)).slice(
      params.offset,
      params.offset + params.length,
    );
  }
}

export class MockFileWatcherService implements IFileWatcherService {
  private readonly changeEmitter = new Emitter<{ dirPath: string; changedPath?: string }>();
  private readonly watchers = new Set<string>();

  constructor(private readonly runtime: MockRuntime) {}

  async watch(params: { path: string; recursive?: boolean }) {
    const id = `watch_${createUuid()}`;
    this.watchers.add(id);
    void params;
    void this.runtime;
    return { id };
  }

  async unwatch(params: { id: string }): Promise<void> {
    this.watchers.delete(params.id);
  }

  disposeAll(): void {
    this.watchers.clear();
  }

  onDynamicChange(_id: string): Event<{ dirPath: string; changedPath?: string }> {
    return this.changeEmitter.event;
  }
}

export class MockGitService implements IGitService {
  constructor(private readonly runtime: MockRuntime) {}

  private summary(params: GitRepositoryRequest): GitRepositorySummary {
    const git = this.runtime.git;
    return {
      workspacePath: params.workspacePath,
      repoRoot: params.workspacePath,
      workspaceInRepoPath: "",
      autoRefreshWatchPaths: [{ path: params.workspacePath, recursive: true }],
      branchName: git.branch,
      trackingBranchName: "origin/main",
      headRefType: "branch",
      ahead: 0,
      behind: 0,
      isDirty: git.statusEntries.length > 0,
      isGitAvailable: true,
      isRepository: true,
    };
  }

  private fileChanges(): GitFileChange[] {
    return this.runtime.git.statusEntries.map((entry) => ({
      path: joinPath(this.runtime.workspacePath, [entry.path]),
      repoRelativePath: entry.path,
      workspaceRelativePath: entry.path,
      kind: (entry.staged === "added" || (entry.unstaged === null && entry.staged !== null)
        ? "added"
        : entry.unstaged === "deleted"
          ? "deleted"
          : "modified") as GitFileChange["kind"],
      section: (entry.staged ? "staged" : "unstaged") as GitFileChange["section"],
      added: entry.staged === "added" ? 12 : 3,
      removed: entry.unstaged === "deleted" ? 8 : 1,
      isStaged: entry.staged !== null,
      isUntracked: false,
      isConflicted: false,
    }));
  }

  async getRepositorySummary(params: GitRepositoryRequest) {
    return this.summary(params);
  }

  async getWorkspaceRepositoryInfo(
    params: GitRepositoryRequest,
  ): Promise<GitWorkspaceRepositoryInfo> {
    return { workspacePath: params.workspacePath, kind: "main-tree", isGitAvailable: true };
  }

  async getLocalBranches(_params: GitRepositoryRequest): Promise<GitLocalBranchListResult> {
    return {
      headRefType: "branch",
      currentBranchName: this.runtime.git.branch,
      branches: this.runtime.git.branches.map((branch) => ({
        name: branch.name,
        isCurrent: branch.current,
        upstreamName: branch.upstream ?? null,
        commitHash: this.runtime.git.log[0]?.sha ?? null,
        commitTimestampMs: Date.now() - 86_400_000,
      })),
    };
  }

  async getCommitGraph(params: GitCommitGraphRequest): Promise<GitCommitGraphResult> {
    const commits = this.runtime.git.log.slice(0, params.maxCount ?? 50).map((entry, index) => ({
      hash: entry.sha,
      parents:
        index + 1 < this.runtime.git.log.length ? [this.runtime.git.log[index + 1]!.sha] : [],
      refs: index === 0 ? [{ name: this.runtime.git.branch, kind: "head" as const }] : [],
      subject: entry.message,
      authorName: entry.author,
      authoredAtMs: Date.parse(entry.date),
    }));
    return { commits, hasMore: false };
  }

  async switchBranch(params: GitSwitchBranchRequest): Promise<GitBranchMutationResult> {
    this.runtime.git.branch = params.targetBranchName;
    return {
      ok: true,
      action: "switch" as const,
      branchName: params.targetBranchName,
      didChange: true,
      created: false,
      summary: this.summary(params),
      issues: [],
    };
  }

  async createBranchAndSwitch(params: GitCreateBranchRequest): Promise<GitBranchMutationResult> {
    this.runtime.git.branches.push({ name: params.branchName, current: true });
    this.runtime.git.branch = params.branchName;
    return {
      ok: true,
      action: "create-and-switch" as const,
      branchName: params.branchName,
      didChange: true,
      created: true,
      summary: this.summary(params),
      issues: [],
    };
  }

  async getChanges(_params: GitChangesRequest): Promise<GitFileChange[]> {
    return this.fileChanges();
  }

  async getIgnoredPaths(_params: GitIgnoredPathsRequest): Promise<string[]> {
    return [];
  }

  async getDiff(params: GitDiffQuery): Promise<GitDiffResult> {
    const path = toWorkspaceRelativePath(this.runtime.workspacePath, params.path).replace(
      /\\/g,
      "/",
    );
    const sourceId = params.sourceId ?? (params.staged ? "staged" : "unstaged");
    const contents = this.runtime.git.diffs.find(
      (entry) => entry.path === path && entry.sourceId === sourceId,
    );
    if (!contents || (contents.beforeContent === null && contents.afterContent === null)) {
      return {
        path: params.path,
        availability: "unavailable",
        patch: null,
        beforeContent: null,
        afterContent: null,
        summary: "没有可读取的差异内容。",
      };
    }
    const { beforeContent, afterContent } = contents;
    // 全文件 hunk 只表达真实前后内容；末行换行事实不能在生成 patch 时补造。
    const lines = (text: string | null) => {
      if (!text) return [];
      const result = text.split("\n");
      if (text.endsWith("\n")) result.pop();
      return result;
    };
    const before = lines(beforeContent);
    const after = lines(afterContent);
    const body = (text: string | null, values: string[], prefix: string) =>
      values.map((line) => `${prefix}${line}\n`).join("") +
      (text && !text.endsWith("\n") ? "\\ No newline at end of file\n" : "");
    const patch =
      beforeContent === afterContent
        ? ""
        : `--- ${beforeContent === null ? "/dev/null" : `a/${path}`}\n` +
          `+++ ${afterContent === null ? "/dev/null" : `b/${path}`}\n` +
          `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@\n` +
          body(beforeContent, before, "-") +
          body(afterContent, after, "+");
    return {
      path: params.path,
      availability: "patch",
      patch,
      beforeContent,
      afterContent,
      summary: null,
    };
  }

  async getBranchComparison(_params: GitRepositoryRequest): Promise<GitBranchComparison> {
    return {
      baseRef: "origin/main",
      headRef: this.runtime.git.branch,
      comparisonLabel: null,
      changes: [],
    };
  }

  async stagePaths(params: GitPathMutationRequest): Promise<void> {
    for (const path of params.paths) {
      const relative = path.startsWith(this.runtime.workspacePath)
        ? path.slice(this.runtime.workspacePath.length + 1)
        : path;
      const entry = this.runtime.git.statusEntries.find((candidate) => candidate.path === relative);
      if (entry && !entry.staged) entry.staged = "modified";
    }
  }

  async unstagePaths(params: GitPathMutationRequest): Promise<void> {
    for (const path of params.paths) {
      const relative = path.startsWith(this.runtime.workspacePath)
        ? path.slice(this.runtime.workspacePath.length + 1)
        : path;
      const entry = this.runtime.git.statusEntries.find((candidate) => candidate.path === relative);
      if (entry) entry.staged = null;
    }
  }

  async discardPaths(_params: GitDiscardPathsRequest): Promise<void> {}

  async generateCommitMessage(
    _params: GitGenerateCommitMessageRequest,
  ): Promise<GitGenerateCommitMessageResult> {
    return {
      message: "feat: 模拟提交信息",
      providerId: "account:bigmodel-start-plan",
      model: "GLM-5.3-Flash",
    };
  }

  async commit(params: GitCommitRequest): Promise<GitCommitResult> {
    const sha = `${createUuid().replace(/-/g, "").slice(0, 40)}`;
    this.runtime.git.log.unshift({
      sha,
      message: params.message,
      author: "ZCode Mock",
      date: new Date().toISOString(),
    });
    this.runtime.git.statusEntries = [];
    return { commitHash: sha, summary: this.summary(params) };
  }

  async push(params: GitPushRequest): Promise<GitPushResult> {
    return {
      branchName: this.runtime.git.branch,
      trackingBranchName: `origin/${this.runtime.git.branch}`,
      remoteName: "origin",
      setUpstream: false,
      summary: this.summary(params),
    };
  }

  async getIdentity(_params: GitRepositoryRequest): Promise<GitIdentity> {
    return this.runtime.git.identity
      ? { ...this.runtime.git.identity }
      : { userName: null, userEmail: null, nameSource: null, emailSource: null, scopeLabel: null };
  }

  async refresh(params: GitRefreshRequest): Promise<GitRefreshResult> {
    return {
      summary: this.summary(params),
      identity: params.includeIdentity ? await this.getIdentity(params) : null,
      unstagedChanges: this.fileChanges().filter((change) => change.section === "unstaged"),
      stagedChanges: this.fileChanges().filter((change) => change.section === "staged"),
      branchComparison: params.includeBranchComparison
        ? {
            baseRef: "origin/main",
            headRef: this.runtime.git.branch,
            comparisonLabel: null,
            changes: [],
          }
        : null,
    };
  }
}

export class MockSystemService implements ISystemService {
  async info(): Promise<SystemInfo> {
    // 本地项目选目录需要真实 home；其余工作区状态仍是 MockRuntime 的内存投影。
    return { homedir: homedir(), platform: process.platform };
  }
}

export class MockMediaPreviewService implements IMediaPreviewService {
  async prepare(_params: { path: string; expectedKind: string }): Promise<never> {
    throw new Error("mock: 媒体预览未启用（虚拟工作区无媒体文件）");
  }
}
