import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ModelSelection } from "@zcode/shared/model-selection";
import type {
  AssistantTextRow,
  TurnHeaderRow,
  WireConversationRow,
} from "@zcode/shared/zcode-protocol-v4";
import type { OmpSessionManager, SdkModules } from "./omp.js";

export interface OmpTuiSessionInfo {
  id: string;
  path: string;
  cwd: string;
  title?: string;
  firstMessage: string;
  created: Date;
  modified: Date;
}

export interface OmpTuiMessage {
  role: string;
  timestamp?: number;
  content?: string | readonly { type: string; text?: string }[];
  stopReason?: string;
  model?: string;
  responseId?: string;
}

export interface TuiChatSummary {
  sessionId: string;
  nativeId: string;
  file: string;
  directory: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
}

export type TuiChatSource = { root: string; file?: string; nativeId?: string; version?: string };
type TuiChatTarget = { file: string; nativeId?: string; version?: string };
export class TuiChatConflict extends Error {
  readonly publicMessage = true;
}

async function fileVersion(file: string): Promise<{ key: string; modifiedAt: number }> {
  const { mtimeNs, ctimeNs, size, mtimeMs } = await stat(file, { bigint: true });
  return { key: `${mtimeNs}:${ctimeNs}:${size}`, modifiedAt: Number(mtimeMs) };
}

async function sessionFileWithin(root: string, file: string): Promise<string> {
  const actual = await realpath(file);
  const fromRoot = relative(root, actual);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(".." + sep) || isAbsolute(fromRoot))
    throw new Error("OMP 会话不在当前会话目录内。");
  return actual;
}

async function projectDirectory(cwd: string): Promise<string | undefined> {
  if (!isAbsolute(cwd)) return undefined;
  try {
    const actual = await realpath(cwd);
    if ((await stat(actual)).isDirectory()) return actual;
  } catch {
    // 已删除或无法访问的项目不能在 Web 续聊。
  }
}

type Recent = { sessionId: string; createdAt: number; lastActivityAt: number };
export function compareRecentChats(a: Recent, b: Recent): number {
  return (
    b.lastActivityAt - a.lastActivityAt ||
    b.createdAt - a.createdAt ||
    a.sessionId.localeCompare(b.sessionId)
  );
}

export class TuiChatHistory {
  readonly root: string;
  constructor(private readonly sdk: SdkModules) {
    this.root = resolve(sdk.getSessionsDir());
  }

  owns(source: TuiChatSource): boolean {
    return source.root === this.root;
  }

  async list(limit: number): Promise<TuiChatSummary[]> {
    const root = await realpath(this.root).catch(() => undefined);
    if (!root) return [];
    // SDK 的 TUI 列表会将置顶提到最前；Web 按实际活动排序，不沿用置顶。
    const sessions = (await this.sdk.SessionManager.listAll())
      .filter(({ firstMessage }) => firstMessage.trim() && firstMessage !== "(no messages)")
      .map((info) => ({
        info,
        sessionId: this.webId(info.id),
        createdAt: info.created.getTime(),
        lastActivityAt: info.modified.getTime(),
      }))
      .sort(compareRecentChats);
    const projects = new Map<string, number>();
    const paths = new Map<string, string | undefined>();
    const seen = new Set<string>();
    const list: TuiChatSummary[] = [];
    for (const { info, sessionId, createdAt, lastActivityAt } of sessions) {
      if (seen.has(sessionId)) continue;
      if (!paths.has(info.cwd)) paths.set(info.cwd, await projectDirectory(info.cwd));
      const directory = paths.get(info.cwd);
      if (!directory) continue;
      const count = projects.get(directory);
      if (count === limit || (count === undefined && projects.size === limit)) continue;
      const file = await sessionFileWithin(root, info.path).catch(() => undefined);
      if (!file) continue;
      const customTitle = info.title?.trim();
      list.push({
        sessionId,
        nativeId: info.id,
        file,
        directory,
        title: (customTitle || info.firstMessage.trim()).replace(/\s+/gu, " ").slice(0, 120),
        createdAt,
        lastActivityAt,
      });
      seen.add(sessionId);
      projects.set(directory, (count ?? 0) + 1);
      if (list.length === limit * limit) break;
    }
    return list;
  }

  private webId(id: string): string {
    return "tui-" + createHash("sha256").update(this.root).update("\0").update(id).digest("hex");
  }

  private async validate(
    manager: OmpSessionManager,
    source: TuiChatTarget,
    directory: string,
    webId: string,
  ) {
    const header = manager.getHeader();
    if (
      !header ||
      (source.nativeId ? header.id !== source.nativeId : this.webId(header.id) !== webId) ||
      header.origin ||
      (await projectDirectory(header.cwd ?? "")) !== directory
    )
      throw new Error("OMP 会话已变更或工作目录不可用。");
    return header.id;
  }

  async open(source: TuiChatTarget, directory: string, webId: string, write: boolean) {
    const file = await sessionFileWithin(await realpath(this.root), source.file);
    const version = await fileVersion(file);
    if (!write && version.key === source.version) return;
    const manager = await this.sdk.SessionManager.open(file, undefined, undefined, {
      readOnly: !write,
      throwIfMissing: true,
      runtimeOwnership: write,
      suppressBreadcrumb: true,
    }).catch((error: unknown) => {
      // SDK 对占用抛出普通 Error，不能将含源路径的诊断透传给浏览器。
      if (write && error instanceof Error && /another live omp (?:owner|process)/.test(error.message))
        throw new TuiChatConflict("OMP TUI 正占用此会话，请切换或退出该会话后重试。");
      throw error;
    });
    try {
      const nativeId = await this.validate(manager, source, directory, webId);
      if ((await fileVersion(file)).key !== version.key)
        throw new TuiChatConflict("OMP 会话刚刚更新，请重试。");
      const binding = { root: this.root, file, nativeId, version: version.key };
      const projection =
        version.key === source.version ? undefined : this.snapshot(manager, version.modifiedAt);
      const snapshot = projection?.rows.length
        ? { ...projection, source: binding, lastActivityAt: version.modifiedAt }
        : undefined;
      if (!write && !snapshot) throw new Error("OMP 会话没有可读取的对话历史。");
      if (!write) await manager.close();
      return { snapshot, manager: write ? manager : undefined };
    } catch (error) {
      await manager.close();
      throw error;
    }
  }

  private snapshot(manager: OmpSessionManager, at: number) {
    const transcript = manager.buildSessionContext({ transcript: true });
    const { rows, phase } = projectTranscript(transcript.messages, at);
    const model = transcript.models.default;
    const slash = model?.indexOf("/") ?? -1;
    const effort = transcript.configuredThinkingLevel ?? transcript.thinkingLevel;
    const selection: ModelSelection | undefined =
      model && slash > 0
        ? {
            providerId: model.slice(0, slash),
            modelId: model.slice(slash + 1),
            ...(effort ? { options: { reasoningLevel: effort } } : {}),
          }
        : undefined;
    const customTitle = manager.getSessionName()?.trim();
    const first = rows.find((row) => row.kind === "userInput")?.text ?? "";
    return {
      rows,
      phase,
      selection,
      title: (customTitle || first.trim()).replace(/\s+/gu, " ").slice(0, 120),
      customTitle: Boolean(customTitle),
    };
  }
}

function projectTranscript(messages: readonly OmpTuiMessage[], createdAt: number) {
  const rows: WireConversationRow[] = [];
  let turn: TurnHeaderRow | undefined;
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text =
      typeof message.content === "string"
        ? message.content
        : message.content
            ?.filter((block) => block.type === "text")
            .map((block) => block.text ?? "")
            .join("\n");
    const timestamp = message.timestamp;
    const at =
      timestamp !== undefined && Number.isFinite(timestamp) && timestamp >= 0
        ? timestamp
        : (turn?.endedAt ?? createdAt);
    if (message.role === "user") {
      const turnId = `tui-turn-${rows.length}`;
      turn = {
        kind: "turnHeader",
        rowId: rows.length,
        turnId,
        createdAt: at,
        createdAtSeq: 0,
        origin: "userInput",
        executionKind: "agent",
        state: "completedInterrupted",
        startedAt: at,
        endedAt: at,
      };
      rows.push(turn, {
        kind: "userInput",
        rowId: rows.length + 1,
        turnId,
        createdAt: at,
        createdAtSeq: 0,
        origin: "realUser",
        text: text ?? "",
      });
    } else if (turn) {
      const state: AssistantTextRow["state"] =
        message.stopReason === "error"
          ? "failed"
          : message.stopReason === "aborted" || message.stopReason === "length"
            ? "interrupted"
            : "complete";
      turn.endedAt = Math.max(turn.startedAt, at);
      turn.state =
        state === "failed"
          ? "failed"
          : state === "interrupted" || message.stopReason === "toolUse"
            ? "completedInterrupted"
            : "completedSuccess";
      if (text)
        rows.push({
          kind: "assistantText",
          rowId: rows.length,
          turnId: turn.turnId,
          createdAt: at,
          createdAtSeq: 0,
          text,
          state,
          model: message.model,
          ...(message.responseId ? { assistantResponseId: message.responseId } : {}),
        });
    }
  }
  const phase = turn?.state === "completedSuccess" ? "completedSuccess" : "completedInterrupted";
  return { rows, phase } as const;
}
