import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, History } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqRequirementReturnButton } from "../shell/AIReqRequirementNavigation.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { resolveMrLink } from "../proposals/AIReqDocumentPrStatus.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";

export function AIReqArchivedRequirement({ group: selected }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const { open } = useAIReqSidePane();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [expandedTitle, setExpandedTitle] = useState<string>();
  const [clippedTitle, setClippedTitle] = useState<string>();
  const titleElement = useRef<HTMLHeadingElement>(null);
  const routedTarget = useRef<string | undefined>(undefined);
  const { projectId, irId, srId } = ai.selection;
  const ready = ai.selectionReady;
  const releaseId = selected?.releaseId;
  const selectedTitle = selected?.title;
  useEffect(() => {
    const element = titleElement.current;
    if (!element || !ready || !selected || expandedTitle === selected.id) return;
    const measure = () =>
      setClippedTitle(element.scrollHeight > element.clientHeight + 1 ? selected.id : undefined);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expandedTitle, ready, selected]);
  const materialTitle = srId
    ? (ai.view?.srs.find(
        (item) => item.projectId === projectId && item.irId === irId && item.id === srId,
      )?.title ?? selectedTitle)
    : selectedTitle;

  useEffect(() => {
    if (!irId || !srId) {
      routedTarget.current = undefined;
      return;
    }
    if (!ready || !projectId || !releaseId || !materialTitle) return;
    const key = JSON.stringify([projectId, releaseId, irId, srId]);
    if (routedTarget.current === key) return;
    routedTarget.current = key;
    open(
      {
        kind: "materials",
        selection: { projectId, irId, srId },
        releaseId,
        title: materialTitle,
      },
      { ifAbsent: true },
    );
  }, [irId, materialTitle, open, projectId, ready, releaseId, srId]);

  const date = selected?.merge?.checkedAt && new Date(selected.merge.checkedAt);
  const pr = selected?.requirementsPr;
  const prLink = pr?.status === "merged" ? resolveMrLink(pr.url) : undefined;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-5"}>
        <AIReqRequirementReturnButton />
        <header className="space-y-2">
          <h1
            ref={titleElement}
            tabIndex={-1}
            className={`${AIREQ_PAGE_TITLE_CLASSNAME} wrap-anywhere ${expandedTitle === selected.id ? "" : "line-clamp-2"}`}
            title={selected.title}
          >
            {selected.title}
          </h1>
          {(clippedTitle === selected.id || expandedTitle === selected.id) && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              aria-expanded={expandedTitle === selected.id}
              onClick={() =>
                setExpandedTitle(expandedTitle === selected.id ? undefined : selected.id)
              }
            >
              {expandedTitle === selected.id
                ? zh
                  ? "收起标题"
                  : "Collapse title"
                : zh
                  ? "展开完整标题"
                  : "Expand full title"}
            </Button>
          )}
          {date && (
            <p role="status" className="flex items-center gap-2 text-ui-sm text-success">
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
              {zh ? "已通过材料核验并归档 · " : "Verified and archived · "}
              <time dateTime={selected.merge?.checkedAt}>
                {date.toLocaleDateString(locale, { timeZone: "Asia/Shanghai" })}
              </time>
            </p>
          )}
        </header>
        {selected.originalText.trim() !== selected.title.trim() && (
          <section className="space-y-2 rounded-xl border border-card-border bg-card p-4">
            <h2 className="font-medium">{zh ? "原始需求" : "Original requirement"}</h2>
            <p className="wrap-anywhere whitespace-pre-wrap">{selected.originalText}</p>
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              open({
                kind: "materials",
                selection: ai.selection,
                releaseId: selected.releaseId,
                title: materialTitle ?? selected.title,
              })
            }
          >
            <FileText aria-hidden="true" />
            {zh ? "查看文档材料" : "Read documents"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              open({
                kind: "history",
                selection: {
                  projectId: selected.projectId,
                  irId: selected.id,
                },
                releaseId: selected.releaseId,
                title: selected.title,
              })
            }
          >
            <History aria-hidden="true" />
            {zh ? "讨论与评审历史" : "Discussion and review history"}
          </Button>
          {prLink && (
            <Button asChild variant="outline">
              <a href={prLink} target="_blank" rel="noreferrer">
                {zh ? "查看文档 PR" : "View document PR"}
              </a>
            </Button>
          )}
          <Button variant="ghost" onClick={() => ai.startProposalDraft(selected.id)}>
            {zh ? "新建关联提案" : "New related proposal"}
          </Button>
        </div>
        {selected.merge && (
          <details className="space-y-3 rounded-lg border border-border px-3 py-2 text-ui-sm">
            <summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              {zh ? "查看交付记录" : "View delivery record"}
            </summary>
            <p>
              {pr?.number !== undefined ? `文档 PR #${pr.number} · ` : ""}
              {zh ? "文件核验通过" : "Files verified"} · {selected.merge.files.length}{" "}
              {zh ? "份文件" : "files"}
            </p>
            <ul className="divide-y divide-border/50">
              {selected.merge.files.map((file) => (
                <li key={file.path} className="break-all py-1 font-mono text-foreground-subtle">
                  {file.path}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </main>
  );
}
