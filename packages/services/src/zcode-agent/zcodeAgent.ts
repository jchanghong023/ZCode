/* eslint-disable max-lines -- ZCode agent service 接口集中声明 protocol/session/workspace 方法，拆分会增加 service descriptor 迁移成本。 */
import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared/channels";
import type { ZCodeSkillsReferenceCatalogResult, ZCodeTaskClientMode } from "@zcode/shared";
import type {
  ClientHello,
  CommandAck,
  CommandEnvelope,
  CommandKey,
  CommandsQueryResult,
  ConversationCommandCatalogEntry,
  ConversationTopicWireCandidate,
  ConversationRowTarget,
  HelloMessage,
  V4AttachmentBeginResult,
  V4AttachmentChunkResult,
  V4AttachmentCommitResult,
  V4AttachmentReadResult,
  V4ConversationRowsRangeResult,
  V4ConversationResyncResult,
  V4ConversationSubscribeResult,
  WebClientHello,
  WebCommandAck,
  WebCommandsQueryResult,
  WebConversationResyncResult,
  WebConversationSubscribeResult,
  WebHelloMessage,
} from "@zcode/shared/zcode-protocol-v4";
import { createServiceDescriptor } from "../descriptors.js";

export interface ZCodeAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}

/** sessionId 指定原生会话的冻结 Skill 目录；省略时读取当前工作区目录。 */
export interface ZCodeAgentSkillReferenceCatalogParams extends ZCodeAgentWorkspaceTarget {
  sessionId?: string;
}

export interface ZCodeAgentSessionTarget extends ZCodeAgentWorkspaceTarget {
  sessionId: string;
}

export const ZCODE_AGENT_RUNTIME_UNAVAILABLE_CODE = "ZCODE_AGENT_RUNTIME_UNAVAILABLE";

export type ZCodeAgentRuntimePolicy = "start-if-needed" | "existing-only";

// ── v4 conversation 通道（竖切）──
// host 只做转发：subscribe/unsubscribe/command 透传给 CLI v4 gateway，
// v4/conversation/frame 通知按 workspace fan-out 给 renderer。

export interface ZCodeAgentConversationSubscribeParams extends ZCodeAgentSessionTarget {
  retryInitialization?: string;
  /** 水位不变量：仅当客户端真持有该时刻一致状态才允许带。 */
  base?: { logEpoch: string; seq: number };
  visibility?: "foreground" | "background";
}

export interface ZCodeAgentConversationUnsubscribeParams extends ZCodeAgentWorkspaceTarget {
  subscriptionId: string;
  runtimePolicy?: ZCodeAgentRuntimePolicy;
}

export interface ZCodeAgentConversationResyncParams extends ZCodeAgentWorkspaceTarget {
  subscriptionId: string;
  base: { logEpoch: string; seq: number } | null;
  forceSnapshot?: boolean;
  runtimePolicy?: ZCodeAgentRuntimePolicy;
}

/** 行分页 query（rows/range）：按游标向上取一窗历史行。 */
export interface ZCodeAgentConversationRowsRangeParams extends ZCodeAgentSessionTarget {
  /** 取 rowId < beforeRowId 的行；缺省 = 从当前尾部向前。 */
  beforeRowId?: number;
  /** 1..rowsRangeMaxLimit（200）。 */
  limit: number;
  /**
   * 手机预加载：只读热会话。工作区 CLI 未运行、执行端不支持、会话不在内存都报
   * proto.sessionNotResident，不拉起进程、不冷恢复。
   */
  residency?: "resident-only";
}

/** Channel RPC 分页只公开用于展示和一致性检查的字段。 */
export type ZCodeAgentConversationRowsRangeResult = Omit<V4ConversationRowsRangeResult, "atSeq">;

/**
 * Host 进程内的受管 worktree 服务发送命令时设置的标记。只有带此标记的命令可以携带
 * createSession.cwd / worktreeCreation 与 forkAssistant.targetCwd；Symbol 键无法经 RPC 序列化伪造。
 */
export const HOST_WORKTREE_COMMAND: unique symbol = Symbol("zcode.hostWorktreeCommand");

export interface ZCodeAgentConversationCommandParams extends ZCodeAgentWorkspaceTarget {
  /** 仅 Host 消费；显式 NULL 表示全局任务，不向 CLI 发送项目概念。 */
  projectId?: string | null;
  envelope: CommandEnvelope;
  /** 只有 Host 进程内的受管 worktree 服务设置（见 HOST_WORKTREE_COMMAND）。 */
  [HOST_WORKTREE_COMMAND]?: true;
  /** 仅 host 内部用于 Browser Use runtime 边界，不进入 v4 wire envelope。 */
  clientMode?: ZCodeTaskClientMode;
}

export interface ZCodeAgentCommandsQueryParams extends ZCodeAgentWorkspaceTarget {
  clock?: true;
  commands: CommandKey[];
}

/** UI 不携带 connectionId；connection scope 以 trusted carrier 注入 wire identity。 */
export interface ZCodeAgentAttachmentBeginParams extends ZCodeAgentSessionTarget {
  uploadId: string;
  fileName: string;
  mime: string;
  totalBytes: number;
  totalChunks: number;
  checksum: string;
}

export type ZCodeAgentAttachmentBeginResult =
  | Omit<Extract<V4AttachmentBeginResult, { state: "staging" }>, "uploadId">
  | Omit<Extract<V4AttachmentBeginResult, { state: "committed" }>, "uploadId" | "nextChunkIndex">;

export interface ZCodeAgentAttachmentChunkParams extends ZCodeAgentSessionTarget {
  uploadId: string;
  chunkIndex: number;
  dataBase64: string;
}

export type ZCodeAgentAttachmentChunkResult = Omit<V4AttachmentChunkResult, "uploadId">;

export interface ZCodeAgentAttachmentTerminalParams extends ZCodeAgentSessionTarget {
  uploadId: string;
}

export interface ZCodeAgentAttachmentReadParams extends ZCodeAgentSessionTarget {
  ref: string;
  target?: ConversationRowTarget;
  attachmentIndex?: number;
  offset: number;
  limit: number;
}

export interface RecentChatSession extends Pick<
  ZCodeAgentSessionTarget,
  "sessionId" | "workspacePath" | "workspaceIdentity"
> {
  title: string;
}

export interface RecentChatDirectory {
  sessions: [RecentChatSession, ...RecentChatSession[]];
}

export interface IZCodeAgentService {
  /** 独立聊天连接中有历史的最近目录与会话，各取前五。 */
  listRecentChatSessions?(): Promise<RecentChatDirectory[]>;
  /** Composer Skill 引用 catalog；带 sessionId 时读取该 runtime 的冻结快照。 */
  getSkillReferenceCatalog(
    params: ZCodeAgentSkillReferenceCatalogParams,
  ): Promise<ZCodeSkillsReferenceCatalogResult>;
  /** 当前会话可用的斜杠命令；省略 sessionId 时只列首发支持的命令。 */
  getConversationCommandCatalog?(
    params: ZCodeAgentSkillReferenceCatalogParams,
  ): Promise<{ commands: ConversationCommandCatalogEntry[] }>;
  // ── v4 conversation 通道（竖切）──
  /** RPC attachment 建立后先读取 host 可信 hello。 */
  helloConversationV4(): Promise<HelloMessage>;
  /** hello 校验后回送 clientHello；metadata 不能覆盖 connection mode/profile。 */
  initializeConversationV4(clientHello: ClientHello): Promise<void>;
  subscribeConversationV4(
    params: ZCodeAgentConversationSubscribeParams,
  ): Promise<V4ConversationSubscribeResult>;
  resyncConversationV4(
    params: ZCodeAgentConversationResyncParams,
  ): Promise<V4ConversationResyncResult>;
  unsubscribeConversationV4(params: ZCodeAgentConversationUnsubscribeParams): Promise<void>;
  /** rows/range 行分页 query（loadOlder 游标向上补历史）。 */
  conversationRowsRangeV4(
    params: ZCodeAgentConversationRowsRangeParams,
  ): Promise<ZCodeAgentConversationRowsRangeResult>;
  sendConversationCommandV4(params: ZCodeAgentConversationCommandParams): Promise<CommandAck>;
  queryConversationCommandsV4(params: ZCodeAgentCommandsQueryParams): Promise<CommandsQueryResult>;
  attachmentBeginV4(
    params: ZCodeAgentAttachmentBeginParams,
  ): Promise<ZCodeAgentAttachmentBeginResult>;
  attachmentChunkV4(
    params: ZCodeAgentAttachmentChunkParams,
  ): Promise<ZCodeAgentAttachmentChunkResult>;
  attachmentCommitV4(params: ZCodeAgentAttachmentTerminalParams): Promise<V4AttachmentCommitResult>;
  attachmentAbortV4(params: ZCodeAgentAttachmentTerminalParams): Promise<void>;
  /** 已发送 image/video 只读分块查询；connection scope 注入可信 workspace 连接。 */
  attachmentReadV4(
    params: ZCodeAgentAttachmentReadParams,
  ): Promise<Omit<V4AttachmentReadResult, "nextOffset">>;
  /** workspace 级下行帧流（v4/conversation/frame），renderer 侧按 topic 自行路由。 */
  onDynamicConversationFrame(
    params: ZCodeAgentWorkspaceTarget,
  ): Event<ConversationTopicWireCandidate>;
}

const WEB_CONVERSATION_METHODS = [
  "helloConversationV4",
  "initializeConversationV4",
  "subscribeConversationV4",
  "resyncConversationV4",
  "unsubscribeConversationV4",
  "conversationRowsRangeV4",
  "sendConversationCommandV4",
  "queryConversationCommandsV4",
  "getConversationCommandCatalog",
] as const satisfies readonly (keyof IZCodeAgentService)[];

export const WEB_CHAT_AGENT_METHODS = [
  ...WEB_CONVERSATION_METHODS,
  "listRecentChatSessions",
] as const satisfies readonly (keyof IZCodeAgentService)[];

export const WEB_AIREQ_AGENT_METHODS = [
  ...WEB_CONVERSATION_METHODS,
  "getSkillReferenceCatalog",
  "attachmentBeginV4",
  "attachmentChunkV4",
  "attachmentCommitV4",
  "attachmentAbortV4",
  "attachmentReadV4",
] as const satisfies readonly (keyof IZCodeAgentService)[];

export const WEB_AIREQ_AGENT_EVENTS = [
  "onDynamicConversationFrame",
] as const satisfies readonly (keyof IZCodeAgentService)[];

type WebAgentService = Omit<
  IZCodeAgentService,
  | "helloConversationV4"
  | "initializeConversationV4"
  | "subscribeConversationV4"
  | "resyncConversationV4"
  | "unsubscribeConversationV4"
  | "conversationRowsRangeV4"
  | "sendConversationCommandV4"
  | "queryConversationCommandsV4"
  | "attachmentBeginV4"
  | "attachmentChunkV4"
  | "attachmentCommitV4"
  | "attachmentAbortV4"
  | "attachmentReadV4"
  | "getConversationCommandCatalog"
  | "getSkillReferenceCatalog"
  | "onDynamicConversationFrame"
> & {
  helloConversationV4(): Promise<WebHelloMessage>;
  initializeConversationV4(clientHello: WebClientHello): Promise<void>;
  subscribeConversationV4(
    params: Omit<
      ZCodeAgentConversationSubscribeParams,
      "remoteSessionId" | "visibility" | "retryInitialization"
    >,
  ): Promise<WebConversationSubscribeResult>;
  resyncConversationV4(
    params: Omit<ZCodeAgentConversationResyncParams, "remoteSessionId" | "runtimePolicy">,
  ): Promise<WebConversationResyncResult>;
  unsubscribeConversationV4(
    params: Omit<ZCodeAgentConversationUnsubscribeParams, "remoteSessionId" | "runtimePolicy">,
  ): Promise<void>;
  conversationRowsRangeV4(
    params: Omit<ZCodeAgentConversationRowsRangeParams, "remoteSessionId">,
  ): Promise<ZCodeAgentConversationRowsRangeResult>;
  sendConversationCommandV4(
    params: Omit<
      ZCodeAgentConversationCommandParams,
      "clientMode" | "remoteSessionId" | "projectId" | "envelope"
    > & { envelope: Omit<CommandEnvelope, "workspace" | "inputOrigin" | "ttft" | "baseLogEpoch"> },
  ): Promise<WebCommandAck>;
  queryConversationCommandsV4(
    params: Omit<ZCodeAgentCommandsQueryParams, "clock" | "remoteSessionId">,
  ): Promise<WebCommandsQueryResult>;
  attachmentBeginV4(
    params: Omit<ZCodeAgentAttachmentBeginParams, "remoteSessionId">,
  ): Promise<ZCodeAgentAttachmentBeginResult>;
  attachmentChunkV4(
    params: Omit<ZCodeAgentAttachmentChunkParams, "remoteSessionId">,
  ): Promise<ZCodeAgentAttachmentChunkResult>;
  attachmentCommitV4(
    params: Omit<ZCodeAgentAttachmentTerminalParams, "remoteSessionId">,
  ): Promise<V4AttachmentCommitResult>;
  attachmentAbortV4(
    params: Omit<ZCodeAgentAttachmentTerminalParams, "remoteSessionId">,
  ): Promise<void>;
  attachmentReadV4(
    params: Omit<ZCodeAgentAttachmentReadParams, "remoteSessionId">,
  ): Promise<Omit<V4AttachmentReadResult, "nextOffset">>;
  getConversationCommandCatalog(
    params: Omit<ZCodeAgentSkillReferenceCatalogParams, "remoteSessionId">,
  ): Promise<{ commands: ConversationCommandCatalogEntry[] }>;
  getSkillReferenceCatalog(
    params: Omit<ZCodeAgentSkillReferenceCatalogParams, "remoteSessionId">,
  ): Promise<Pick<ZCodeSkillsReferenceCatalogResult, "skills">>;
  onDynamicConversationFrame(
    params: Pick<ZCodeAgentWorkspaceTarget, "workspacePath" | "workspaceIdentity">,
  ): Event<ConversationTopicWireCandidate>;
};

export type WebAIReqAgent = Required<
  Pick<WebAgentService, (typeof WEB_AIREQ_AGENT_METHODS | typeof WEB_AIREQ_AGENT_EVENTS)[number]>
>;

export type WebChatAgent = Required<
  Pick<WebAgentService, (typeof WEB_CHAT_AGENT_METHODS | typeof WEB_AIREQ_AGENT_EVENTS)[number]>
>;

export const IZCodeAgentService = createServiceDescriptor<IZCodeAgentService>(
  ServiceChannels.ZCodeAgent,
);
