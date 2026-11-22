import { CircleAlert, Folder, MessageSquare, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecentChatDirectory, ZCodeAgentSessionTarget } from "@zcode/client/agent";
import type { ModelSelection } from "@zcode/shared/model-selection";
import { createUuid } from "@zcode/shared/uuid";
import { commandAckSchema, type CommandEnvelope } from "@zcode/shared/zcode-protocol-v4";
import {
  ConversationTimeline,
  ConversationStatusPanel,
  ConversationDraftEmptyState,
  DEFAULT_CODE_PREVIEW_SETTINGS,
  type ConversationRowRenderContext,
} from "@zcode/ui/web-chat-view";
import { ChatComposer, type ChatDraft, type UpdateChatDraft } from "./ChatComposer.js";
import { ChatModelPicker } from "./ChatModelPicker.js";
import { useAgentConnection, type AgentConnection } from "./useAgentConnection.js";
import { useConversation } from "./useConversation.js";

const connectionLabels = {
  connecting: "正在连接",
  connected: "已连接",
  reconnecting: "正在重新连接",
  offline: "连接暂不可用",
};

const emptyDraft: ChatDraft = { text: "", sending: false, error: "" };

function useRecentSessions(connection: AgentConnection | null) {
  const [list, setList] = useState<RecentChatDirectory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [version, refresh] = useState(0);
  const invalidate = useCallback(() => refresh((previous) => previous + 1), []);
  useEffect(() => {
    if (!connection) return;
    let active = true;
    void connection.agent
      .listRecentChatSessions()
      .then((result) => {
        if (!active) return;
        setList(result);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [connection, version]);
  useEffect(() => {
    window.addEventListener("focus", invalidate);
    return () => window.removeEventListener("focus", invalidate);
  }, [invalidate]);
  return { list, status, invalidate };
}

function ChatPane({
  target,
  directory,
  setDirectory,
  draft,
  updateDraft,
  draftModel,
  setDraftModel,
  connection,
  onCreated,
  onActivity,
}: {
  target: ZCodeAgentSessionTarget | null;
  directory: string;
  setDirectory: (path: string) => void;
  draft: ChatDraft;
  updateDraft: UpdateChatDraft;
  draftModel: ModelSelection | null;
  setDraftModel: (selection: ModelSelection) => void;
  connection: AgentConnection | null;
  onCreated: (session: ZCodeAgentSessionTarget) => void;
  onActivity: () => void;
}) {
  const conversation = useConversation(connection, target);
  const { phase, error: historyError } = conversation;
  const workspacePath = target?.workspacePath ?? directory;
  const workspaceIdentity = target?.workspaceIdentity;
  const sessionId = target?.sessionId;
  const { logEpoch } = conversation;
  const rowContext = useMemo<ConversationRowRenderContext>(
    () => ({
      workspacePath,
      workspaceIdentity,
      sessionId,
      logEpoch,
      theme: "zai-dark",
      codePreviewSettings: DEFAULT_CODE_PREVIEW_SETTINGS,
      messageStreamShowTodos: true,
      messageStreamShowReasoning: true,
    }),
    [workspacePath, workspaceIdentity, sessionId, logEpoch],
  );
  const [error, setError] = useState("");
  const [switchingModel, setSwitchingModel] = useState(false);
  const selectedModel = target
    ? (conversation.modelSelection ?? null)
    : (draftModel ?? connection?.modelCatalog.effectiveSelection ?? null);
  const busy = phase === "running" || phase === "prewarming";
  useEffect(() => {
    if (phase === "completedSuccess" || phase === "completedInterrupted") onActivity();
  }, [phase, onActivity]);

  async function submitCommand(
    type: CommandEnvelope["type"],
    payload: unknown,
    baseRevision?: number,
  ) {
    if (!connection) throw new Error("Agent 连接不可用。");
    const workspace = target
      ? { workspacePath: target.workspacePath, workspaceIdentity: target.workspaceIdentity }
      : { workspacePath: directory.trim() };
    const envelope: CommandEnvelope = {
      workspace: {
        ...workspace,
        workspaceKey: workspace.workspaceIdentity ?? workspace.workspacePath,
      },
      commandId: createUuid(),
      clientId: connection.clientId,
      issuedAt: Date.now(),
      sessionId: target?.sessionId ?? null,
      type,
      payload,
      ...(baseRevision === undefined ? {} : { baseRevision }),
    };
    const ack = commandAckSchema.parse(
      await connection.agent.sendConversationCommandV4({ ...workspace, envelope }),
    );
    return { ack, workspace };
  }

  async function selectModel(next: ModelSelection) {
    if (!target) {
      setDraftModel(next);
      return;
    }
    if (
      !connection ||
      !conversation.ready ||
      conversation.revision === undefined ||
      switchingModel ||
      busy
    )
      return;
    setError("");
    setSwitchingModel(true);
    try {
      const { ack } = await submitCommand(
        "switchModelConfig",
        {
          provider: next.providerId,
          model: next.modelId,
          thought: next.options?.reasoningLevel ?? "",
        },
        conversation.revision,
      );
      if (ack.status !== "accepted" && ack.status !== "duplicate") {
        setError(ack.message ?? "会话状态已变化，请重试切换模型。");
      }
    } catch {
      setError("暂时无法确认模型切换结果，请核对当前模型。");
    } finally {
      setSwitchingModel(false);
    }
  }

  async function send(text: string): Promise<boolean> {
    if (!connection || switchingModel || (target ? !conversation.ready : !selectedModel))
      return false;
    updateDraft((current) => ({ ...current, error: "" }));
    try {
      const { ack, workspace } = await (target
        ? submitCommand("sendText", { text })
        : submitCommand("createSession", {
            workspaceId: directory.trim(),
            config: { modelSelection: selectedModel },
            firstInput: { text },
          }));
      if (ack.status !== "accepted" && ack.status !== "duplicate") {
        updateDraft((current) => ({ ...current, error: ack.message ?? "消息未发送，请重试。" }));
        return false;
      }
      if (!target && ack.result?.type === "createSession") {
        onCreated({ ...workspace, sessionId: ack.result.sessionId });
      }
      onActivity();
      return true;
    } catch (cause) {
      const invalidDirectory =
        cause instanceof Error && "code" in cause && cause.code === "fault.chat.invalidDirectory";
      updateDraft((current) => ({
        ...current,
        error: invalidDirectory
          ? cause.message
          : "暂时无法确认发送结果。消息草稿已保留，请先核对会话历史。",
      }));
      onActivity();
      return false;
    }
  }

  return (
    <main className="chat-main">
      <header className="conversation-header">
        <div className="conversation-title" title={conversation.title}>
          {target ? conversation.title || "会话" : "新会话"}
        </div>
        {target && (
          <div className="workspace-chip" title={target.workspacePath}>
            <Folder size={15} aria-hidden="true" />
            <span>{target.workspacePath}</span>
          </div>
        )}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col @container/conversation">
        {target && conversation.plan && (
          <ConversationStatusPanel
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            plan={conversation.plan}
            layoutMode="auto"
          />
        )}
        <ConversationTimeline
          rows={conversation.rows}
          totalCount={conversation.totalCount}
          sessionKey={sessionId ?? "draft"}
          sessionPhase={phase}
          rowContext={rowContext}
          canLoadOlder={conversation.ready && conversation.hasOlder}
          loadingOlder={conversation.loadingOlder}
          onLoadOlder={conversation.loadOlder}
          summaryPanelLayout={conversation.plan ? "auto" : "none"}
          centerEmptyStateWithDock={!target}
          emptyState={target ? undefined : <ConversationDraftEmptyState />}
          bottomDock={
            <>
              {(draft.error || error || historyError) && (
                <div role="alert" className="request-error">
                  <CircleAlert size={16} aria-hidden="true" />
                  <span>{draft.error || error || historyError}</span>
                  {historyError && (
                    <button type="button" onClick={conversation.reload}>
                      重新加载历史
                    </button>
                  )}
                </div>
              )}
              <ChatComposer
                directory={target ? undefined : directory}
                workspacePath={workspacePath}
                workspaceIdentity={workspaceIdentity}
                sessionId={sessionId}
                setDirectory={setDirectory}
                draft={draft}
                updateDraft={updateDraft}
                send={send}
                disabled={
                  !connection || switchingModel || (target ? !conversation.ready : !selectedModel)
                }
                modelPicker={
                  connection && (
                    <ChatModelPicker
                      catalog={connection.modelCatalog}
                      selection={selectedModel}
                      pending={switchingModel}
                      disabled={busy || Boolean(target && !conversation.ready)}
                      onSelect={(next) => void selectModel(next)}
                    />
                  )
                }
              />
            </>
          }
        />
      </div>
    </main>
  );
}

export function ChatApp() {
  const { connection, status, reconnect } = useAgentConnection();
  const recent = useRecentSessions(connection);
  const [selected, setSelected] = useState<ZCodeAgentSessionTarget | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>({});
  const [draftModel, setDraftModel] = useState<ModelSelection | null>(null);
  const [directory, setDirectory] = useState(".");
  const draftKey = selected?.sessionId ?? "";
  const updateDraft = useCallback<UpdateChatDraft>(
    (update) =>
      setDrafts((current) => {
        const previous = current[draftKey] ?? emptyDraft;
        const next = update(previous);
        return next === previous ? current : { ...current, [draftKey]: next };
      }),
    [draftKey],
  );
  const onActivity = recent.invalidate;

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar" aria-label="会话侧栏">
        <div className="sidebar-top">
          <div className="app-name">
            <MessageSquare size={18} strokeWidth={1.8} aria-hidden="true" />
            Agent 聊天
          </div>
          <button
            className="new-chat"
            type="button"
            onClick={() => {
              if (selected && !drafts[""]?.text && !drafts[""]?.sending) {
                setDirectory(selected.workspacePath);
              }
              setSelected(null);
            }}
          >
            <Plus size={17} aria-hidden="true" />
            新建会话
          </button>
        </div>
        <nav className="recent-sessions" aria-label="最近会话">
          <h2>最近会话</h2>
          {recent.status === "error" && (
            <p className="sidebar-notice">
              无法读取最近会话。
              <button type="button" onClick={onActivity}>
                重试
              </button>
            </p>
          )}
          {recent.status === "loading" && status !== "offline" && (
            <p className="sidebar-notice">正在读取会话…</p>
          )}
          {recent.status === "ready" && recent.list.length === 0 && (
            <p className="sidebar-notice">发送消息后，会话会显示在这里。</p>
          )}
          {recent.list.map((group) => (
            <section className="directory-group" key={group.workspacePath}>
              <h3 title={group.workspacePath}>
                <Folder size={15} aria-hidden="true" />
                <span>{group.workspacePath}</span>
              </h3>
              <ul>
                {group.sessions.map((session) => (
                  <li key={session.sessionId}>
                    <button
                      type="button"
                      title={session.title}
                      aria-current={session.sessionId === selected?.sessionId ? "true" : undefined}
                      onClick={() =>
                        setSelected((previous) =>
                          previous?.sessionId === session.sessionId ? previous : session,
                        )
                      }
                    >
                      <MessageSquare size={14} aria-hidden="true" />
                      <span>{session.title || "会话"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="connection-status" role="status">
          <span className={`status-dot ${status}`} aria-hidden="true" />
          {connectionLabels[status]}
          {status === "offline" && (
            <button type="button" onClick={reconnect}>
              重试
            </button>
          )}
        </div>
      </aside>
      <ChatPane
        key={draftKey}
        target={selected}
        directory={directory}
        setDirectory={setDirectory}
        draft={drafts[draftKey] ?? emptyDraft}
        updateDraft={updateDraft}
        draftModel={draftModel}
        setDraftModel={setDraftModel}
        connection={connection}
        onActivity={onActivity}
        onCreated={(session) => {
          setDraftModel(null);
          setSelected((current) => current ?? session);
        }}
      />
    </div>
  );
}
