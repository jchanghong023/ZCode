// 模拟后端运行时：所有 mock 服务的内存状态中心。
// 只保留内存态，不落盘、不发起真实网络请求；唯一例外是本地目录浏览
// （projectService.readDirectory 读取本机真实目录名），文件内容不读写。
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { Emitter } from "@zcode/rpc";
import { createUuid } from "@zcode/shared";
import type {
  ConversationSnapshot,
  PlanState,
  PendingInteraction,
  QueueItem,
  SessionMetaState,
  SessionPhase,
  SessionUsageState,
  SessionSummary,
  WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";

export type WorkspaceRef = { workspacePath: string; workspaceIdentity?: string };

/** 稳定后端身份不含操作者或连接 ID；元信息、项目、会话和任务必须共用此规则。 */
export function workspaceIdentityOf(workspacePath: string): string {
  return `workspace:${createHash("sha256").update(hostname()).update("\0").update(resolve(workspacePath)).digest("hex")}`;
}

export function workspaceKeyOf(ref: WorkspaceRef): string {
  // 修复原因：只在 server-info 补身份会让路径型创建与带身份查询落到两套任务/topic。
  return ref.workspaceIdentity?.trim() || workspaceIdentityOf(ref.workspacePath);
}

export function workspaceRefOf(ref: WorkspaceRef): WorkspaceRef {
  return { workspacePath: ref.workspacePath, workspaceIdentity: workspaceKeyOf(ref) };
}

/**
 * topic 级水位：`logEpoch` + `seq` 是 topic 的唯一权威顺序。
 * 同一 topic 的所有订阅者看到同一对 (fromSeq, toSeq]；不按订阅者各算一份序号。
 */
export class MockTopicLog {
  private readonly positions = new Map<string, { logEpoch: string; seq: number }>();

  /** 读取（必要时创建）topic 当前水位；快照帧用它作为 toSeq。 */
  position(topic: string): { logEpoch: string; seq: number } {
    return { ...this.current(topic) };
  }

  /** 追加一条 topic 顺序记录；返回本条记录的 (fromSeq, toSeq]。 */
  advance(topic: string): { logEpoch: string; fromSeq: number; toSeq: number } {
    const current = this.current(topic);
    const fromSeq = current.seq;
    current.seq += 1;
    return { logEpoch: current.logEpoch, fromSeq, toSeq: current.seq };
  }

  private current(topic: string): { logEpoch: string; seq: number } {
    const existing = this.positions.get(topic);
    if (existing) return existing;
    const created = { logEpoch: `epoch-${createUuid()}`, seq: 0 };
    this.positions.set(topic, created);
    return created;
  }
}

/** 一个模拟会话：v4 conversation topic 的权威状态。 */
export interface MockSession {
  sessionId: string;
  workspaceKey: string;
  workspaceRef: WorkspaceRef;
  logEpoch: string;
  /** topic 帧水位；(fromSeq, toSeq] 记账。 */
  seq: number;
  revision: number;
  phase: SessionPhase;
  createdAt: number;
  lastActivityAt: number;
  meta: SessionMetaState;
  rows: WireConversationRow[];
  usage: SessionUsageState;
  plan: PlanState | null;
  pendingInteractions: PendingInteraction[];
  /** 已准入但尚未开始的排队输入；queue 投影与 ACK 共用这一份状态。 */
  queuedInputs: QueueItem[];
  /** queue 的准入序号；order.admissionSeq 单调递增。 */
  nextAdmissionSeq: number;
  autoDrain: boolean;
  /** autoDrain=false 的原因（stopped / manual）；恢复自动续跑时清除。 */
  pauseReason?: "stopped" | "manual" | "error";
  /** sendQueuedNow 在运行中提升的输入：当前 turn 中断后立即开始。 */
  pendingStartText: string | null;
  /** 运行中的 turn 模拟器；stop 命令通过它中断。 */
  activeTurn: { abort: () => void } | null;
  /** 会话配置（createSession.config 合并 + switchModelConfig 更新）。 */
  config: {
    provider: string;
    model: string;
    thought: string;
    thoughtLevels: string[];
    followupMode: "queue" | "guide";
    mode: string;
    modelSelection?: {
      providerId: string;
      modelId: string;
      options?: { reasoningLevel?: string };
    };
  };
}

export interface MockTaskRecord {
  sessionId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  title: string;
  titleSource: "default" | "generated" | "custom";
  pinned: boolean;
  archived: boolean;
  unread: boolean;
  createdAt: number;
  lastActivityAt: number;
}

/** 虚拟文件系统节点。 */
export interface VirtualFileNode {
  kind: "file" | "directory";
  name: string;
  /** 文件内容（目录为空）。 */
  content?: string;
  children?: Map<string, VirtualFileNode>;
  mtimeMs: number;
}

export interface MockGitState {
  branch: string;
  statusEntries: Array<{
    path: string;
    staged: "added" | "modified" | "deleted" | "renamed" | null;
    unstaged: "modified" | "deleted" | null;
  }>;
  branches: Array<{ name: string; current: boolean; upstream?: string }>;
  log: Array<{ sha: string; message: string; author: string; date: string }>;
}

export interface MockRuntimeOptions {
  workspacePath: string;
}

/** 全局 mock 状态：会话、任务、虚拟 FS、git、设置。 */
export class MockRuntime {
  readonly workspacePath: string;
  readonly startedAt = Date.now();
  readonly sessions = new Map<string, MockSession>();
  readonly tasks = new Map<string, MockTaskRecord>();
  readonly virtualRoot: VirtualFileNode;
  readonly git: MockGitState;
  readonly settings = new Map<string, unknown>();
  /** sessions-index / workspace-config / controller topic 的唯一水位账本。 */
  readonly topics = new MockTopicLog();
  /** task 索引变更信号（IZCodeTaskService.onDynamicWorkspaceEvent）。 */
  readonly onWorkspaceTaskListChanged = new Emitter<{ workspacePath: string; type: string }>();
  /** 项目表提交后的通知；窗口项目目录与普通项目读取共享同一个 owner。 */
  readonly onProjectsChanged = new Emitter<void>();

  constructor(options: MockRuntimeOptions) {
    this.workspacePath = options.workspacePath;
    this.virtualRoot = buildFixtureWorkspace();
    this.git = buildFixtureGit();
    this.seedFixtureTasks();
  }

  seedFixtureTasks(): void {
    // 初始状态与真实服务一致：无历史任务（侧栏「暂无任务」），会话由用户创建后出现。
  }

  newSessionId(): string {
    return `sess_${createUuid()}`;
  }

  newLogEpoch(): string {
    return `epoch-${createUuid()}`;
  }
}

// ── 虚拟工作区 fixture ──

function dir(name: string, children: VirtualFileNode[]): VirtualFileNode {
  return {
    kind: "directory",
    name,
    children: new Map(children.map((c) => [c.name, c])),
    mtimeMs: Date.now(),
  };
}

function file(name: string, content: string): VirtualFileNode {
  return { kind: "file", name, content, mtimeMs: Date.now() };
}

/** 一个可信的小项目：README + src + 配置，足以驱动文件树/搜索/预览 UI。 */
export function buildFixtureWorkspace(): VirtualFileNode {
  return dir("workspace", [
    file(
      "README.md",
      [
        "# ZCode Web Demo",
        "",
        "这是一个模拟后端驱动的演示工作区。",
        "",
        "## 功能",
        "",
        "- 会话列表与任务管理",
        "- 流式对话与工具调用展示",
        "- 文件树、Git 面板与设置页",
        "",
        "所有数据均由内存中的模拟服务提供。",
      ].join("\n"),
    ),
    file(
      "package.json",
      JSON.stringify(
        {
          name: "zcode-web-demo",
          version: "1.0.0",
          private: true,
          scripts: { dev: "vite", build: "vite build" },
        },
        null,
        2,
      ),
    ),
    dir("src", [
      file(
        "main.ts",
        [
          'import { createApp } from "./app.js";',
          "",
          "const app = createApp(document.getElementById('root')!);",
          "app.render();",
        ].join("\n"),
      ),
      file(
        "app.ts",
        [
          "export function createApp(root: HTMLElement) {",
          "  return {",
          "    render() {",
          "      root.textContent = 'Hello ZCode';",
          "    },",
          "  };",
          "}",
        ].join("\n"),
      ),
      dir("components", [
        file("Button.tsx", "export function Button() {\n  return <button>click</button>;\n}\n"),
        file("Dialog.tsx", "export function Dialog() {\n  return null;\n}\n"),
      ]),
    ]),
    dir("docs", [file("design.md", "# 设计说明\n\n- 主色：#1f2937\n- 圆角：8px\n")]),
  ]);
}

export function buildFixtureGit(): MockGitState {
  return {
    branch: "main",
    statusEntries: [
      { path: "src/main.ts", staged: null, unstaged: "modified" },
      { path: "docs/design.md", staged: "added", unstaged: null },
    ],
    branches: [
      { name: "main", current: true, upstream: "origin/main" },
      { name: "feature/web-demo", current: false },
    ],
    log: [
      {
        sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
        message: "feat: 初始化模拟工作区",
        author: "ZCode Mock",
        date: new Date(Date.now() - 86_400_000).toISOString(),
      },
      {
        sha: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1",
        message: "chore: 添加组件示例",
        author: "ZCode Mock",
        date: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      },
    ],
  };
}

// ── 会话快照构造 ──

const SNAPSHOT_TAIL_WINDOW_ROWS = 60;

/** 由权威会话状态构造 conversation snapshot（尾窗 60 行）。 */
export function buildConversationSnapshot(session: MockSession): ConversationSnapshot {
  const ended = session.phase === "completedSuccess" || session.phase === "completedInterrupted";
  return {
    protocolVersion: 1,
    sessionId: session.sessionId,
    logEpoch: session.logEpoch,
    seq: session.seq,
    revision: session.revision,
    control: {
      phase: session.phase,
      sessionEnded: ended,
      canStop: session.phase === "running",
      stopState: session.phase === "running" ? "stoppable" : "idle",
      stopTargetKind: "unknown",
      activeWorks: [],
      lastError: null,
      apiRetry: null,
    },
    availability: {
      fork: { allowed: true },
      compact: { allowed: true },
      switchModelConfig: { allowed: true },
      setFollowupMode: { allowed: true },
      queueEdit: { allowed: true },
      sendQueuedNow: { allowed: true },
      pauseGoal: { allowed: false, reasonCode: "guard.goal.inactive" },
      resumeGoal: { allowed: false, reasonCode: "guard.goal.inactive" },
    },
    inputRouting: { mode: "startNow" },
    meta: session.meta,
    config: session.config,
    modelTransition: null,
    usage: session.usage,
    queue: {
      items: session.queuedInputs,
      autoDrain: session.autoDrain,
      ...(session.pauseReason ? { pauseReason: session.pauseReason } : {}),
    },
    pendingInteractions: session.pendingInteractions,
    pendingCommands: [],
    backgroundWorks: [],
    goal: null,
    plan: session.plan,
    workspaceHookAdmission: null,
    workspaceMcpAdmission: null,
    rows: {
      window: session.rows.slice(-SNAPSHOT_TAIL_WINDOW_ROWS),
      totalCount: session.rows.length,
      firstRowId: session.rows.length > 0 ? session.rows[0]!.rowId : null,
    },
  };
}

/** draft 会话不进入任务列表（真实 CLI：draft 为纯内存态，不落 tasks-index）。 */
export function isListedSession(session: MockSession): boolean {
  return session.phase !== "draft";
}

/** 由权威会话状态构造 sessions-index 摘要。 */
export function buildSessionSummary(session: MockSession): SessionSummary {
  const ended = session.phase === "completedSuccess" || session.phase === "completedInterrupted";
  const lastAssistant = [...session.rows].reverse().find((row) => row.kind === "assistantText");
  return {
    sessionId: session.sessionId,
    workspaceId: session.workspaceKey,
    title: session.meta.title,
    ...(session.meta.titleSource === "default" ? {} : { titleSource: session.meta.titleSource }),
    lastOutcome: ended
      ? session.phase === "completedSuccess"
        ? "completed"
        : "interrupted"
      : undefined,
    phase: session.phase,
    sessionEnded: ended,
    hasBackgroundWork: false,
    lastActivityAt: session.lastActivityAt,
    ...(lastAssistant?.kind === "assistantText" && lastAssistant.text
      ? { lastAssistantPreview: lastAssistant.text.slice(0, 120) }
      : {}),
    createdAt: session.createdAt,
  };
}
