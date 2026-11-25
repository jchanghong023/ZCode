import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqProposalFilters } from "./AIReqProposalFilters.js";
import { AIReqProposalRow } from "./AIReqProposalRow.js";

const EMPTY_FILTERS = { query: "", submitter: "all", version: "all" };
const PAGE_SIZE = 20;

export function AIReqProposalTable() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { query, submitter, version } = filters;
  const [page, setPage] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const projectId = ai.selection.projectId;
  const releases = ai.view?.releases.filter((item) => item.projectId === projectId) ?? [];
  const releaseTitles = new Map(releases.map(({ id, title }) => [id, title]));
  const releaseId =
    ai.selection.releaseId && releaseTitles.has(ai.selection.releaseId)
      ? ai.selection.releaseId
      : undefined;
  const groups = useMemo(
    () =>
      (ai.view?.requirements ?? [])
        .filter((item) => item.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [ai.view?.requirements, projectId],
  );
  const submitters = useMemo(
    () => [...new Set(groups.map((item) => item.submittedBy))].sort(),
    [groups],
  );
  const search = query.trim().toLocaleLowerCase();
  const hasFilters = Boolean(releaseId || search || submitter !== "all" || version !== "all");
  const filtered = groups.filter(
    (item) =>
      (!releaseId || item.releaseId === releaseId) &&
      (!search ||
        item.title.toLocaleLowerCase().includes(search) ||
        item.originalText.toLocaleLowerCase().includes(search) ||
        item.id.toLocaleLowerCase().includes(search)) &&
      (submitter === "all" || item.submittedBy === submitter) &&
      (version === "all" ||
        Boolean(item.documentVersion?.confirmation) === (version === "confirmed")),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const previousLabel = zh ? "上一页" : "Previous page";
  const nextLabel = zh ? "下一页" : "Next page";
  useLayoutEffect(() => setPage(0), [releaseId]);
  useLayoutEffect(() => {
    // 表格保留挂载，切页和改变筛选时从新结果的第一行读起。
    if (tableScroll.current) tableScroll.current.scrollTop = 0;
  }, [currentPage, releaseId, search, submitter, version]);
  return (
    <main
      aria-label={zh ? "需求共创" : "Co-creation"}
      className="@container/conversation h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
    >
      <div
        className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex h-full min-h-0 flex-col gap-4 pb-3 lg:pb-3`}
      >
        <header className="shrink-0">
          <ScopedPageTitle title={zh ? "需求共创" : "Co-creation"} />
        </header>
        <section
          aria-label={zh ? "需求列表" : "Requirements list"}
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-card-border bg-card text-foreground"
        >
          <div className="shrink-0 border-b border-border/60 px-3 py-3 @min-[760px]/conversation:px-4">
            <AIReqProposalFilters
              filters={filters}
              submitters={submitters}
              releases={releases}
              releaseId={releaseId}
              searchInput={searchInput}
              zh={zh}
              onChange={(field, value) => {
                setFilters((current) => ({ ...current, [field]: value }));
                setPage(0);
              }}
              onReleaseChange={(id) => {
                if (projectId) ai.openProject(projectId, id);
              }}
            />
          </div>
          <div ref={tableScroll} className="min-h-0 overflow-auto">
            <table
              role="table"
              className="w-full table-fixed text-left text-ui-base @max-[760px]/conversation:block"
            >
              <colgroup className="@max-[760px]/conversation:hidden">
                <col />
                <col className="w-42" />
                <col className="w-26" />
                <col className="w-36" />
                <col className="w-38" />
              </colgroup>
              <thead
                role="rowgroup"
                className="sticky top-0 z-10 bg-card text-ui-caption text-foreground-subtle @max-[760px]/conversation:sr-only"
              >
                <tr role="row" className="border-b border-border/60 text-left">
                  <th role="columnheader" scope="col" className="py-2 pl-4 text-left font-medium">
                    {zh ? "标题" : "Title"}
                  </th>
                  <th role="columnheader" scope="col" className="py-2 text-left font-medium">
                    {zh ? "需求编号" : "Requirement ID"}
                  </th>
                  <th role="columnheader" scope="col" className="py-2 text-left font-medium">
                    Release
                  </th>
                  <th role="columnheader" scope="col" className="py-2 text-left font-medium">
                    {zh ? "文档版本" : "Document version"}
                  </th>
                  <th role="columnheader" scope="col" className="py-2 pr-4 text-right font-medium">
                    {zh ? "操作" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup" className="@max-[760px]/conversation:block">
                {filtered
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map((item) => (
                    <AIReqProposalRow
                      key={item.id}
                      item={item}
                      releaseTitle={
                        releaseTitles.get(item.releaseId) ?? (zh ? "未分配" : "Unassigned")
                      }
                      search={search}
                      zh={zh}
                    />
                  ))}
                {!filtered.length && (
                  <tr role="row" className="@max-[760px]/conversation:block">
                    <td
                      role="cell"
                      colSpan={5}
                      className="px-4 py-10 text-center text-foreground-subtle @max-[760px]/conversation:block"
                    >
                      <p>
                        {groups.length
                          ? zh
                            ? "没有符合筛选条件的需求。"
                            : "No requirements match these filters."
                          : zh
                            ? "当前项目暂无需求。"
                            : "No requirements in this project yet."}
                      </p>
                      {!!groups.length && hasFilters && (
                        <Button
                          variant="ghost"
                          className="mt-2"
                          onClick={() => {
                            setFilters(EMPTY_FILTERS);
                            setPage(0);
                            if (releaseId && projectId) ai.openProject(projectId);
                            searchInput.current?.focus();
                          }}
                        >
                          {zh ? "清除筛选" : "Clear filters"}
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 @min-[760px]/conversation:px-4">
            <span className="text-ui-sm tabular-nums text-foreground-subtle" role="status">
              {hasFilters ? `${filtered.length} / ${groups.length}` : groups.length}{" "}
              {zh ? "条" : "items"}
            </span>
            {pageCount > 1 && (
              <nav
                aria-label={zh ? "需求分页" : "Requirement pages"}
                className="ml-auto flex shrink-0 items-center gap-2"
              >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={previousLabel}
                  title={previousLabel}
                  aria-disabled={currentPage === 0}
                  className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                  onClick={() => {
                    if (currentPage > 0) setPage(currentPage - 1);
                  }}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span role="status" className="text-ui-caption tabular-nums text-foreground-subtle">
                  <span aria-hidden="true">
                    {currentPage + 1} / {pageCount}
                  </span>
                  <span className="sr-only">
                    {zh
                      ? `第 ${currentPage + 1} 页，共 ${pageCount} 页`
                      : `Page ${currentPage + 1} of ${pageCount}`}
                  </span>
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={nextLabel}
                  title={nextLabel}
                  aria-disabled={currentPage + 1 >= pageCount}
                  className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                  onClick={() => {
                    if (currentPage + 1 < pageCount) setPage(currentPage + 1);
                  }}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </nav>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
