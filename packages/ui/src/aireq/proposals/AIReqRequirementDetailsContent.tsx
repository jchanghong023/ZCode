import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Clock3, FileText, Maximize2, MessageSquareText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import {
  AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH,
  type AIReqDataSource,
  type AIReqDiscussionAgent,
  type AIReqRequirementComment,
  type AIReqRequirementDetails,
  type AIReqRequirementGroup,
} from "../contract.js";
import { primaryDiscussionAgent } from "../proposalRoutes.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import {
  formatProposalDwellTime,
  proposalDwellTime,
  proposalProcessLabel,
} from "./proposalColumns.js";
import { AIReqRequirementFields } from "./AIReqRequirementFields.js";
import { documentCommentDelivery } from "./document-comment-delivery.js";

type ReadResult = { source: AIReqDataSource; attempt: number } & (
  | { detail: AIReqRequirementDetails; error?: never }
  | { error: unknown; detail?: never }
);

const scrollRegion =
  "min-h-0 min-w-0 overflow-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused";

type DetailsProps = {
  projectId: string;
  irId: string;
  zh: boolean;
  item?: AIReqRequirementGroup;
  active?: boolean;
  onDiscuss?: (agent: AIReqDiscussionAgent) => void;
};

export function AIReqRequirementDetailsContent(
  props: (
    | { originalOnly: true; projectId: string; irId: string }
    | {
        originalOnly?: false;
        item: AIReqRequirementGroup;
        onDiscuss: (agent: AIReqDiscussionAgent) => void;
      }
  ) & { zh: boolean; active?: boolean },
) {
  // effect 清理前也不能展示上一条 IR；按请求目标整体重建描述和评论状态。
  const { projectId, irId } = props.originalOnly
    ? props
    : { projectId: props.item.projectId, irId: props.item.id };
  return (
    <RequirementDetails
      key={JSON.stringify([projectId, irId])}
      projectId={projectId}
      irId={irId}
      item={props.originalOnly ? undefined : props.item}
      zh={props.zh}
      active={props.active}
      onDiscuss={props.originalOnly ? undefined : props.onDiscuss}
    />
  );
}

function RequirementDetails({ projectId, irId, zh, item, active = true, onDiscuss }: DetailsProps) {
  const source = useAIReqDataSource();
  const description = useRef<HTMLElement>(null);
  const commentList = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<ReadResult>();
  const result = read?.source === source && read.attempt === attempt ? read : undefined;
  const detail = result?.detail;
  const retry = () => setAttempt((previous) => previous + 1);
  const retryLabel = zh ? "重试" : "Retry";
  const descriptionLabel = zh ? "描述" : "Description";
  const commentsLabel = zh ? "评论" : "Comments";

  useEffect(() => {
    if (!active) return;
    let live = true;
    void source.readRequirementDetails({ projectId, irId }).then(
      (detail) => {
        if (live) setRead({ source, attempt, detail });
      },
      (error: unknown) => {
        if (live) setRead({ source, attempt, error });
      },
    );
    return () => {
      live = false;
    };
  }, [source, projectId, irId, attempt, active]);

  function jumpTo(element: HTMLElement | null) {
    element?.scrollIntoView({ block: "start" });
    element?.focus({ preventScroll: true });
  }
  const agent = item && primaryDiscussionAgent(item);
  const header = item && (
    <DetailHeader item={item} zh={zh}>
      <div className="flex flex-wrap items-center gap-2">
        {detail && source.capabilities.canAccessCloudComments && (
          <nav aria-label={zh ? "详情导航" : "Details navigation"} className="flex shrink-0 gap-1">
            <Button variant="ghost" onClick={() => jumpTo(description.current)}>
              <FileText aria-hidden="true" />
              {zh ? "跳至描述" : "Go to description"}
            </Button>
            <Button variant="ghost" onClick={() => jumpTo(commentList.current)}>
              <MessageSquareText aria-hidden="true" />
              {zh ? "跳至评论" : "Go to comments"}
            </Button>
          </nav>
        )}
        {agent && onDiscuss && (
          <DialogClose asChild>
            <Button onClick={() => onDiscuss(agent)}>
              {agent === "requirements"
                ? zh
                  ? "讨论此需求"
                  : "Discuss this requirement"
                : zh
                  ? "讨论此方案"
                  : "Discuss this solution"}
            </Button>
          </DialogClose>
        )}
      </div>
    </DetailHeader>
  );

  if (!detail) {
    return (
      <>
        {header}
        <div className="flex items-center gap-3 px-6 py-4">
          {!result ? (
            <p role="status">{zh ? "正在加载需求详情…" : "Loading requirement details…"}</p>
          ) : (
            <>
              <p role="alert">
                {formatUserFacingError(
                  result.error,
                  zh ? "需求详情加载失败。" : "Could not load requirement details.",
                )}
              </p>
              <Button variant="outline" onClick={retry}>
                {retryLabel}
              </Button>
            </>
          )}
        </div>
      </>
    );
  }

  if (!item)
    return (
      <article
        className="mx-auto h-full w-full max-w-4xl overflow-auto px-5 py-4"
        aria-label={zh ? "云龙原文" : "Original CloudDragon request"}
      >
        <h2 className="mb-3 text-ui-lg font-semibold">
          {zh ? "云龙原文" : "Original CloudDragon request"} · {irId}
        </h2>
        {detail.description.trim() ? (
          <RequirementBody body={detail.description} />
        ) : (
          <p>{zh ? "云龙未提供描述。" : "No description in CloudDragon."}</p>
        )}
      </article>
    );
  return (
    <>
      {header}
      <div className="grid min-h-0 flex-auto grid-cols-[minmax(0,1fr)_clamp(16rem,27%,21rem)]">
        <div
          role="region"
          aria-label={zh ? "描述和评论" : "Description and comments"}
          tabIndex={0}
          className={`${scrollRegion} scroll-pt-5 bg-card px-6 py-5 lg:px-8`}
        >
          <div className="max-w-[50rem] space-y-6">
            <section ref={description} tabIndex={-1} aria-label={descriptionLabel}>
              <TextSection label={descriptionLabel} body={detail.description} zh={zh} description />
            </section>
            {source.capabilities.canAccessCloudComments && (
              <section
                ref={commentList}
                tabIndex={-1}
                aria-label={commentsLabel}
                className="space-y-3 border-t border-border pt-5"
              >
                <RequirementComments projectId={projectId} irId={irId} zh={zh} />
              </section>
            )}
          </div>
        </div>
        <AIReqRequirementFields fields={detail.fields} zh={zh} />
      </div>
    </>
  );
}

function DetailHeader({
  item,
  zh,
  children,
}: {
  item: AIReqRequirementGroup;
  zh: boolean;
  children: ReactNode;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = proposalDwellTime(item, now);
  return (
    <DialogHeader className="shrink-0 gap-3 border-b border-border bg-card px-6 py-4 pr-16 lg:px-8 lg:pr-16">
      <DialogTitle
        className="line-clamp-2 wrap-anywhere text-ui-settings-title! leading-tight font-semibold"
        title={item.title}
      >
        {item.title}
      </DialogTitle>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-caption text-foreground-subtle">
          <span className="font-mono">{item.id}</span>
          {item.process && (
            <span data-aireq-theme-stage={item.process}>
              {proposalProcessLabel(item.process, zh)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock3 aria-hidden="true" className="size-3.5" />
            {zh ? "停留时间" : "Time in status"}{" "}
            <strong className="font-semibold tabular-nums text-foreground">
              {elapsed === undefined ? "—" : formatProposalDwellTime(elapsed, zh)}
            </strong>
          </span>
        </div>
        {children}
      </div>
    </DialogHeader>
  );
}

type CommentWrite = "add" | "delete";
type CommentFeedback = { operation: CommentWrite } & (
  | { status: "success" }
  | { status: "failed"; cause: unknown }
);

function commentLabel(index: number, zh: boolean) {
  return zh ? `评论 ${index + 1}` : `Comment ${index + 1}`;
}

function RequirementComments({
  projectId,
  irId,
  zh,
}: {
  projectId: string;
  irId: string;
  zh: boolean;
}) {
  const source = useAIReqDataSource();
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{
    items?: AIReqRequirementComment[];
    failure?: { cause: unknown };
    pending: boolean;
  }>({ pending: true });
  const [body, setBody] = useState("");
  const [writing, setWriting] = useState<CommentWrite>();
  const [feedback, setFeedback] = useState<CommentFeedback>();
  const [deleting, setDeleting] = useState<{ id: string; index: number }>();
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const restoreComposer = useRef(false);
  const delivery = documentCommentDelivery(source, projectId, irId);
  const document = useSyncExternalStore(delivery.subscribe, delivery.snapshot);
  const { commentsRevision } = document;
  const sendingDocument = document.phase === "loading" || document.phase === "sending";
  const busy = Boolean(writing) || read.pending || sendingDocument;
  const writeUnconfirmed = feedback?.status === "failed";
  const needsReload = Boolean(read.failure) || writeUnconfirmed;
  const writeBlocked = busy || needsReload;
  const message =
    feedback &&
    (feedback.status === "failed"
      ? formatUserFacingError(
          feedback.cause,
          feedback.operation === "add"
            ? zh
              ? "评论提交未确认，请先重新加载评论。"
              : "The post could not be confirmed. Reload the comments to check."
            : zh
              ? "评论删除未确认，请先重新加载评论。"
              : "The deletion could not be confirmed. Reload the comments to check.",
        )
      : feedback.operation === "add"
        ? zh
          ? "评论已发布。"
          : "Comment posted."
        : zh
          ? "评论已删除。"
          : "Comment deleted.");
  const deleteLabel = deleting && commentLabel(deleting.index, zh);

  // 语言只影响呈现；切换语言不能发起一次可能覆盖写入结果的回读。
  useEffect(() => {
    let active = true;
    void source.readRequirementComments({ projectId, irId }).then(
      (items) => {
        if (!active) return;
        delivery.observeComments(items, commentsRevision);
        setRead({ items, pending: false });
        setFeedback((previous) => (previous?.status === "failed" ? undefined : previous));
      },
      (cause: unknown) => {
        if (active) setRead((previous) => ({ ...previous, failure: { cause }, pending: false }));
      },
    );
    return () => {
      active = false;
    };
  }, [source, projectId, irId, attempt, delivery, commentsRevision]);

  function reloadComments() {
    setRead((previous) => ({ ...previous, pending: true }));
    setAttempt((previous) => previous + 1);
  }

  async function publish() {
    if (writeBlocked || !body.trim() || body.length > AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH) return;
    setWriting("add");
    setFeedback(undefined);
    try {
      const added = await source.addRequirementComment({ projectId, irId }, body);
      setRead((current) => ({
        ...current,
        items: [
          ...(current.items ?? []).filter((item) => added.id === null || item.id !== added.id),
          added,
        ],
      }));
      setBody("");
      setFeedback({ operation: "add", status: "success" });
      reloadComments();
      composer.current?.focus({ preventScroll: true });
    } catch (cause) {
      // 写入未确认时保留草稿，必须成功回读后才能由用户再次发起写入。
      setFeedback({ operation: "add", status: "failed", cause });
    } finally {
      setWriting(undefined);
    }
  }

  async function confirmDelete() {
    if (!deleting || writeBlocked) return;
    setWriting("delete");
    setFeedback(undefined);
    try {
      await source.deleteRequirementComment({ projectId, irId }, deleting.id);
      setRead((current) => ({
        ...current,
        items: current.items?.filter(({ id }) => id !== deleting.id),
      }));
      restoreComposer.current = true;
      setFeedback({ operation: "delete", status: "success" });
      reloadComments();
    } catch (cause) {
      setFeedback({ operation: "delete", status: "failed", cause });
    } finally {
      setDeleting(undefined);
      setWriting(undefined);
    }
  }

  return (
    <>
      <header className="flex items-baseline gap-2">
        <h2 className="text-ui-xl font-semibold">{zh ? "评论" : "Comments"}</h2>
        {!read.pending && !needsReload && read.items && (
          <span className="text-ui-caption tabular-nums text-foreground-subtle">
            {read.items.length
              ? zh
                ? `${read.items.length} 条`
                : String(read.items.length)
              : zh
                ? "暂无评论"
                : "No comments"}
          </span>
        )}
      </header>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void publish();
        }}
      >
        <Textarea
          ref={composer}
          aria-label={zh ? "评论内容" : "Comment text"}
          placeholder={zh ? "写评论…" : "Write a comment…"}
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
          maxLength={AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH}
          readOnly={Boolean(writing)}
          rows={2}
          className="min-h-16 resize-y border-input-border bg-input px-3 hover:border-input-border-hover"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-ui-caption">
            {message && (
              <p
                role={writeUnconfirmed ? "alert" : "status"}
                className={writeUnconfirmed ? "text-destructive" : "text-foreground-subtle"}
              >
                {message}
              </p>
            )}
            {read.failure && (
              <p role="alert" className="text-destructive">
                {formatUserFacingError(
                  read.failure.cause,
                  zh ? "评论加载失败。" : "Could not load comments.",
                )}
              </p>
            )}
            {needsReload && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={reloadComments}
              >
                {zh ? "重新加载评论" : "Reload comments"}
              </Button>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {read.items && (
              <Button
                type="button"
                variant="outline"
                disabled={writeBlocked || document.phase === "unknown"}
                onClick={() => void delivery.send()}
              >
                {document.phase === "remaining"
                  ? zh
                    ? `补发剩余 ${document.total - document.sent} 条`
                    : `Send remaining ${document.total - document.sent}`
                  : zh
                    ? "将本需求正文发到云龙评论"
                    : "Post requirements document to CloudDragon"}
              </Button>
            )}
            <Button type="submit" disabled={writeBlocked || !body.trim()}>
              {writing === "add" ? (zh ? "发布中…" : "Posting…") : zh ? "发表评论" : "Post comment"}
            </Button>
          </div>
        </div>
      </form>
      {document.phase !== "idle" && (
        <p
          role={
            ["read-error", "unavailable", "unknown", "remaining"].includes(document.phase)
              ? "alert"
              : "status"
          }
          className="text-ui-caption text-foreground-subtle"
        >
          {document.phase === "loading" &&
            (zh ? "正在读取最新需求文档…" : "Reading the latest saved document…")}
          {document.phase === "unavailable" &&
            (zh
              ? "此 IR 尚无可发送的需求文档正文。"
              : "This IR has no readable requirements document to send.")}
          {document.phase === "read-error" &&
            formatUserFacingError(
              document.failure,
              zh ? "读取需求文档失败。" : "Could not read the requirements document.",
            )}
          {document.phase === "sending" &&
            (zh
              ? `正在发送 V${document.version}，已发送 ${document.sent}/${document.total} 条。`
              : `Sending V${document.version}: ${document.sent}/${document.total} posted.`)}
          {document.phase === "unknown" &&
            (zh
              ? `已发送 ${document.sent}/${document.total} 条，第 ${document.sent + 1} 条待回读核对。`
              : `${document.sent}/${document.total} posted. Checking part ${document.sent + 1}.`)}
          {document.phase === "remaining" &&
            (zh
              ? `V${document.version} 已发送 ${document.sent}/${document.total} 条，剩余部分等待补发。`
              : `V${document.version}: ${document.sent}/${document.total} posted. The remaining parts can be sent manually.`)}
          {document.phase === "done" &&
            (zh
              ? `需求文档 V${document.version} 已发送，共 ${document.total} 条评论。`
              : `Requirements V${document.version} posted in ${document.total} comment(s).`)}
        </p>
      )}
      {read.pending && (
        <p role="status" className="text-ui-caption text-foreground-subtle">
          {zh ? "正在加载评论…" : "Loading comments…"}
        </p>
      )}
      {!!read.items?.length && (
        <ol className="divide-y divide-border border-t border-border">
          {read.items.map(({ id, body: text, author, createdAt }, index) => {
            const label = commentLabel(index, zh);
            return (
              <li key={id ?? `no-id-${index}`} className="py-4">
                <TextSection
                  label={label}
                  body={text}
                  meta={[author, createdAt].filter(Boolean).join(" · ")}
                  zh={zh}
                  action={
                    id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-foreground-subtle hover:text-destructive"
                        aria-label={zh ? `删除${label}` : `Delete ${label}`}
                        title={zh ? "删除评论" : "Delete comment"}
                        disabled={writeBlocked}
                        onClick={(event) => {
                          deleteTrigger.current = event.currentTarget;
                          restoreComposer.current = false;
                          setDeleting({ id, index });
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )
                  }
                />
              </li>
            );
          })}
        </ol>
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !writing) setDeleting(undefined);
        }}
      >
        <AlertDialogContent
          overlayClassName="z-[70]"
          className="z-[70]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const previous = deleteTrigger.current;
            (restoreComposer.current || !previous?.isConnected || previous.disabled
              ? composer.current
              : previous
            )?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{zh ? "删除评论？" : "Delete comment?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {zh
                ? `「${deleteLabel ?? ""}」将从该 IR 移除，删除后无法恢复。`
                : `${deleteLabel ?? "This comment"} will be removed from this IR. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(writing)}>
              {zh ? "取消" : "Cancel"}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={writeBlocked}
              onClick={() => void confirmDelete()}
            >
              {writing === "delete"
                ? zh
                  ? "删除中…"
                  : "Deleting…"
                : zh
                  ? "确认删除"
                  : "Delete comment"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TextSection({
  label,
  body,
  meta,
  zh,
  action,
  description = false,
}: {
  description?: boolean;
  label: string;
  body: string;
  meta?: string;
  zh: boolean;
  action?: ReactNode;
}) {
  const hasBody = Boolean(body.trim());
  const Heading = description ? "h2" : "h3";
  const Container = description ? "div" : "section";
  return (
    <Container aria-label={description ? undefined : label} className="min-w-0">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Heading className={description ? "text-ui-xl font-semibold" : "font-semibold"}>
            {label}
          </Heading>
          {meta && <p className="wrap-anywhere text-ui-caption text-foreground-subtle">{meta}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasBody && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={zh ? `全屏阅读 · ${label}` : `Read full screen · ${label}`}
                >
                  <Maximize2 aria-hidden="true" />
                  {zh ? "全屏阅读" : "Full screen"}
                </Button>
              </DialogTrigger>
              <DialogContent
                aria-describedby={undefined}
                overlayClassName="z-[70]"
                className="top-0 left-0 z-[70] flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0"
              >
                <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-16">
                  <DialogTitle className="text-ui-lg font-semibold">{label}</DialogTitle>
                  {meta && (
                    <p className="wrap-anywhere text-ui-caption text-foreground-subtle">{meta}</p>
                  )}
                </DialogHeader>
                <div
                  role="region"
                  aria-label={label}
                  tabIndex={0}
                  className={`${scrollRegion} flex-1 px-6 py-6`}
                >
                  <RequirementBody className="mx-auto max-w-[48rem]" body={body} />
                </div>
              </DialogContent>
            </Dialog>
          )}
          {action}
        </div>
      </header>
      {hasBody ? (
        <RequirementBody body={body} />
      ) : (
        <p className="text-foreground-subtle">{zh ? "暂无正文" : "No text"}</p>
      )}
    </Container>
  );
}

function RequirementBody({ className = "", body }: { className?: string; body: string }) {
  return (
    <AIReqMarkdownDocument
      allowSanitizedHtml
      className={`text-wrap [&_p]:whitespace-pre-wrap [&_p]:wrap-anywhere ${className}`}
    >
      {body}
    </AIReqMarkdownDocument>
  );
}
