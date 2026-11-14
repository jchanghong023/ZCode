// 模拟工作区服务：文件系统 / Git / 文件监听 / 系统信息 / 终端 / 媒体预览。
// 全部基于 MockRuntime 的虚拟状态，不触碰真实文件系统与进程。
import { Emitter, type Event } from "@zcode/rpc";
import { createUuid } from "@zcode/shared";
import type {
  IGitCheckpointService,
  IGitService,
  IFileService,
  IFileWatcherService,
  IMediaPreviewService,
  ISystemService,
  ITerminalService,
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
  IntranetProbeRequest,
  IntranetProbeResult,
  SystemInfo,
  IntegratedTerminalShellOption,
  FileEntry,
  FileStat,
  FileTextSlice,
  WorkspaceFileEntry,
} from "@zcode/shared";
import type { MockRuntime, VirtualFileNode } from "./runtime.js";

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

export class MockFileService implements IFileService {
  constructor(private readonly runtime: MockRuntime) {}

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
    walk(this.runtime.virtualRoot, []);
    return results.slice(0, params.limit ?? 50);
  }

  async readdir(params: { path: string; includeHidden?: boolean }): Promise<FileEntry[]> {
    const base = params.path || this.runtime.workspacePath;
    const node = resolveNode(this.runtime.virtualRoot, base) ?? this.runtime.virtualRoot;
    if (node.kind !== "directory" || !node.children) return [];
    const entries: FileEntry[] = [];
    for (const child of node.children.values()) {
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
    const node = resolveNode(this.runtime.virtualRoot, params.path);
    if (!node) {
      throw new Error(`mock: ENOENT ${params.path}`);
    }
    return {
      path: params.path,
      type: node.kind,
      ...(node.kind === "file" ? { size: node.content?.length ?? 0 } : {}),
      mtimeMs: node.mtimeMs,
    };
  }

  async checkFilesExist(params: { paths: string[] }) {
    return params.paths.map((path) => ({
      path,
      exists: resolveNode(this.runtime.virtualRoot, path) !== null,
    }));
  }

  async resolvePath(params: { path: string }): Promise<string> {
    return params.path || this.runtime.workspacePath;
  }

  async ensureConversationWorkspace() {
    return {
      path: this.runtime.workspacePath,
      created: false,
      workspacePurpose: "conversation" as const,
    };
  }

  async createDefaultWorkspace() {
    return { path: this.runtime.workspacePath };
  }

  async createScratchWorkspace(params: { name: string }) {
    return { path: joinPath(this.runtime.workspacePath, [".zcode", "scratch", params.name]) };
  }

  async readTextFile(params: {
    path: string;
    offset?: number;
    length?: number;
  }): Promise<FileTextSlice> {
    const node = resolveNode(this.runtime.virtualRoot, params.path);
    const content = node?.kind === "file" ? (node.content ?? "") : "";
    const bytes = Buffer.byteLength(content, "utf8");
    const offset = params.offset ?? 0;
    const length = params.length ?? bytes;
    const sliced = Buffer.from(content, "utf8")
      .subarray(offset, offset + length)
      .toString("utf8");
    return {
      path: params.path,
      content: sliced,
      offset,
      bytesRead: Buffer.byteLength(sliced, "utf8"),
      totalBytes: bytes,
      truncated: offset + Buffer.byteLength(sliced, "utf8") < bytes,
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
    const node = resolveNode(this.runtime.virtualRoot, params.path);
    const content = node?.kind === "file" ? (node.content ?? "") : "";
    return Buffer.from(content, "utf8").subarray(params.offset, params.offset + params.length);
  }

  async readBinaryPreview(_params: { path: string; maxBytes?: number }): Promise<never> {
    throw new Error("mock: 二进制预览未启用");
  }

  async listWorkspaceFilesLength(_params: { rootPath: string }): Promise<number> {
    return 0;
  }

  async listWorkspaceFilesRange(_params: {
    rootPath: string;
    offset: number;
    length: number;
  }): Promise<string> {
    return "";
  }

  async readWorkspaceFileSearchIgnore(_params: { rootPath: string }) {
    return { content: "# 模拟工作区：无忽略规则\n", source: "template" as const };
  }

  async applyWorkspaceFileSearchIgnoreTransform(_params: {
    rootPath: string;
    transform: "sync-gitignore" | "reset-defaults";
  }) {
    return { content: "# 模拟工作区：无忽略规则\n" };
  }

  async writeWorkspaceFileSearchIgnore(_params: {
    rootPath: string;
    content: string;
  }): Promise<void> {}

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
    return {
      path: params.path,
      availability: "patch" as const,
      patch: `--- a/${params.path}\n+++ b/${params.path}\n@@ -1,3 +1,4 @@\n 模拟差异上下文\n+新增行\n`,
      beforeContent: null,
      afterContent: null,
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
    return {
      userName: "ZCode Mock",
      userEmail: "mock@zcode.local",
      nameSource: "mock",
      emailSource: "mock",
      scopeLabel: null,
    };
  }

  async refresh(params: GitRefreshRequest): Promise<GitRefreshResult> {
    return {
      summary: this.summary(params),
      identity: params.includeIdentity
        ? {
            userName: "ZCode Mock",
            userEmail: "mock@zcode.local",
            nameSource: "mock",
            emailSource: "mock",
          }
        : null,
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

export class MockGitCheckpointService implements IGitCheckpointService {
  constructor(private readonly runtime: MockRuntime) {}

  async createCheckpoint(_params: unknown) {
    void this.runtime;
    return { checkpointId: `ckpt_${Date.now()}` } as never;
  }

  async diffCheckpoints(_params: unknown) {
    return { hunks: [] } as never;
  }

  async restoreBetweenCheckpoints(_params: unknown) {
    return { restored: [] } as never;
  }

  async deleteCheckpoint(_params: unknown): Promise<void> {}
}

export class MockSystemService implements ISystemService {
  constructor(private readonly runtime: MockRuntime) {}

  async info(): Promise<SystemInfo> {
    return { homedir: this.runtime.workspacePath, platform: process.platform };
  }

  async listIntegratedTerminalShells(): Promise<IntegratedTerminalShellOption[]> {
    if (process.platform === "win32") {
      return [
        { id: "cmd", dialect: "cmd", label: "Command Prompt", path: "cmd.exe", source: "system" },
        {
          id: "git-bash",
          dialect: "git-bash",
          label: "Git Bash",
          path: "bash.exe",
          source: "system",
        },
      ];
    }
    return [
      { id: "git-bash", dialect: "git-bash", label: "bash", path: "/bin/bash", source: "system" },
    ];
  }

  async probeIntranet(_request: IntranetProbeRequest): Promise<IntranetProbeResult> {
    return {
      isIntranet: false,
      reachedTargetCount: 0,
      requiredSuccessCount: 1,
      totalTargets: 1,
      checkedAt: Date.now(),
      strategy: "tcp-connect",
      results: [],
    };
  }
}

export class MockTerminalService implements ITerminalService {
  private readonly dataEmitter = new Emitter<string>();
  private readonly exitEmitter = new Emitter<number>();
  private readonly terminals = new Set<string>();

  async create(_params: { cols: number; rows: number; cwd?: string }) {
    const id = `term_${createUuid()}`;
    this.terminals.add(id);
    return {
      id,
      shell: "mock-shell",
      fontFamily: "monospace",
      fontFamilySource: "system" as const,
    };
  }

  async write(params: { id: string; data: string }): Promise<void> {
    // 回显输入，模拟终端行为（不执行任何真实命令）。
    void params.id;
    this.dataEmitter.fire(`mock-shell> ${params.data}`);
  }

  async resize(_params: { id: string; cols: number; rows: number }): Promise<void> {}

  async dispose(params: { id: string }): Promise<void> {
    this.terminals.delete(params.id);
    this.exitEmitter.fire(0);
  }

  async listTerminalIdsUnderPath(_params: { path: string }): Promise<string[]> {
    return [...this.terminals];
  }

  onDynamicData(_id: string): Event<string> {
    return this.dataEmitter.event;
  }

  onDynamicExit(_id: string): Event<number> {
    return this.exitEmitter.event;
  }
}

export class MockMediaPreviewService implements IMediaPreviewService {
  async prepare(_params: { path: string; expectedKind: string }): Promise<never> {
    throw new Error("mock: 媒体预览未启用（虚拟工作区无媒体文件）");
  }
}
