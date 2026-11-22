import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { getEmployeeId } from "../identity.js";
import { hasProjectRole } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqRequirementReturnButton } from "../shell/AIReqRequirementNavigation.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";

export function AIReqFormalWorkspace() {
  const ai = useAIReq()!;
  const { open } = useAIReqSidePane();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
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
  const materialTitle = srId
    ? (ai.view?.srs.find(
        (item) => item.projectId === projectId && item.irId === irId && item.id === srId,
      )?.title ?? selectedTitle)
    : selectedTitle;

  useEffect(() => {
    if (!irId || formalView === "list") {
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
  const date = selected?.merge?.checkedAt && new Date(selected.merge.checkedAt);
  const pr = selected?.requirementsPr;
  const canSync =
    hasProjectRole(ai.view, projectId, getEmployeeId(), "development") ||
    hasProjectRole(ai.view, projectId, getEmployeeId(), "testing");
  const syncDocuments = async () => {
    if (!selected || !canSync || syncFlight.current) return;
    syncFlight.current = true;
    setSyncing(true);
    setSyncFeedback(undefined);
    try {
      const result = await ai.command({
        type: "syncFormalDocuments",
        projectId: selected.projectId,
        irId: selected.id,
      });
      if (result) setSyncFeedback({ irId: selected.id, label: result.receipt.type });
    } finally {
      syncFlight.current = false;
      setSyncing(false);
    }
  };
  return (
    <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-5"}>
        {selected && ready ? (
          <>
            <AIReqRequirementReturnButton />
            <header className="space-y-2">
              <h1 tabIndex={-1} className={AIREQ_PAGE_TITLE_CLASSNAME + " wrap-anywhere"}>
                {selected.title}
              </h1>
              {date && (
                <p className="text-ui-sm text-foreground-subtle">
                  {zh ? "文档合入于 " : "Merged "}
                  <time dateTime={selected.merge?.checkedAt}>
                    {date.toLocaleDateString(locale, { timeZone: "Asia/Shanghai" })}
                  </time>
                </p>
              )}
            </header>
            <section className="space-y-2 rounded-xl border border-card-border bg-card p-4">
              <h2 className="font-medium">{zh ? "原始需求" : "Original requirement"}</h2>
              <p className="wrap-anywhere whitespace-pre-wrap">{selected.originalText}</p>
            </section>
            <div className="flex flex-wrap gap-2">
              {canSync && selected.merge && (
                <Button
                  variant="outline"
                  disabled={syncing || ai.pending}
                  onClick={() => void syncDocuments()}
                >
                  <RefreshCw aria-hidden="true" />
                  {syncing ? (zh ? "正在同步…" : "Syncing…") : zh ? "从 Git 同步" : "Sync from Git"}
                </Button>
              )}
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
              {pr?.status === "merged" && pr.url && /^https?:\/\//i.test(pr.url) && (
                <Button asChild variant="outline">
                  <a href={pr.url} target="_blank" rel="noreferrer">
                    {zh ? "查看文档 PR" : "View document PR"}
                  </a>
                </Button>
              )}
              <Button variant="ghost" onClick={() => ai.startProposalDraft(selected.id)}>
                {zh ? "新建关联提案" : "New related proposal"}
              </Button>
            </div>
            {syncFeedback?.irId === selected.id && (
              <p role="status" className="text-ui-sm text-foreground-subtle">
                {syncFeedback.label}
              </p>
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
                  <ul className="divide-y divide-border rounded-xl border border-card-border bg-card">
                    {visible.map((group) => (
                      <li key={group.id} data-aireq-motion-row="">
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-between gap-3 px-4 py-3 text-left whitespace-normal focus-visible:border-remote-foreground-muted"
                          onClick={() =>
                            ai.select(
                              { projectId: group.projectId, irId: group.id, formalView: "detail" },
                              group.releaseId,
                            )
                          }
                        >
                          <span data-aireq-motion-cell="" className="min-w-0 wrap-anywhere">
                            <span className="block">{group.title}</span>
                            {group.title !== group.originalText && (
                              <span className="mt-0.5 block text-ui-sm font-normal text-foreground-subtle">
                                {group.originalText}
                              </span>
                            )}
                          </span>
                          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
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
