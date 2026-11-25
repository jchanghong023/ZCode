import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { AIREQ_CLOUD_PROPOSAL_COLUMNS, type AIReqRequirementDetails } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { proposalColumns } from "./proposalColumns.js";

type ReadResult = { attempt: number } & (
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

export function AIReqRequirementDetailsContent({
  projectId,
  irId,
  zh,
}: {
  projectId: string;
  irId: string;
  zh: boolean;
}) {
  const source = useAIReqDataSource();
  const description = useRef<HTMLElement>(null);
  const commentList = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ReadResult>();
  const detail = result?.detail;
  const pending = result?.attempt !== attempt;
  const retry = () => setAttempt((previous) => previous + 1);
  const retryLabel = zh ? "重试" : "Retry";
  const descriptionLabel = zh ? "描述" : "Description";
  const commentsLabel = zh ? "评论" : "Comments";
  const fieldsLabel = zh ? "其他字段" : "Other fields";

  useEffect(() => {
    let active = true;
    void source.readRequirementDetails({ projectId, irId }).then(
      (detail) => {
        if (active) setResult({ attempt, detail });
      },
      (error: unknown) => {
        if (active) setResult({ attempt, error });
      },
    );
    return () => {
      active = false;
    };
  }, [source, projectId, irId, attempt]);

  if (!detail) {
    return (
      <div className="flex items-center gap-3 px-6 py-4">
        {pending ? (
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

  const { comments } = detail;
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
          {"unavailable" in comments ? (
            <p className="text-foreground-subtle">
              {zh ? "云龙列表未返回评论。" : "CloudDragon did not include comments in the list."}
            </p>
          ) : comments.items.length ? (
            <ol className="space-y-3">
              {comments.items.map(({ body, author, createdAt }, index) => (
                <li key={index}>
                  <TextSection
                    label={zh ? `评论 ${index + 1}` : `Comment ${index + 1}`}
                    body={body}
                    meta={[author, createdAt].filter(Boolean).join(" · ")}
                    zh={zh}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-foreground-subtle">{zh ? "暂无评论" : "No comments"}</p>
          )}
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

function TextSection({
  label,
  body,
  meta,
  zh,
}: {
  label: string;
  body: string;
  meta?: string;
  zh: boolean;
}) {
  const hasBody = Boolean(body.trim());
  return (
    <section aria-label={label} className="min-w-0 rounded-lg border border-card-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="font-semibold">{label}</h3>
          {meta && <p className="wrap-anywhere text-ui-caption text-foreground-subtle">{meta}</p>}
        </div>
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
