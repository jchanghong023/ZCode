import { ChevronLeft, CircleAlert, Folder, List, MessageSquare, Plus, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RecentChatDirectory } from "@zcode/client/agent";
import type { ModelSelection } from "@zcode/shared/model-selection";
import {
  conversationCommandCatalogEntrySchema,
  type ConversationCommandCatalogEntry,
} from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@zcode/ui/button";
import {
  ConversationTimeline,
  ConversationStatusPanel,
  ConversationDraftEmptyState,
  DEFAULT_CODE_PREVIEW_SETTINGS,
  type ConversationRowRenderContext,
} from "@zcode/ui/web-chat-view";
import { ChatComposer } from "./ChatComposer.js";
import { ChatModelPicker } from "./ChatModelPicker.js";
import { useAgentConnection, type AgentConnection } from "./useAgentConnection.js";
import { conversationCommand, submitConversationCommand, useChatInput } from "./useChatInput.js";
import { useConversation } from "./useConversation.js";
import { useChatViewport } from "./useChatViewport.js";

const connectionLabels = {
  connecting: "正在连接",
  connected: "已连接",
  reconnecting: "正在重新连接",
  offline: "连接暂不可用",
};

const emptyCommands: readonly ConversationCommandCatalogEntry[] = [];
const commandCatalogSchema = conversationCommandCatalogEntrySchema.array();

function useCommandCatalog(
  connection: AgentConnection | null,
  workspacePath: string,
  workspaceIdentity: string | undefined,
  sessionId: string | undefined,
) {
  const [catalog, setCatalog] = useState<{
    connection: AgentConnection;
    scope: string;
    commands: readonly ConversationCommandCatalogEntry[];
  }>();
  const scope = JSON.stringify([workspacePath, workspaceIdentity, sessionId]);
  useEffect(() => {
    if (!connection || !workspacePath) return;
    let active = true;
    void connection.agent
      .getConversationCommandCatalog({ workspacePath, workspaceIdentity, sessionId })
      .then(({ commands }) => {
        if (active) {
          setCatalog({ connection, scope, commands: commandCatalogSchema.parse(commands) });
        }
      })
      .catch(() => {
        if (active) setCatalog(undefined);
      });
    return () => {
      active = false;
    };
  }, [connection, scope, workspacePath, workspaceIdentity, sessionId]);
  return catalog?.connection === connection && catalog.scope === scope
    ? catalog.commands
    : emptyCommands;
}

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
  input,
  connection,
  onActivity,
  compact,
  mobileNavigation,
}: {
  input: ReturnType<typeof useChatInput>;
  connection: AgentConnection | null;
  onActivity: () => void;
  compact: boolean;
  mobileNavigation: ReactNode;
}) {
  const { target, directory, draft, draftModel, setDraftModel } = input;
  const conversation = useConversation(connection, target);
  const { phase, error: historyError } = conversation;
  const workspacePath = target?.workspacePath ?? directory.trim();
  const workspaceIdentity = target?.workspaceIdentity;
  const sessionId = target?.sessionId;
  const commands = useCommandCatalog(connection, workspacePath, workspaceIdentity, sessionId);
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
  const [stopping, setStopping] = useState(false);
  const selectedModel = target
    ? (conversation.modelSelection ?? null)
    : (draftModel ?? connection?.modelCatalog.effectiveSelection ?? null);
  const busy = phase === "running" || phase === "prewarming";
  const routing = target ? conversation.inputRouting?.mode : "startNow";
  const canRouteInput = routing === "startNow" || routing === "streamingChoice";
  const stopTarget =
    conversation.control?.canStop && conversation.control.stopState === "stoppable"
      ? conversation.control.activeWorks.find((work) => work.foregroundExecutionId)
          ?.foregroundExecutionId
      : undefined;
  const canSwitchModel = conversation.ready && conversation.availability?.switchModelConfig.allowed;
  useEffect(() => {
    if (phase === "completedSuccess" || phase === "completedInterrupted") onActivity();
  }, [phase, onActivity]);

  async function stop() {
    if (!connection || !target || !stopTarget || stopping) return;
    setError("");
    setStopping(true);
    try {
      const request = conversationCommand(
        connection,
        { workspacePath, workspaceIdentity },
        target.sessionId,
        "stop",
        { expectedForegroundExecutionId: stopTarget },
      );
      const ack = await submitConversationCommand(connection, request);
      if (ack.status !== "accepted" && ack.status !== "duplicate") {
        setError(ack.message ?? "无法停止当前任务，请核对任务状态。");
      }
    } catch {
      setError("暂时无法确认停止结果，请核对任务状态。");
    } finally {
      setStopping(false);
    }
  }

  async function selectModel(next: ModelSelection) {
    if (!target) {
      setDraftModel(next);
      return;
    }
    if (
      !connection ||
      !canSwitchModel ||
      conversation.revision === undefined ||
      switchingModel ||
      Boolean(draft.receipt) ||
      busy
    )
      return;
    setError("");
    setSwitchingModel(true);
    try {
      const request = conversationCommand(
        connection,
        { workspacePath, workspaceIdentity },
        target.sessionId,
        "switchModelConfig",
        {
          provider: next.providerId,
          model: next.modelId,
          thought: next.options?.reasoningLevel ?? "",
        },
        conversation.revision,
      );
      const ack = await submitConversationCommand(connection, request);
      if (ack.status !== "accepted" && ack.status !== "duplicate") {
        setError(ack.message ?? "会话状态已变化，请重试切换模型。");
      }
    } catch {
      setError("暂时无法确认模型切换结果，请核对当前模型。");
    } finally {
      setSwitchingModel(false);
    }
  }

  function send(text: string) {
    if (!canRouteInput || switchingModel || (target && !conversation.ready)) return;
    // 执行中的普通发送直接引导当前回合，发送键与 Enter 共用这条路径。
    void input.send(text, selectedModel, routing === "streamingChoice" ? "steer" : undefined);
  }

  return (
    <main className="chat-main" id="chat-main">
      <header className="conversation-header">
        {mobileNavigation}
        <h1 className="conversation-title" title={conversation.title}>
          {target ? conversation.title || "会话" : "新会话"}
        </h1>
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
          centerEmptyStateWithDock={!target && !compact}
          emptyState={
            target ? undefined : (
              <div className="chat-draft-empty">
                <ConversationDraftEmptyState compactForRemoteControl={compact} />
              </div>
            )
          }
          bottomDock={
            <>
              <div className="composer-notices">
                {conversation.queue && conversation.queue.items.length > 0 && (
                  <div className="chat-dock-notice">
                    <strong>待交付消息</strong>
                    <ul className="queued-inputs" aria-label="待交付消息">
                      {conversation.queue.items.map((item) => (
                        <li key={item.queueItemId}>{item.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {draft.localResult && (
                  <div className="chat-dock-notice" role="status">
                    <strong>/{draft.localResult.name}</strong>
                    <div className="local-command-output">{draft.localResult.output}</div>
                  </div>
                )}
                {draft.receipt && (
                  <div className="chat-dock-notice receipt-status" role="status">
                    <span>
                      {draft.receipt === "sending"
                        ? "正在发送…"
                        : draft.receipt === "checking"
                          ? "正在核对发送回执…"
                          : "发送结果待确认，已保留草稿。"}
                    </span>
                    {draft.receipt === "unknown" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!connection}
                        onClick={input.checkReceipt}
                      >
                        核对发送回执
                      </Button>
                    )}
                  </div>
                )}
                {conversation.control?.lastError && (
                  <div role="alert" className="request-error">
                    <CircleAlert size={16} aria-hidden="true" />
                    <span>{conversation.control.lastError.message}</span>
                  </div>
                )}
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
              </div>
              <ChatComposer
                directory={target ? undefined : directory}
                workspacePath={workspacePath}
                workspaceIdentity={workspaceIdentity}
                sessionId={sessionId}
                setDirectory={input.setDirectory}
                draft={draft}
                setText={input.setText}
                send={send}
                conversationCommands={commands}
                stopButton={
                  stopTarget && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="停止当前任务"
                      disabled={stopping}
                      onClick={() => void stop()}
                    >
                      <Square size={15} aria-hidden="true" />
                    </Button>
                  )
                }
                disabled={
                  !canRouteInput ||
                  !connection ||
                  switchingModel ||
                  (target ? !conversation.ready : !selectedModel)
                }
                modelPicker={
                  connection && (
                    <ChatModelPicker
                      catalog={connection.modelCatalog}
                      selection={selectedModel}
                      pending={switchingModel}
                      disabled={
                        busy || Boolean(draft.receipt) || Boolean(target && !canSwitchModel)
                      }
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
  const input = useChatInput(connection, recent.invalidate);
  const { target: selected } = input;
  const onActivity = recent.invalidate;
  const { compact, shellRef } = useChatViewport();
  const [showSessions, setShowSessions] = useState(false);
  const openSessionsButton = useRef<HTMLButtonElement>(null);
  const closeSessionsButton = useRef<HTMLButtonElement>(null);
  const sessionsWereVisible = useRef(false);

  useLayoutEffect(() => {
    if (compact && showSessions) {
      closeSessionsButton.current?.focus();
    } else if (compact && sessionsWereVisible.current) {
      openSessionsButton.current?.focus();
    }
    sessionsWereVisible.current = compact && showSessions;
  }, [compact, showSessions]);

  return (
    <div
      ref={shellRef}
      className="chat-shell"
      data-mobile-view={showSessions ? "sessions" : "chat"}
    >
      <aside
        className="chat-sidebar"
        id="chat-sessions"
        aria-label="会话列表"
        onKeyDown={(event) => {
          if (!compact || event.key !== "Escape") return;
          setShowSessions(false);
        }}
      >
        <div className="sidebar-top">
          <div className="app-name">
            <MessageSquare
              className="desktop-app-icon"
              size={18}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <Button
              ref={closeSessionsButton}
              className="mobile-nav-button"
              type="button"
              variant="ghost"
              size="icon"
              aria-label="返回聊天"
              onClick={() => setShowSessions(false)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Button>
            Agent 聊天
          </div>
          <button
            className="new-chat"
            type="button"
            onClick={() => {
              input.select(null);
              setShowSessions(false);
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
          {recent.list.map(({ sessions }) => {
            const { workspacePath } = sessions[0];
            return (
              <section className="directory-group" key={workspacePath}>
                <h3 title={workspacePath}>
                  <Folder size={15} aria-hidden="true" />
                  <span>{workspacePath}</span>
                </h3>
                <ul>
                  {sessions.map((session) => (
                    <li key={session.sessionId}>
                      <button
                        type="button"
                        title={session.title}
                        aria-current={
                          session.sessionId === selected?.sessionId ? "true" : undefined
                        }
                        onClick={() => {
                          input.select(session);
                          setShowSessions(false);
                        }}
                      >
                        <MessageSquare size={14} aria-hidden="true" />
                        <span>{session.title || "会话"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
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
        key={input.draftKey}
        input={input}
        connection={connection}
        onActivity={onActivity}
        compact={compact}
        mobileNavigation={
          <div className="mobile-chat-navigation">
            <Button
              ref={openSessionsButton}
              className="mobile-nav-button"
              type="button"
              variant="ghost"
              size="icon"
              aria-label="打开会话列表"
              aria-controls="chat-sessions"
              aria-expanded={showSessions}
              onClick={() => setShowSessions(true)}
            >
              <List size={20} aria-hidden="true" />
            </Button>
            <span role="status" className="mobile-connection-status">
              {status !== "connected" && connectionLabels[status]}
            </span>
          </div>
        }
      />
    </div>
  );
}
