// 模拟后端运行时：所有 mock 服务共用的内存事实，不冒充真实 AI、Git 或数据库。
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { createUuid, type SkillSummary } from "@zcode/shared";
import type {
  ActiveWorkSummary,
  ConversationSnapshot,
  PlanState,
  QueueState,
  SessionControl,
  SessionErrorInfo,
  QueueItem,
  ReturnedConversationInput,
  SessionMetaState,
  SessionPhase,
  SessionUsageState,
  WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";

import type { AIReqNativeReviewWork } from "../aireq/contract.js";
import type { TuiChatSource } from "../production/tui-chat-history.js";

export type WorkspaceRef = { workspacePath: string; workspaceIdentity?: string };

/** 稳定后端身份不含操作者或连接 ID；项目、会话和任务必须共用此规则。 */
function workspaceIdentityOf(workspacePath: string): string {
  return `workspace:${createHash("sha256").update(hostname()).update("\0").update(resolve(workspacePath)).digest("hex")}`;
}

export function workspaceKeyOf(ref: WorkspaceRef): string {
  // 路径型创建与带身份查询共用同一任务/topic，不依赖旧远程发现元信息。
  return ref.workspaceIdentity?.trim() || workspaceIdentityOf(ref.workspacePath);
}

export function workspaceRefOf(ref: WorkspaceRef): WorkspaceRef {
  return { workspacePath: ref.workspacePath, workspaceIdentity: workspaceKeyOf(ref) };
}

export type MockInputContext = { skill: SkillSummary; args: string };

export type MockQueuedInput = {
  item: QueueItem;
  context?: MockInputContext;
  actor: string;
  documentReview?: AIReqNativeReviewWork;
};

export type MockActiveTurn = {
  controller: AbortController;
  work: ActiveWorkSummary & { foregroundExecutionId: string };
  documentReview?: boolean;
};

/** 一个模拟会话：v4 conversation topic 的权威状态。 */
export interface MockSession {
  sessionId: string;
  workspaceKey: string;
  workspaceRef: WorkspaceRef;
  /** 原生草稿创建者不可由订阅或附件请求改写，防止猜测 ID 后认领他人草稿。 */
  draftCreatorActor?: string;
  /** 独立聊天的归组目录，服务端解析路径别名后保存。 */
  chatDirectory?: string;
  /** 本机个人聊天绑定的 OMP 配置根、原生日志和已投影版本。 */
  tuiSource?: TuiChatSource;
  /** 首次初始化时冻结的可引用技能；目录更新不能泄漏进既有会话。 */
  skills: SkillSummary[];
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
  /** 已接纳但尚未交付给运行中回合的输入。 */
  queuedInputs: MockQueuedInput[];
  /** 按原发送者隔离，等待各自的输入框确认恢复。 */
  returnedInputs?: Map<string, ReturnedConversationInput[]>;
  nextAdmissionSeq: number;
  activeTurn: MockActiveTurn | null;
  lastError?: SessionErrorInfo;
  nativeBindingApplied?: boolean;
  /** 用户显式选择才覆盖个人 OMP 工作目录的默认模型。 */
  explicitModelSelection?: boolean;
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

interface MockTaskRecord {
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

interface MockRuntimeOptions {
  workspacePath: string;
  production?: boolean;
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
    this.virtualRoot = options.production ? dir("", []) : buildFixtureWorkspace();
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
function buildFixtureWorkspace(): VirtualFileNode {
  const diagram = "```mermaid\nflowchart LR\n  UI[浏览器] --> Mock[模拟后端]\n```\n";
  return dir("workspace", [
    file(
      "README.md",
      [
        diagram,
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
    dir("docs", [file("design.md", `${diagram}\n# 设计说明\n\n- 主色：#1f2937\n- 圆角：8px\n`)]),
  ]);
}

// ── 会话快照构造 ──

const SNAPSHOT_TAIL_WINDOW_ROWS = 60;

function projectMockControl(session: MockSession): SessionControl {
  const work = session.activeTurn?.work;
  const stopping = session.activeTurn?.controller.signal.aborted === true;
  return {
    phase: session.phase,
    sessionEnded: session.phase === "completedSuccess" || session.phase === "completedInterrupted",
    canStop: work !== undefined && !stopping,
    stopState: stopping ? "stopping" : work ? "stoppable" : "idle",
    stopTargetKind: work ? "assistant" : "unknown",
    activeWorks: work ? [work] : [],
    lastError: session.lastError ?? null,
    apiRetry: null,
  };
}

export function projectMockQueue(session: MockSession): QueueState {
  return {
    items: session.queuedInputs.map(({ item }, queuePosition) => ({
      ...item,
      order: { admissionSeq: item.order.admissionSeq, queuePosition },
    })),
    autoDrain: true,
  };
}

export function projectMockExecution(
  session: MockSession,
  switchModelConfigAllowed: boolean,
): Pick<ConversationSnapshot, "control" | "availability" | "inputRouting" | "queue"> {
  const canSwitchModel = switchModelConfigAllowed && session.activeTurn === null;
  const unsupported = {
    allowed: false,
    reasonCode: "fault.command.capabilityUnsupported",
  } as const;
  const switchModelConfig = canSwitchModel
    ? { allowed: true as const }
    : switchModelConfigAllowed
      ? { allowed: false as const, reasonCode: "guard.session.busy" }
      : unsupported;
  return {
    queue: projectMockQueue(session),
    control: projectMockControl(session),
    availability: {
      fork: { allowed: false, reasonCode: "fault.command.capabilityUnsupported" },
      compact: { allowed: false, reasonCode: "fault.command.capabilityUnsupported" },
      switchModelConfig,
      setFollowupMode: unsupported,
      queueEdit: unsupported,
      sendQueuedNow: unsupported,
      pauseGoal: { allowed: false, reasonCode: "guard.goal.inactive" },
      resumeGoal: { allowed: false, reasonCode: "guard.goal.inactive" },
    },
    inputRouting: { mode: session.activeTurn ? "streamingChoice" : "startNow" },
  };
}

/** 由权威会话状态构造 conversation snapshot（尾窗 60 行）。 */
export function buildConversationSnapshot(
  session: MockSession,
  switchModelConfigAllowed = true,
): ConversationSnapshot {
  return {
    protocolVersion: 1,
    sessionId: session.sessionId,
    logEpoch: session.logEpoch,
    seq: session.seq,
    revision: session.revision,
    ...projectMockExecution(session, switchModelConfigAllowed),
    meta: session.meta,
    config: session.config,
    modelTransition: null,
    usage: session.usage,
    pendingInteractions: [],
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
