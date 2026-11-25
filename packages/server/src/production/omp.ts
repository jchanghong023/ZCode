import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createServiceLogger } from "@zcode/services/logger";
import type { WebModelSelectionService, WebModelSelectionView } from "@zcode/services";
import type { SkillSummary } from "@zcode/shared";
import { modelSelectionSchema, type ModelSelection } from "@zcode/shared/model-selection";
import {
  initializeProductionAgentModels,
  type KnowledgeMcpSdk,
  type ProductionStore,
} from "../aireq/contract.js";
import {
  TuiChatHistory,
  type OmpTuiMessage,
  type OmpTuiSessionInfo,
  type TuiChatSource,
} from "./tui-chat-history.js";

interface Model {
  provider: string;
  id: string;
  name: string;
  input?: string[];
  reasoning?: boolean;
}
export interface OmpEvent {
  type: string;
  message?: {
    role: string;
    model?: string;
    responseId?: string;
    content?: unknown;
    stopReason?: string;
    errorMessage?: string;
    usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  };
  assistantMessageEvent?: { type: string; contentIndex?: number; delta?: string; content?: string };
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
  cancelled?: boolean;
}
type ImageInput = { type: "image"; mimeType: string; data: string };
export interface OmpSessionManager {
  getHeader(): { id: string; cwd?: string; origin?: string } | null;
  getSessionFile(): string | undefined;
  getSessionName(): string | undefined;
  buildSessionContext(options: { transcript: true }): {
    messages: readonly OmpTuiMessage[];
    models: Readonly<Record<string, string>>;
    configuredThinkingLevel?: string;
    thinkingLevel?: string;
  };
  setSessionName(title: string, source: "user"): Promise<unknown>;
  flush(): Promise<void>;
  close(): Promise<void>;
}
interface Session {
  model?: Model;
  sessionFile?: string;
  sessionManager: OmpSessionManager;
  skills: readonly {
    name: string;
    description: string;
    filePath: string;
    source: string;
    pluginRoot?: string;
  }[];
  modelRegistry: { getAvailable(): Model[]; find(provider: string, id: string): Model | undefined };
  configuredThinkingLevel(): string | undefined;
  getAvailableEffortSelectors(): readonly string[];
  subscribe(fn: (event: OmpEvent) => void): () => void;
  prompt(text: string, options: { images?: ImageInput[]; throwOnDrop: boolean }): Promise<boolean>;
  abort(): Promise<void>;
  steer(
    text: string,
    images?: ImageInput[],
    options?: { onPromptQueued(messages: readonly object[]): void },
  ): Promise<void>;
  dispose(): Promise<void>;
  setSessionName(title: string, source: "user"): Promise<boolean>;
  setModel(model: Model, role: string, options: { persist: boolean }): Promise<unknown>;
  setThinkingLevel(level: string, persist?: boolean): void;
  getContextUsage(): { tokens: number | null; contextWindow: number } | undefined;
}
export interface SdkModules extends KnowledgeMcpSdk {
  createAgentSession(options: Record<string, unknown>): Promise<{ session: Session }>;
  getSessionsDir(): string;
  SessionManager: {
    create(cwd: string, sessionDir?: string): OmpSessionManager;
    listAll(): Promise<OmpTuiSessionInfo[]>;
    open(
      path: string,
      sessionDir?: undefined,
      storage?: undefined,
      options?: {
        throwIfMissing: true;
        readOnly?: boolean;
        runtimeOwnership?: boolean;
        suppressBreadcrumb?: boolean;
      },
    ): Promise<OmpSessionManager>;
    inMemory(cwd: string): unknown;
  };
  getSupportedEfforts(model: Model): readonly string[];
}
interface OmpModelConfig {
  provider: string;
  model: string;
  thought: string;
  thoughtLevels: string[];
  modelSelection: ModelSelection;
}
export interface OmpTurn {
  key: string;
  scope: "chat" | "aireq";
  cwd: string;
  prompt: string;
  signal: AbortSignal;
  options?: Record<string, unknown>;
  selection?: ModelSelection;
  images?: ImageInput[];
  tuiSource?: TuiChatSource;
  writer?: OmpSessionManager;
  onSharedFile?: (source: TuiChatSource) => void;
  onReady?: (config: OmpModelConfig) => void;
  onText: (text: string) => void;
  onEvent?: (event: OmpEvent) => void;
  onContextUsage?: (usage: {
    usedTokens: number;
    maxTokens: number;
    autoCompactThresholdTokens: null;
  }) => void;
}
interface Catalogue {
  models: Model[];
  preferred?: ModelSelection;
}
interface ActiveSession {
  session: Session;
  delivered: WeakMap<object, () => void>;
}
const viewInput = z.strictObject({ selection: modelSelectionSchema.nullable() }).optional();
const logger = createServiceLogger("omp");

function modelUnavailable() {
  return Object.assign(new Error("当前 OMP 配置没有可用模型，请检查本机供应商配置和凭据。"), {
    publicMessage: true,
    code: "fault.omp.modelUnavailable",
  });
}

export class OmpEngine implements WebModelSelectionService {
  private readonly catalogues = new Map<string, Catalogue>();
  private defaultDirectory?: string;
  private live = new Map<string, ActiveSession>();
  private turns = new Map<string, Promise<string>>();
  constructor(
    private sdk: SdkModules,
    private store: ProductionStore,
  ) {}
  tuiChatHistory(): TuiChatHistory {
    return new TuiChatHistory(this.sdk);
  }
  get knowledgeMcp(): KnowledgeMcpSdk {
    return this.sdk;
  }

  private async inspect(cwd: string, includeSkills: boolean) {
    // 探测使用 SDK 的内存会话。仅发送时才建立可恢复的 OMP 会话文件。
    const { session } = await this.sdk.createAgentSession({
      cwd,
      sessionManager: this.sdk.SessionManager.inMemory(cwd),
      enableMCP: false,
      enableLsp: false,
    });
    try {
      const model = session.model;
      const preferred = model ? { providerId: model.provider, modelId: model.id } : undefined;
      const models = [...session.modelRegistry.getAvailable()];
      if (model && !models.some((m) => m.provider === model.provider && m.id === model.id))
        models.push(model);
      this.catalogues.set(resolve(cwd), { models, preferred });
      if (!includeSkills) return [];
      return session.skills.map(
        (skill): SkillSummary => ({
          id: skill.name,
          name: skill.name,
          description: skill.description,
          path: skill.filePath,
          body: "",
          enabled: true,
          scope: skill.pluginRoot
            ? "plugin"
            : skill.source === "project" || skill.source === "workspace"
              ? "workspace"
              : "user",
        }),
      );
    } finally {
      await session.dispose();
    }
  }
  async discover(cwd: string): Promise<void> {
    this.defaultDirectory = resolve(cwd);
    try {
      await this.inspect(cwd, false);
    } catch {
      // 区内目录、文档与评论可独立使用。SDK 缺少供应商配置时，仅禁用模型操作。
      logger.warn(
        undefined,
        "OMP model discovery unavailable; check the deployed provider configuration.",
      );
      this.catalogues.set(this.defaultDirectory, { models: [] });
    }
    const { preferred } = this.catalogue();
    initializeProductionAgentModels(
      this.choices(),
      preferred ? preferred.providerId + "/" + preferred.modelId : undefined,
    );
  }
  async skills(cwd: string): Promise<SkillSummary[]> {
    try {
      return await this.inspect(cwd, true);
    } catch {
      throw modelUnavailable();
    }
  }
  private catalogue(cwd?: string): Catalogue {
    return (
      this.catalogues.get(cwd ? resolve(cwd) : (this.defaultDirectory ?? "")) ?? { models: [] }
    );
  }
  choices() {
    return this.catalogue().models.map((m) => ({
      id: m.provider + "/" + m.id,
      name: m.name,
      provider: m.provider,
      providerId: m.provider,
      modelId: m.id,
    }));
  }
  private levels(model: Model) {
    return model.reasoning
      ? ["default", "off", "auto", ...this.sdk.getSupportedEfforts(model)]
      : ["default"];
  }
  config(selection?: ModelSelection, cwd?: string): OmpModelConfig | null {
    const { models, preferred } = this.catalogue(cwd);
    const wanted = selection ?? preferred;
    if (!wanted) return null;
    const model = models.find((m) => m.provider === wanted.providerId && m.id === wanted.modelId);
    if (!model) return null;
    const thought = wanted.options?.reasoningLevel ?? "default";
    const thoughtLevels = this.levels(model);
    if (!thoughtLevels.includes(thought)) return null;
    return {
      provider: model.provider,
      model: model.id,
      thought,
      thoughtLevels,
      modelSelection: wanted,
    };
  }
  async getView(
    input?: Parameters<WebModelSelectionService["getView"]>[0],
  ): Promise<WebModelSelectionView> {
    if (arguments.length > 1)
      throw Object.assign(new Error("模型目录查询最多接收一个参数。"), {
        code: "INVALID_ARGUMENT",
      });
    const { models, preferred } = this.catalogue();
    const wanted = viewInput.parse(input)?.selection ?? preferred;
    const effective = this.config(wanted)?.modelSelection;
    return {
      revision: 1,
      providers: [...new Set(models.map((m) => m.provider))].map((providerId) => ({
        providerId,
        providerName: providerId,
        config: {},
        models: models
          .filter((m) => m.provider === providerId)
          .map((m) => ({
            modelId: m.id,
            config: {
              properties: { inputFormat: { supportsImage: m.input?.includes("image") ?? false } },
              optionSpecs: { reasoningLevel: { values: this.levels(m) } },
            },
          })),
      })),
      ...(preferred && { preferredSelection: preferred }),
      effectiveSelection: effective ?? null,
      ...(!effective && {
        selectionIssue: !wanted
          ? "selection-missing"
          : models.some((m) => m.id === wanted.modelId && m.provider === wanted.providerId)
            ? "reasoning-level-not-supported"
            : "model-not-found",
      }),
    };
  }

  async steer(
    key: string,
    text: string,
    images?: ImageInput[],
    onDelivered?: () => void,
  ): Promise<void> {
    const active = this.live.get(key);
    if (!active) throw new Error("OMP 会话尚未进入可引导状态。");
    await active.session.steer(text, images, {
      onPromptQueued(messages) {
        const user = [...messages].reverse().find((m) => "role" in m && m.role === "user");
        if (user && onDelivered) active.delivered.set(user, onDelivered);
      },
    });
  }
  async rename(
    key: string,
    title: string,
    shared?: { source: TuiChatSource; directory: string; sessionId: string },
  ): Promise<void> {
    const active = this.live.get(key);
    if (active) {
      await active.session.setSessionName(title, "user");
      return;
    }
    const prior = this.turns.get(key);
    if (prior) await prior.catch(() => {});
    if (shared?.source.file) {
      const writer = (
        await this.tuiChatHistory().open(
          { ...shared.source, file: shared.source.file },
          shared.directory,
          shared.sessionId,
          true,
        )
      )?.manager;
      if (!writer) throw new Error("OMP 会话未取得写入权限。");
      try {
        await writer.setSessionName(title, "user");
        await writer.flush();
      } finally {
        await writer.close();
      }
      return;
    }
    const file = this.store.get<string>("omp-file:" + key);
    if (file) {
      const manager = await this.sdk.SessionManager.open(file, undefined, undefined, {
        throwIfMissing: true,
      });
      try {
        await manager.setSessionName(title, "user");
      } finally {
        await manager.close();
      }
    }
  }
  run(turn: OmpTurn): Promise<string> {
    // 停止后浏览器可立即提交下一条。旧 SDK 会话先关闭，避免两个 writer 同时追加同一份原生日志。
    const previous = this.turns.get(turn.key);
    const result = previous
      ? previous.catch(() => {}).then(() => this.runSession(turn))
      : this.runSession(turn);
    this.turns.set(turn.key, result);
    const release = () => {
      if (this.turns.get(turn.key) === result) this.turns.delete(turn.key);
    };
    void result.then(release, release);
    return result;
  }
  private async runSession(turn: OmpTurn): Promise<string> {
    if (turn.signal.aborted) {
      await turn.writer?.close();
      turn.signal.throwIfAborted();
    }
    const recordKey = "omp-file:" + turn.key;
    const source = turn.tuiSource;
    const file = source ? source.file : this.store.get<string>(recordKey);
    let manager: OmpSessionManager;
    if (turn.writer) {
      manager = turn.writer;
    } else if (source?.file) {
      const opened = await this.tuiChatHistory().open(
        { ...source, file: source.file },
        turn.cwd,
        "",
        true,
      );
      if (!opened?.manager) throw new Error("OMP 会话未取得写入权限。");
      manager = opened.manager;
    } else if (source) {
      // SDK 默认目录即 TUI 会话目录；AgentSession 构造时会持有原生写者租约。
      manager = this.sdk.SessionManager.create(turn.cwd);
    } else if (file) {
      manager = await this.sdk.SessionManager.open(file, undefined, undefined, {
        throwIfMissing: true,
      });
    } else {
      const sessionDir = join(this.store.root, "omp-sessions", turn.scope);
      await mkdir(sessionDir, { recursive: true });
      manager = this.sdk.SessionManager.create(turn.cwd, sessionDir);
    }
    let session: Session;
    try {
      ({ session } = await this.sdk.createAgentSession({
        ...turn.options,
        cwd: turn.cwd,
        sessionManager: manager,
      }));
    } catch (error) {
      await manager.close();
      if (!file) throw modelUnavailable();
      throw error;
    }
    const active: ActiveSession = { session, delivered: new WeakMap() };
    const allocatedFile = session.sessionFile;
    const abort = () => {
      void session.abort().catch(() => {});
    };
    let reply = "",
      failure: string | undefined;
    const unsubscribe = session.subscribe((event) => {
      if (turn.signal.aborted) return;
      if (event.type === "agent_start" && session.model && !this.live.has(turn.key)) {
        this.live.set(turn.key, active);
        const thought = session.configuredThinkingLevel() ?? "default";
        turn.onReady?.({
          provider: session.model.provider,
          model: session.model.id,
          thought,
          thoughtLevels: ["default", ...session.getAvailableEffortSelectors()],
          modelSelection: {
            providerId: session.model.provider,
            modelId: session.model.id,
            options: { reasoningLevel: thought },
          },
        });
      }
      if (event.type === "message_start") {
        if (event.message?.role === "assistant") reply = "";
        if (event.message?.role === "user") {
          const delivered = active.delivered.get(event.message);
          if (delivered) {
            active.delivered.delete(event.message);
            delivered();
          }
        }
      }
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        reply += event.assistantMessageEvent.delta ?? "";
        turn.onText(reply);
      }
      if (event.type === "message_end" && event.message?.role === "assistant") {
        failure =
          event.message.stopReason === "error" || event.message.stopReason === "aborted"
            ? "OMP 模型执行未完成。"
            : undefined;
        if (Array.isArray(event.message.content)) {
          reply = event.message.content
            .filter((block) => block?.type === "text")
            .map((block) => String(block.text))
            .join("");
        }
      }
      turn.onEvent?.(event);
    });
    try {
      turn.signal.addEventListener("abort", abort, { once: true });
      turn.signal.throwIfAborted();
      if (turn.selection) {
        const model = session.modelRegistry.find(turn.selection.providerId, turn.selection.modelId);
        if (!model) throw modelUnavailable();
        if (session.model?.id !== model.id || session.model.provider !== model.provider)
          await session.setModel(model, "default", { persist: false });
        const effort = turn.selection.options?.reasoningLevel;
        if (effort && effort !== "default") {
          if (!session.getAvailableEffortSelectors().includes(effort))
            throw new Error("OMP 模型不支持所选思考档位。");
          session.setThinkingLevel(effort, false);
        }
      }
      turn.signal.throwIfAborted();
      // 文件路径由 SDK 分配，用于在同一部署恢复这条 Web 会话的原生历史。
      if (!session.model) throw modelUnavailable();
      if (source && !source.file) {
        const nativeId = manager.getHeader()?.id;
        if (!allocatedFile || !nativeId) throw new Error("OMP 未分配可恢复的共用会话。");
        turn.onSharedFile?.({ root: source.root, file: allocatedFile, nativeId });
      } else if (!source && allocatedFile && allocatedFile !== file) {
        await session.sessionManager.flush();
        this.store.set(recordKey, allocatedFile);
      }
      await session.prompt(turn.prompt, {
        throwOnDrop: true,
        ...(turn.images?.length ? { images: turn.images } : {}),
      });
      if (source) {
        await manager.flush();
        if (manager.getSessionFile() !== allocatedFile)
          throw new Error("OMP 共用会话日志在写入期间发生变化。");
      }
      turn.signal.throwIfAborted();
      if (failure) throw new Error(failure);
      const usage = session.getContextUsage();
      if (
        usage &&
        usage.tokens !== null &&
        Number.isFinite(usage.tokens) &&
        usage.tokens >= 0 &&
        usage.contextWindow > 0
      )
        turn.onContextUsage?.({
          usedTokens: usage.tokens,
          maxTokens: usage.contextWindow,
          autoCompactThresholdTokens: null,
        });
      return reply;
    } finally {
      turn.signal.removeEventListener("abort", abort);
      if (this.live.get(turn.key) === active) this.live.delete(turn.key);
      unsubscribe();
      await session.dispose();
      // SDK 会清除未物化的空草稿；失败后重发不能打开不存在的日志。
      if (!file && allocatedFile && !(await Bun.file(allocatedFile).exists())) {
        if (source) turn.onSharedFile?.({ root: source.root });
        else this.store.set(recordKey, null);
      }
    }
  }
}
