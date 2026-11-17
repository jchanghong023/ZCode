// 模拟后端运行时：所有 mock 服务共用的内存事实，不冒充真实 AI、Git 或数据库。
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { createUuid, type ZCodeSkillReferenceCatalogEntry } from "@zcode/shared";
import type {
  ConversationSnapshot,
  PlanState,
  PendingInteraction,
  QueueItem,
  SessionMetaState,
  SessionPhase,
  SessionUsageState,
  WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";

export type WorkspaceRef = { workspacePath: string; workspaceIdentity?: string };

/** 稳定后端身份不含操作者或连接 ID；项目、会话和任务必须共用此规则。 */
export function workspaceIdentityOf(workspacePath: string): string {
  return `workspace:${createHash("sha256").update(hostname()).update("\0").update(resolve(workspacePath)).digest("hex")}`;
}

export function workspaceKeyOf(ref: WorkspaceRef): string {
  // 路径型创建与带身份查询共用同一任务/topic，不依赖旧远程发现元信息。
  return ref.workspaceIdentity?.trim() || workspaceIdentityOf(ref.workspacePath);
}

export function workspaceRefOf(ref: WorkspaceRef): WorkspaceRef {
  return { workspacePath: ref.workspacePath, workspaceIdentity: workspaceKeyOf(ref) };
}

/** 一个模拟会话：v4 conversation topic 的权威状态。 */
export interface MockSession {
  sessionId: string;
  workspaceKey: string;
  workspaceRef: WorkspaceRef;
  /** 原生草稿创建者不可由订阅或附件请求改写，防止猜测 ID 后认领他人草稿。 */
  draftCreatorActor?: string;
  /** 首次初始化时冻结的可引用技能；目录更新不能泄漏进既有会话。 */
  skillReferenceCatalog: ZCodeSkillReferenceCatalogEntry[];
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
  /** 保留提升项的原命令与附件；仅保存正文会使中断续跑丢失接纳身份。 */
  pendingStartInput: QueueItem | null;
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
  /** 二进制文件的原始事实；存在时读取不经过 UTF-8 编解码。 */
  bytes?: Uint8Array;
  children?: Map<string, VirtualFileNode>;
  mtimeMs: number;
}

export interface MockRuntimeOptions {
  workspacePath: string;
}

/** 全局 mock 状态：会话、任务与虚拟 FS。 */
export class MockRuntime {
  readonly workspacePath: string;
  readonly startedAt = Date.now();
  readonly sessions = new Map<string, MockSession>();
  readonly tasks = new Map<string, MockTaskRecord>();
  readonly virtualRoot: VirtualFileNode;

  constructor(options: MockRuntimeOptions) {
    this.workspacePath = options.workspacePath;
    this.virtualRoot = buildFixtureWorkspace();
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

// ── 会话快照构造 ──

const SNAPSHOT_TAIL_WINDOW_ROWS = 60;

/** 由权威会话状态构造 conversation snapshot（尾窗 60 行）。 */
export function buildConversationSnapshot(
  session: MockSession,
  switchModelConfigAllowed = true,
): ConversationSnapshot {
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
      fork: { allowed: false, reasonCode: "fault.command.capabilityUnsupported" },
      compact: { allowed: false, reasonCode: "fault.command.capabilityUnsupported" },
      switchModelConfig: switchModelConfigAllowed
        ? { allowed: true }
        : { allowed: false, reasonCode: "fault.command.capabilityUnsupported" },
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
