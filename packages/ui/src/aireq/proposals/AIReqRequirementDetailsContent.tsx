import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Maximize2, Trash2 } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import {
  AIREQ_CLOUD_PROPOSAL_COLUMNS,
  AIREQ_REQUIREMENT_COMMENT_MAX_LENGTH,
  type AIReqDataSource,
  type AIReqRequirementComment,
  type AIReqRequirementDetails,
} from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { proposalColumns } from "./proposalColumns.js";
import { documentCommentDelivery } from "./document-comment-delivery.js";

type ReadResult = { source: AIReqDataSource; attempt: number } & (
  | { detail: AIReqRequirementDetails; error?: never }
  | { error: unknown; detail?: never }
);

const scrollRegion =
  "min-h-0 min-w-0 overflow-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused";

const fieldLabels: Record<string, readonly [zh: string, en: string]> = {
  businessNo: ["需求编号", "Requirement ID"],
  name: ["标题", "Title"],
  delivererOwner: ["当前责任人", "Current owner"],
  owner: ["需求提出人", "Requester"],
  seId: ["设计责任人", "Design owner"],
  de: ["开发责任人", "Development owner"],
  te: ["测试责任人", "Test owner"],
  submitter: ["提交人", "Submitter"],
  createDate: ["创建时间", "Created at"],
  pi: ["PI", "PI"],
  piName: ["Release 名称", "Release name"],
  process: ["进展", "Status"],
  ...Object.fromEntries(
    AIREQ_CLOUD_PROPOSAL_COLUMNS.map((key) => [
      key,
      [proposalColumns[key].zh, proposalColumns[key].en],
    ]),
  ),
  estimatedWorkloadManday: ["预估工作量", "Estimated workload"],
  sumWorkloadManday: ["卷积工作量", "Total workload"],
  attachment: ["附件", "Attachments"],
};

type DetailsProps = { projectId: string; irId: string; zh: boolean };

export function AIReqRequirementDetailsContent(props: DetailsProps) {
  // effect 清理前也不能展示上一条 IR；按请求目标整体重建描述和评论状态。
  return <RequirementDetails key={JSON.stringify([props.projectId, props.irId])} {...props} />;
}

function RequirementDetails({ projectId, irId, zh }: DetailsProps) {
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
  const fieldsLabel = zh ? "其他字段" : "Other fields";

  useEffect(() => {
    let active = true;
    void source.readRequirementDetails({ projectId, irId }).then(
      (detail) => {
        if (active) setRead({ source, attempt, detail });
      },
      (error: unknown) => {
        if (active) setRead({ source, attempt, error });
      },
    );
    return () => {
      active = false;
    };
  }, [source, projectId, irId, attempt]);

  if (!detail) {
    return (
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
    );
  }

  const values = new Map(detail.fields.map(({ name, value }) => [name, value]));
  function jumpTo(element: HTMLElement | null) {
    element?.scrollIntoView({ block: "start" });
    element?.focus({ preventScroll: true });
  }
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(11rem,1fr)]">
      <div
        role="region"
        aria-label={zh ? "描述和评论" : "Description and comments"}
        tabIndex={0}
        className={`${scrollRegion} scroll-pt-14 px-4 pb-5 sm:px-6`}
      >
        <nav
          aria-label={zh ? "详情导航" : "Details navigation"}
          className="sticky top-0 z-10 mb-4 flex gap-2 border-b border-border bg-card py-2"
        >
          <Button type="button" variant="ghost" onClick={() => jumpTo(description.current)}>
            {descriptionLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={() => jumpTo(commentList.current)}>
            {commentsLabel}
          </Button>
        </nav>
        <section ref={description} tabIndex={-1} aria-label={descriptionLabel} className="mb-6">
          <TextSection label={descriptionLabel} body={detail.description} zh={zh} />
        </section>
        <section ref={commentList} tabIndex={-1} aria-label={commentsLabel} className="space-y-3">
          <h2 className="text-ui-lg font-semibold">{commentsLabel}</h2>
          <RequirementComments projectId={projectId} irId={irId} zh={zh} />
        </section>
      </div>
      <aside
        aria-label={fieldsLabel}
        tabIndex={0}
        className={`${scrollRegion} border-l border-border px-4 py-5`}
      >
        <h2 className="mb-2 text-ui-lg font-semibold">{fieldsLabel}</h2>
        <dl className="divide-y divide-border">
          {Object.entries(fieldLabels)
            .filter(([name]) => values.has(name))
            .map(([name, label]) => {
              const value = values.get(name);
              return (
                <div key={name} className="space-y-0.5 py-2 wrap-anywhere">
                  <dt className="text-ui-caption text-foreground-subtle">{label[zh ? 0 : 1]}</dt>
                  <dd className="whitespace-pre-wrap">
                    {value?.trim() && value !== "null" ? value : "—"}
                  </dd>
                </div>
              );
            })}
        </dl>
        <details className="mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer rounded-sm py-1 text-ui-caption font-medium focus-visible:outline-2 focus-visible:outline-input-border-focused">
            {zh ? "原始字段" : "Raw fields"}
          </summary>
          <dl className="divide-y divide-border">
            {detail.fields.map(({ name, value }) => (
              <div key={name} className="space-y-0.5 py-2 wrap-anywhere">
                <dt className="font-mono text-ui-caption text-foreground-subtle">{name}</dt>
                <dd className="whitespace-pre-wrap">{value === "" ? '""' : value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </aside>
    </div>
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
          rows={3}
          className="min-h-20 resize-y"
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
                    ? "同步需求文档到云龙评论"
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
        <ol className="space-y-3">
          {read.items.map(({ id, body: text, author, createdAt }, index) => {
            const label = commentLabel(index, zh);
            return (
              <li key={id ?? `no-id-${index}`}>
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
      {!read.pending && !needsReload && read.items?.length === 0 && (
        <p className="text-foreground-subtle">{zh ? "暂无评论" : "No comments"}</p>
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
}: {
  label: string;
  body: string;
  meta?: string;
  zh: boolean;
  action?: ReactNode;
}) {
  const hasBody = Boolean(body.trim());
  return (
    <section aria-label={label} className="min-w-0 rounded-lg border border-card-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="font-semibold">{label}</h3>
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
                  <RequirementBody className="mx-auto max-w-4xl" body={body} />
                </div>
              </DialogContent>
            </Dialog>
          )}
          {action}
        </div>
      </header>
      {hasBody ? (
        <div className="min-w-0 px-4 py-3">
          <RequirementBody body={body} />
        </div>
      ) : (
        <p className="px-4 py-3 text-foreground-subtle">{zh ? "暂无正文" : "No text"}</p>
      )}
    </section>
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
