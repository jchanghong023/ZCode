import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationRow } from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@/components/ui/button.js";
import { useZCodeAgentService } from "@/hooks/useZCodeAgentService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";
import { useZCodeStoreWithDefault } from "@/store/StoreProvider.js";
import { createAgentConversationTransport } from "@/v4/agentConversationTransport.js";
import { ensureAgentV4ConnectionHandshake } from "@/v4/agentV4ConnectionHandshake.js";
import { ConversationTimeline } from "@/v4/ConversationTimeline.js";
import type { ConversationRowRenderContext } from "@/v4/conversationRowContext.js";
import { useAIReq } from "../../AIReqContext.js";
import { useAIReqDataSource } from "../../data-source.js";
import type { AIReqNativeSessionRef, AIReqReview } from "../../contract.js";
import { AIReqMarkdownDocument } from "../../proposals/AIReqMarkdownDocument.js";

type HistoryRead = {
  sessionId: string;
  scopeKey: string;
  status: "loading" | "ready" | "unavailable";
  reason?: "reference" | "missing" | "empty" | "error";
  message?: string;
  rows?: ConversationRow[];
  atLogEpoch?: string;
  atRevision?: number;
  hasMore?: boolean;
  loadingOlder?: boolean;
  olderError?: "changed" | "missing" | "error";
};

function historyErrorReason(cause: unknown): "missing" | "reference" | "error" {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (message.includes("proto.sessionNotResident")) return "missing";
  if (message.includes("fault.command.sessionNotFound")) return "reference";
  return "error";
}

function unavailableMessage(read: HistoryRead, zh: boolean): string {
  if (read.message) return read.message;
  if (read.reason === "reference")
    return zh
      ? "该会话当前不可读取，请刷新后重试。"
      : "This conversation is unavailable. Refresh and try again.";
  if (read.reason === "missing")
    return zh
      ? "该历史会话暂不可读取，请稍后重试。"
      : "This historical conversation is currently unavailable. Try again later.";
  if (read.reason === "empty")
    return zh
      ? "该会话没有已记录的消息；已保存评审报告可在上方查看。"
      : "This conversation has no recorded messages. Saved review reports are available above.";
  if (read.reason === "error")
    return zh ? "历史会话读取失败。" : "Failed to load the historical conversation.";
  return zh
    ? "会话归属已变化，请重新选择。"
    : "The conversation no longer belongs to this requirement. Select it again.";
}

function sessionLabel(session: AIReqNativeSessionRef, zh: boolean, reviewerName?: string): string {
  const phase =
    session.role === "reviewer"
      ? (reviewerName ?? (zh ? "评审会话" : "Review conversation"))
      : session.phase === "solution"
        ? zh
          ? "方案讨论"
          : "Solution discussion"
        : zh
          ? "业务需求讨论"
          : "Requirement discussion";
  return zh ? `${phase} · 第 ${session.round} 轮` : `${phase} · Round ${session.round}`;
}

function ReviewHistory({
  title,
  reviews,
  zh,
}: {
  title: string;
  reviews: AIReqReview[];
  zh: boolean;
}) {
  if (!reviews.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {reviews.map((review) => (
        <details key={review.id} className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer">
            {zh ? `第 ${review.round ?? 1} 轮` : `Round ${review.round ?? 1}`} ·{" "}
            {review.passed ? (zh ? "已通过" : "Passed") : zh ? "未通过" : "Not passed"}
          </summary>
          <div className="mt-3 space-y-3 break-words">
            {review.invalidatedReason && (
              <p>
                {zh ? "历史状态：" : "Historical status: "}
                {review.invalidatedReason}
              </p>
            )}
            {review.report && <AIReqMarkdownDocument>{review.report}</AIReqMarkdownDocument>}
            {review.agents?.map((agent) => (
              <details key={agent.id}>
                <summary className="cursor-pointer">
                  {agent.name} ·{" "}
                  {agent.status === "completed"
                    ? zh
                      ? "已完成"
                      : "Completed"
                    : agent.status === "failed"
                      ? zh
                        ? "失败"
                        : "Failed"
                      : agent.status === "running"
                        ? zh
                          ? "运行中"
                          : "Running"
                        : zh
                          ? "等待"
                          : "Waiting"}
                </summary>
                {agent.report ? (
                  <AIReqMarkdownDocument>{agent.report}</AIReqMarkdownDocument>
                ) : (
                  <p>{zh ? "该评审没有已保存的报告。" : "No report was saved for this review."}</p>
                )}
              </details>
            ))}
            {review.humanDecision && (
              <p>
                {zh ? "人工决定：" : "Human decision: "}
                {review.humanDecision.employeeId}
              </p>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}

/** 已转正 IR 的历史只观察已有业务会话，不恢复提案写入入口。 */
export function AIReqFormalHistory() {
  const aireq = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const source = useAIReqDataSource();
  const workspace = source.resolveWorkspace(aireq.view, aireq.selection);
  const workspacePath = workspace.path ?? "";
  const scopeKey = JSON.stringify([workspacePath, workspace.identity ?? null]);
  const service = useZCodeAgentService(workspacePath || undefined, null, workspace.identity);
  const theme = useZCodeStoreWithDefault((state) => state.theme, "system");
  const codePreviewSettings = useZCodeStoreWithDefault(
    (state) => state.codePreviewSettings,
    DEFAULT_CODE_PREVIEW_SETTINGS,
  );
  const [historyRead, setRead] = useState<HistoryRead>();
  // 工作区身份变化时，旧异步请求和旧行都不能出现在新身份上下文。
  const read = historyRead?.scopeKey === scopeKey ? historyRead : undefined;
  const request = useRef(0);
  const olderFlight = useRef(false);
  const transport = useMemo(
    () =>
      createAgentConversationTransport(service, {
        workspacePath,
        workspaceIdentity: workspace.identity,
      }),
    [service, workspacePath, workspace.identity],
  );
  const rowContext = useMemo<ConversationRowRenderContext>(
    () => ({
      workspacePath,
      workspaceIdentity: workspace.identity,
      sessionId: read?.sessionId,
      logEpoch: read?.atLogEpoch,
      theme,
      codePreviewSettings,
      readAttachment: transport.attachmentRead,
      readAttachmentRange: transport.attachmentReadRange,
    }),
    [
      workspacePath,
      workspace.identity,
      read?.sessionId,
      read?.atLogEpoch,
      theme,
      codePreviewSettings,
      transport,
    ],
  );
  useEffect(
    () => () => {
      request.current += 1;
    },
    [workspacePath, workspace.identity],
  );
  const group = aireq.view?.groups.find(
    (item) => item.projectId === aireq.selection.projectId && item.id === aireq.selection.irId,
  );
  if (!group || !aireq.view)
    return (
      <p role="status" className="p-4">
        {zh ? "所选正式需求不可用。" : "The selected requirement is unavailable."}
      </p>
    );
  const view = aireq.view;
  const sessions = group.sessions.filter(
    (session) =>
      session.projectId === group.projectId &&
      session.irId === group.id &&
      !session.srId &&
      (session.role === "requirements" ||
        session.role === "solution" ||
        session.role === "reviewer"),
  );
  const originals = [
    ...(group.originalReviewHistory ?? []),
    ...(group.originalReview ? [group.originalReview] : []),
  ];
  const fullReviews = [...(group.reviewHistory ?? []), ...(group.review ? [group.review] : [])];
  const reviewerNames = new Map(
    [...originals, ...fullReviews].flatMap((review) =>
      (review.agents ?? []).map((agent) => [agent.session.sessionId, agent.name] as const),
    ),
  );
  const isCanonical = (session: AIReqNativeSessionRef) =>
    view.sessions.some(
      (item) =>
        item.sessionId === session.sessionId &&
        item.projectId === group.projectId &&
        item.irId === group.id &&
        !item.srId,
    );
  const selected = sessions.find((session) => session.sessionId === read?.sessionId);
  const openSession = async (session: AIReqNativeSessionRef) => {
    const revision = ++request.current;
    olderFlight.current = false;
    if (!isCanonical(session) || !workspacePath) {
      setRead({
        sessionId: session.sessionId,
        scopeKey,
        status: "unavailable",
        reason: "reference",
        message: workspace.error,
      });
      return;
    }
    setRead({ sessionId: session.sessionId, scopeKey, status: "loading" });
    try {
      // 修复：检查生命周期后订阅仍有删除竞态，订阅会补建会话或写入评审报告；只读改为驻留行分页。
      // 此只读分页不经过普通 transport，仍须先完成该连接的 V4 握手。
      await ensureAgentV4ConnectionHandshake(service);
      if (revision !== request.current) return;
      const history = await service.conversationRowsRangeV4({
        workspacePath,
        workspaceIdentity: workspace.identity,
        sessionId: session.sessionId,
        limit: 50,
        residency: "resident-only",
      });
      if (revision !== request.current) return;
      setRead(
        history.rows.length
          ? {
              sessionId: session.sessionId,
              scopeKey,
              status: "ready",
              rows: history.rows,
              hasMore: history.hasMore,
              atLogEpoch: history.atLogEpoch,
              atRevision: history.atRevision,
            }
          : {
              sessionId: session.sessionId,
              scopeKey,
              status: "unavailable",
              reason: "empty",
            },
      );
    } catch (cause) {
      if (revision === request.current)
        setRead({
          sessionId: session.sessionId,
          scopeKey,
          status: "unavailable",
          reason: historyErrorReason(cause),
        });
    }
  };
  const loadOlder = async () => {
    if (!read?.rows?.length || !read.hasMore || olderFlight.current) return;
    const revision = request.current;
    const beforeRowId = read.rows[0]!.rowId;
    olderFlight.current = true;
    setRead(
      (current) =>
        current && {
          ...current,
          loadingOlder: true,
          olderError: undefined,
        },
    );
    try {
      await ensureAgentV4ConnectionHandshake(service);
      if (revision !== request.current) return;
      const history = await service.conversationRowsRangeV4({
        workspacePath,
        workspaceIdentity: workspace.identity,
        sessionId: read.sessionId,
        beforeRowId,
        limit: 50,
        residency: "resident-only",
      });
      if (revision !== request.current) return;
      // 修复：分页期间会话可能改变或被删除；不同版本的历史不能拼接成伪造的完整记录。
      if (
        history.atLogEpoch !== read.atLogEpoch ||
        history.atRevision !== read.atRevision ||
        (history.rows.length > 0 && history.rows[history.rows.length - 1]!.rowId >= beforeRowId) ||
        (history.rows.length === 0 && history.hasMore)
      ) {
        setRead((current) => current && { ...current, loadingOlder: false, olderError: "changed" });
        return;
      }
      setRead(
        (current) =>
          current && {
            ...current,
            rows: [...history.rows, ...(current.rows ?? [])],
            hasMore: history.hasMore,
            loadingOlder: false,
          },
      );
    } catch (cause) {
      if (revision === request.current)
        setRead(
          (current) =>
            current && {
              ...current,
              loadingOlder: false,
              olderError: historyErrorReason(cause) === "missing" ? "missing" : "error",
            },
        );
    } finally {
      if (revision === request.current) olderFlight.current = false;
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="aireq-formal-history">
      <div
        className={`${read ? "max-h-[45%]" : "flex-1"} min-h-0 space-y-4 overflow-y-auto p-4 text-ui-base`}
      >
        <div className="space-y-1">
          <h2 className="font-medium">{zh ? "讨论与评审历史" : "Discussion and review history"}</h2>
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "历史内容只读；正式需求的进度与材料仍在原页签查看。"
              : "History is read-only. Progress and materials remain in their respective tabs."}
          </p>
        </div>
        {sessions.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-medium">{zh ? "历史会话" : "Historical conversations"}</h3>
            <div className="flex flex-wrap gap-2">
              {sessions.map((session) => (
                <Button
                  key={session.sessionId}
                  variant="outline"
                  size="sm"
                  aria-pressed={read?.sessionId === session.sessionId}
                  onClick={() => void openSession(session)}
                >
                  {sessionLabel(session, zh, reviewerNames.get(session.sessionId))}
                </Button>
              ))}
            </div>
          </section>
        )}
        <ReviewHistory
          title={zh ? "原始需求评审" : "Original requirement review"}
          reviews={originals}
          zh={zh}
        />
        <ReviewHistory
          title={zh ? "完整材料评审" : "Full materials review"}
          reviews={fullReviews}
          zh={zh}
        />
        {!sessions.length && !originals.length && !fullReviews.length && (
          <p role="status">
            {zh
              ? "该需求没有已记录的讨论或评审历史。"
              : "This requirement has no recorded discussion or review history."}
          </p>
        )}
      </div>
      {read && (
        // 修复：原生消息列的命名容器查询会落到全工作区，导致窄侧栏被错误缩成单字列。
        <div className="@container/conversation flex min-h-0 flex-1 flex-col border-t border-border">
          {read.status === "loading" ? (
            <p role="status" className="p-4">
              {zh ? "正在读取历史会话…" : "Loading historical conversation…"}
            </p>
          ) : read.status === "unavailable" || !selected || !isCanonical(selected) ? (
            <p role="status" className="p-4">
              {unavailableMessage(read, zh)}
            </p>
          ) : (
            <>
              {(read.hasMore || read.olderError) && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-ui-sm">
                  {read.olderError && (
                    <p role="status" className="text-foreground-subtle">
                      {read.olderError === "changed"
                        ? zh
                          ? "历史内容已变化，请重新读取。"
                          : "History has changed. Reload to continue."
                        : read.olderError === "missing"
                          ? zh
                            ? "更早的历史消息暂不可读取，请稍后重试。"
                            : "Earlier messages are currently unavailable. Try again later."
                          : zh
                            ? "更早消息读取失败。"
                            : "Failed to load earlier messages."}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={read.loadingOlder}
                    onClick={() =>
                      void (read.olderError === "changed" || read.olderError === "missing"
                        ? openSession(selected)
                        : loadOlder())
                    }
                  >
                    {read.loadingOlder
                      ? zh
                        ? "正在读取…"
                        : "Loading…"
                      : read.olderError === "changed" || read.olderError === "missing"
                        ? zh
                          ? "重新读取"
                          : "Reload"
                        : read.olderError
                          ? zh
                            ? "重试"
                            : "Retry"
                          : zh
                            ? "加载更早消息"
                            : "Load earlier messages"}
                  </Button>
                </div>
              )}
              <ConversationTimeline
                rows={read.rows ?? []}
                totalCount={read.rows?.length ?? 0}
                sessionKey={read.sessionId}
                rowContext={rowContext}
                hideTurnNavigator
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
