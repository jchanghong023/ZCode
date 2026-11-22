import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, FileText, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { getEmployeeId } from "../identity.js";
import { hasProjectRole } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqRequirementReturnButton } from "../shell/AIReqRequirementNavigation.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { resolveMrLink } from "../proposals/AIReqDocumentPrStatus.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";

export function AIReqFormalWorkspace() {
  const ai = useAIReq()!;
  const { open } = useAIReqSidePane();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [expandedTitle, setExpandedTitle] = useState<string>();
  const [clippedTitle, setClippedTitle] = useState<string>();
  const titleElement = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState("");
  const [syncingIrId, setSyncingIrId] = useState<string>();
  const [syncFeedback, setSyncFeedback] = useState<{ irId: string; label: string }>();
  const syncFlight = useRef(false);
  const routedTarget = useRef<string | undefined>(undefined);
  const { projectId, irId, srId, formalView } = ai.selection;
  const groups =
    ai.view?.groups.filter(
      (group) => group.projectId === projectId && group.releaseId === ai.releaseId,
    ) ?? [];
  const selected = formalView !== "list" ? groups.find((group) => group.id === irId) : undefined;
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
    if (!irId || !srId || formalView === "list") {
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
        selection: { projectId, irId, srId, formalView: "detail" },
        releaseId,
        title: materialTitle,
      },
      { ifAbsent: true },
    );
  }, [formalView, irId, materialTitle, open, projectId, ready, releaseId, srId]);

  const query = search.trim().toLowerCase();
  const visible = groups
    .filter((group) =>
      [group.title, group.originalText].some((value) => value.toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        (b.merge?.checkedAt ?? "").localeCompare(a.merge?.checkedAt ?? "") ||
        a.title.localeCompare(b.title, locale),
    );
  const searchLabel = zh ? "搜索正式文档" : "Search formal documents";
  const syncLabel = zh ? "从 Git 同步" : "Sync from Git";
  const date = selected?.merge?.checkedAt && new Date(selected.merge.checkedAt);
  const pr = selected?.requirementsPr;
  const prLink = pr?.status === "merged" ? resolveMrLink(pr.url) : undefined;
  const canSync =
    hasProjectRole(ai.view, projectId, getEmployeeId(), "development") ||
    hasProjectRole(ai.view, projectId, getEmployeeId(), "testing");
  const syncDocuments = async (group: AIReqRequirementGroup) => {
    if (!canSync || !group.merge || ai.pending || syncFlight.current) return;
    syncFlight.current = true;
    setSyncingIrId(group.id);
    setSyncFeedback(undefined);
    try {
      const result = await ai.command({
        type: "syncFormalDocuments",
        projectId: group.projectId,
        irId: group.id,
      });
      if (result) setSyncFeedback({ irId: group.id, label: result.receipt.type });
    } finally {
      syncFlight.current = false;
      setSyncingIrId(undefined);
    }
  };
  return (
    <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-5"}>
        {selected && ready ? (
          <>
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
                      formalView: "detail",
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
          </>
        ) : (
          <>
            <ScopedPageTitle title={zh ? "正式文档" : "Formal documents"} />
            {ready && (
              <>
                {groups.length > 0 && (
                  <Input
                    type="search"
                    aria-label={searchLabel}
                    placeholder={searchLabel}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="max-w-sm"
                  />
                )}
                {visible.length ? (
                  <div className="overflow-x-auto rounded-xl border border-card-border bg-card text-foreground">
                    <table className="w-full min-w-lg table-fixed text-left text-ui-base">
                      <colgroup>
                        <col />
                        <col className="w-28" />
                        <col className="w-28" />
                        <col className="w-28" />
                        {canSync && <col className="w-16" />}
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border">
                          <th scope="col" className="px-4 py-3 font-medium">
                            {zh ? "文档名称" : "Document name"}
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            {zh ? "业务" : "Business"}
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            {zh ? "开发" : "Development"}
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            {zh ? "测试" : "Testing"}
                          </th>
                          {canSync && (
                            <th scope="col" className="px-3 py-3 text-center font-medium">
                              {zh ? "同步" : "Sync"}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visible.map((group) => (
                          <tr
                            key={group.id}
                            data-aireq-motion-row=""
                            className="group/row cursor-pointer hover:bg-hover"
                            onClick={() =>
                              ai.select(
                                {
                                  projectId: group.projectId,
                                  irId: group.id,
                                  formalView: "detail",
                                },
                                group.releaseId,
                              )
                            }
                          >
                            <td data-aireq-motion-cell="" className="px-4 py-3">
                              <div className="min-w-0">
                                <Button
                                  type="button"
                                  variant="link"
                                  className="h-auto max-w-full cursor-pointer gap-1.5 p-0 text-left whitespace-normal text-foreground group-hover/row:underline"
                                >
                                  <span className="min-w-0 wrap-anywhere">{group.title}</span>
                                  <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                                </Button>
                                {group.title !== group.originalText && (
                                  <p className="mt-0.5 truncate text-ui-sm text-foreground-subtle group-hover/row:text-foreground">
                                    {group.originalText}
                                  </p>
                                )}
                                {canSync && (
                                  <p
                                    role="status"
                                    className="text-ui-sm text-foreground-subtle group-hover/row:text-foreground"
                                  >
                                    {syncFeedback?.irId === group.id
                                      ? syncFeedback.label
                                      : undefined}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-ui-caption text-foreground-subtle tabular-nums group-hover/row:text-foreground">
                              {group.formalParticipants?.business ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-ui-caption text-foreground-subtle tabular-nums group-hover/row:text-foreground">
                              {group.formalParticipants?.development ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-ui-caption text-foreground-subtle tabular-nums group-hover/row:text-foreground">
                              {group.formalParticipants?.testing ?? "—"}
                            </td>
                            {canSync && (
                              <td className="px-3 text-center">
                                {group.merge && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={
                                          syncingIrId === group.id
                                            ? zh
                                              ? "正在同步…"
                                              : "Syncing…"
                                            : syncLabel
                                        }
                                        disabled={syncingIrId !== undefined || ai.pending}
                                        className="disabled:pointer-events-auto"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void syncDocuments(group);
                                        }}
                                      >
                                        <RefreshCw
                                          aria-hidden="true"
                                          className={
                                            syncingIrId === group.id
                                              ? "motion-safe:animate-spin"
                                              : undefined
                                          }
                                        />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{syncLabel}</TooltipContent>
                                  </Tooltip>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p role="status" className="text-foreground-subtle">
                    {groups.length
                      ? zh
                        ? "未找到匹配的正式文档。"
                        : "No matching formal documents."
                      : zh
                        ? "文档 PR 合入并核验后，正式文档会显示在这里。"
                        : "Formal documents appear here after their PR merges and passes verification."}
                  </p>
                )}
              </>
            )}
            {!ready && irId && (
              <p role="status" className="text-foreground-subtle">
                {ai.pending
                  ? zh
                    ? "正在读取正式文档…"
                    : "Loading formal document…"
                  : zh
                    ? "正式文档读取失败。"
                    : "Could not load the formal document."}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
