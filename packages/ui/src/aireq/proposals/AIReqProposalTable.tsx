import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIReqProposalColumnConfig } from "./AIReqProposalColumnConfig.js";
import { AIReqProposalFilters } from "./AIReqProposalFilters.js";
import { AIReqProposalRow } from "./AIReqProposalRow.js";
import { AIReqProposalListActions } from "./AIReqProposalListActions.js";
import { useProposalTablePreferences } from "./useProposalTablePreferences.js";

import {
  compareProposalValues,
  defaultProposalPreferences,
  defaultProposalSort,
  proposalColumns,
  proposalColumnValue,
  type ProposalColumn,
  type ProposalTablePreferences,
} from "./proposalColumns.js";

const EMPTY_FILTERS = { query: "", submitter: "all", version: "all", process: "all" };
const PAGE_SIZE = 20;

export function AIReqProposalTable() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const columnConfig = useProposalTablePreferences(zh);
  const { preferences } = columnConfig;
  const { columns, sort } = preferences;
  const collator = useMemo(() => new Intl.Collator(locale, { numeric: true }), [locale]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { query, submitter, version, process } = filters;
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
    () => (ai.view?.requirements ?? []).filter((item) => item.projectId === projectId),
    [ai.view?.requirements, projectId],
  );
  const submitters = useMemo(
    () => [...new Set(groups.map((item) => item.submittedBy).filter(Boolean))].sort(),
    [groups],
  );
  const processes = [
    ...new Set(groups.flatMap((item) => (item.process ? [item.process] : []))),
  ].sort(collator.compare);
  const search = query.trim().toLocaleLowerCase();
  const hasFilters = Boolean(
    releaseId || search || submitter !== "all" || version !== "all" || process !== "all",
  );
  const filtered = groups
    .filter(
      (item) =>
        (!releaseId || item.releaseId === releaseId) &&
        (!search ||
          item.title.toLocaleLowerCase().includes(search) ||
          item.originalText.toLocaleLowerCase().includes(search) ||
          item.id.toLocaleLowerCase().includes(search)) &&
        (submitter === "all" || `submitter:${item.submittedBy}` === submitter) &&
        (process === "all" || `process:${item.process}` === process) &&
        (version === "all" ||
          Boolean(item.documentVersion?.confirmation) === (version === "confirmed")),
    )
    .sort(
      (a, b) =>
        compareProposalValues(
          proposalColumnValue(a, sort.column, releaseTitles),
          proposalColumnValue(b, sort.column, releaseTitles),
          sort.direction,
          collator,
        ) || b.createdAt.localeCompare(a.createdAt),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  function updatePreferences(next: ProposalTablePreferences) {
    columnConfig.save(next);
    if (next.sort !== sort) setPage(0);
  }
  function sortBy(column: ProposalColumn) {
    updatePreferences({
      columns,
      sort: {
        column,
        direction:
          column === sort.column && sort.direction === "ascending" ? "descending" : "ascending",
      },
    });
  }
  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    if (releaseId && projectId) ai.openProject(projectId);
  }
  const actionsWidth = columns.includes("title") ? 152 : 184;
  const tableWidth = columns.reduce((width, column) => width + proposalColumns[column].width, 0);
  const previousLabel = zh ? "上一页" : "Previous page";
  const nextLabel = zh ? "下一页" : "Next page";
  useLayoutEffect(() => setPage(0), [releaseId]);
  useLayoutEffect(() => {
    // 表格保留挂载，切页和改变筛选时从新结果的第一行读起。
    if (tableScroll.current) tableScroll.current.scrollTop = 0;
  }, [currentPage, releaseId, search, submitter, version, process, sort]);
  return (
    <main
      aria-label={zh ? "需求共创" : "Co-creation"}
      className="@container/conversation h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-ui-base"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 px-3 pt-12 pb-3 2xl:px-6">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <ScopedPageTitle title={zh ? "需求共创" : "Co-creation"} />
          <AIReqProposalListActions key={ai.selection.releaseId ?? ""} zh={zh} />
        </header>
        <section
          aria-label={zh ? "需求列表" : "Requirements list"}
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-card-border bg-card text-foreground"
        >
          <div className="shrink-0 border-b border-border/60 px-3 py-3 @min-[760px]/conversation:px-4">
            <AIReqProposalFilters
              filters={filters}
              submitters={submitters}
              processes={processes}
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
              onClear={clearFilters}
            >
              <AIReqProposalColumnConfig
                columns={columns}
                disabled={!columnConfig.ready}
                saving={columnConfig.saving}
                error={columnConfig.error}
                zh={zh}
                onChange={(next) =>
                  updatePreferences({
                    columns: next,
                    sort: next.includes(sort.column) ? sort : defaultProposalSort,
                  })
                }
                onReset={() => updatePreferences(defaultProposalPreferences)}
                onRetry={columnConfig.retry}
              />
            </AIReqProposalFilters>
            {columnConfig.error && (
              <div className="mt-2 flex items-center gap-2">
                <p role="alert" className="text-ui-caption text-destructive">
                  {columnConfig.error}
                </p>
                <Button type="button" variant="outline" onClick={columnConfig.retry}>
                  {zh ? "重试" : "Retry"}
                </Button>
              </div>
            )}
          </div>
          <div
            ref={tableScroll}
            role="region"
            aria-label={zh ? "需求表格" : "Requirements table"}
            tabIndex={0}
            className="min-h-0 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused"
          >
            <table
              role="table"
              className="w-full table-fixed text-left text-ui-base [--actions-width:var(--wide-actions-width)] @max-[620px]/conversation:[--actions-width:48px]"
              style={
                {
                  "--wide-actions-width": `${actionsWidth}px`,
                  minWidth: `calc(${tableWidth}px + var(--actions-width))`,
                } as CSSProperties
              }
            >
              <colgroup>
                {columns.map((column) => (
                  <col
                    key={column}
                    style={
                      column === "title" ? undefined : { width: proposalColumns[column].width }
                    }
                  />
                ))}
                <col className="w-(--actions-width)" />
              </colgroup>
              <thead
                role="rowgroup"
                className="sticky top-0 z-20 bg-card text-ui-caption text-foreground-subtle"
              >
                <tr role="row" className="border-b border-border/60">
                  {columns.map((column) => {
                    const direction = sort.column === column ? sort.direction : undefined;
                    const Indicator =
                      direction === "ascending"
                        ? ChevronUp
                        : direction === "descending"
                          ? ChevronDown
                          : ChevronsUpDown;
                    return (
                      <th
                        key={column}
                        scope="col"
                        aria-sort={direction}
                        className={`px-3 py-1 text-left first:pl-4 ${column === "title" || column === "id" ? "first:@min-[760px]/conversation:sticky first:@min-[760px]/conversation:left-0 first:@min-[760px]/conversation:bg-card" : ""}`}
                      >
                        <button
                          type="button"
                          disabled={!columnConfig.ready}
                          onClick={() => sortBy(column)}
                          className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-sm text-left font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused"
                        >
                          {proposalColumns[column][zh ? "zh" : "en"]}
                          <Indicator
                            aria-hidden="true"
                            className={`size-3.5 shrink-0 ${direction ? "text-foreground" : ""}`}
                          />
                        </button>
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="sticky right-0 z-10 border-l border-border bg-card py-2 pr-4 text-right font-medium @max-[620px]/conversation:pr-0 @max-[620px]/conversation:text-center"
                  >
                    {zh ? "操作" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {filtered
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map((item) => (
                    <AIReqProposalRow
                      key={item.id}
                      item={item}
                      columns={columns}
                      releaseTitle={
                        releaseTitles.get(item.releaseId) ?? (zh ? "未分配" : "Unassigned")
                      }
                      search={search}
                      zh={zh}
                    />
                  ))}
                {!filtered.length && (
                  <tr role="row">
                    <td
                      role="cell"
                      colSpan={columns.length + 1}
                      className="px-4 py-10 text-center text-foreground-subtle"
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
                            clearFilters();
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
