import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIReqProposalColumnFilter } from "./AIReqProposalColumnFilter.js";
import { AIReqProposalColumnConfig } from "./AIReqProposalColumnConfig.js";
import { AIReqProposalFilters } from "./AIReqProposalFilters.js";
import { AIReqProposalRow } from "./AIReqProposalRow.js";
import { AIReqProposalListActions } from "./AIReqProposalListActions.js";
import { useProposalTablePreferences } from "./useProposalTablePreferences.js";

import {
  compareProposalValues,
  defaultProposalPreferences,
  defaultProposalSort,
  isFilterableProposalColumn,
  proposalFilterValues,
  proposalColumns,
  proposalColumnValue,
  visibleProposalColumns,
  type ProposalColumn,
  type ProposalColumnFilters,
  type ProposalTablePreferences,
} from "./proposalColumns.js";

const EMPTY_FILTERS: ProposalColumnFilters = {};
const EMPTY_SELECTION: string[] = [];
const PAGE_SIZE = 20;

export function AIReqProposalTable() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const columnConfig = useProposalTablePreferences(zh);
  const { preferences } = columnConfig;
  const { columns: configuredColumns, sort } = preferences;
  const collator = useMemo(() => new Intl.Collator(locale, { numeric: true }), [locale]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const [{ width: tableViewportWidth, hasStart, hasEnd }, setTableViewport] = useState({
    width: 0,
    hasStart: false,
    hasEnd: false,
  });
  const autoFit = preferences.autoFit === true;
  const actionsWidth = configuredColumns.includes("title") ? 152 : 184;
  const columns = visibleProposalColumns(preferences, tableViewportWidth, actionsWidth);
  const firstColumn = columns[0];
  const pinnedIdentity = firstColumn === "title" || firstColumn === "id" ? firstColumn : undefined;
  const showDwellTime = columns.includes("dwellTime") || sort.column === "dwellTime";
  const [now, setNow] = useState(Date.now);
  const projectId = ai.selection.projectId;
  const releaseTitles = useMemo(
    () =>
      new Map(
        ai.view?.releases
          .filter((item) => item.projectId === projectId)
          .map(({ id, title }) => [id, title]),
      ),
    [ai.view?.releases, projectId],
  );
  const releaseId =
    ai.selection.releaseId && releaseTitles.has(ai.selection.releaseId)
      ? ai.selection.releaseId
      : undefined;
  const groups = useMemo(
    () => (ai.view?.requirements ?? []).filter((item) => item.projectId === projectId),
    [ai.view?.requirements, projectId],
  );
  const scopedGroups = useMemo(
    () => (releaseId ? groups.filter((item) => item.releaseId === releaseId) : groups),
    [groups, releaseId],
  );
  const search = query.trim().toLocaleLowerCase();
  const applied = useMemo(() => Object.entries(filters) as [ProposalColumn, string[]][], [filters]);
  const hasFilters = Boolean(search || applied.length);
  const sortClock = sort.column === "dwellTime" ? now : 0;
  const filtered = useMemo(() => {
    const selected = applied.map(([column, values]) => [column, new Set(values)] as const);
    return scopedGroups
      .filter(
        (item) =>
          (!search ||
            item.title.toLocaleLowerCase().includes(search) ||
            item.originalText.toLocaleLowerCase().includes(search) ||
            item.id.toLocaleLowerCase().includes(search)) &&
          selected.every(([column, values]) =>
            proposalFilterValues(item, column).some((value) => values.has(value)),
          ),
      )
      .sort(
        (a, b) =>
          compareProposalValues(
            proposalColumnValue(a, sort.column, releaseTitles, sortClock),
            proposalColumnValue(b, sort.column, releaseTitles, sortClock),
            sort.direction,
            collator,
          ) || b.createdAt.localeCompare(a.createdAt),
      );
  }, [applied, scopedGroups, search, sort, releaseTitles, sortClock, collator]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const pageRange = pageStart + 1 === pageEnd ? String(pageEnd) : `${pageStart + 1}–${pageEnd}`;
  const countText = hasFilters
    ? zh
      ? `匹配 ${filtered.length} 条 · 当前范围共 ${scopedGroups.length} 条`
      : `${filtered.length} matches · ${scopedGroups.length} in scope`
    : zh
      ? `共 ${scopedGroups.length} 条需求`
      : `${scopedGroups.length} requirements`;
  function updatePreferences(next: ProposalTablePreferences) {
    columnConfig.save(next);
    if (next.sort !== sort) setPage(0);
  }
  function sortBy(column: ProposalColumn) {
    updatePreferences({
      ...preferences,
      sort: {
        column,
        direction:
          column === sort.column && sort.direction === "ascending" ? "descending" : "ascending",
      },
    });
  }
  function setColumnFilter(column: ProposalColumn, values: string[]) {
    setFilters((current) => {
      const next = { ...current };
      if (values.length) next[column] = values;
      else delete next[column];
      return next;
    });
    setPage(0);
  }
  function clearFilters() {
    setQuery("");
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }
  const tableWidth = columns.reduce((width, column) => width + proposalColumns[column].width, 0);
  const previousLabel = zh ? "上一页" : "Previous page";
  const nextLabel = zh ? "下一页" : "Next page";
  useLayoutEffect(() => {
    const viewport = tableScroll.current;
    const table = viewport?.firstElementChild;
    if (!viewport || !table) return;
    // 同时监听外部面板尺寸与表格列宽。横滚只在越过固定列边界时更新显示。
    const measure = () => {
      const width = viewport.clientWidth;
      const hasStart = viewport.scrollLeft > 1;
      const hasEnd = viewport.scrollWidth - width - viewport.scrollLeft > 1;
      setTableViewport((current) =>
        current.width === width && current.hasStart === hasStart && current.hasEnd === hasEnd
          ? current
          : { width, hasStart, hasEnd },
      );
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(viewport);
    observer.observe(table);
    viewport.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  useEffect(() => {
    if (!showDwellTime) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [showDwellTime]);
  useLayoutEffect(() => setPage(0), [releaseId]);
  useLayoutEffect(() => {
    // 表格保留挂载，切页和改变筛选时从新结果的第一行读起。
    if (tableScroll.current) tableScroll.current.scrollTop = 0;
  }, [currentPage, releaseId, search, filters, sort]);
  return (
    <main
      data-aireq-themed-page
      aria-label={zh ? "需求共创" : "Co-creation"}
      className="@container/conversation h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-ui-base"
    >
      {/* 工作台外壳已预留页头顶部空间，与「所有项目」共用同一标题基线。 */}
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 px-3 pb-3 2xl:px-6">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <ScopedPageTitle title={zh ? "需求共创" : "Co-creation"} />
          <AIReqProposalListActions key={ai.selection.releaseId ?? ""} zh={zh} />
        </header>
        <section
          aria-label={zh ? "需求列表" : "Requirements list"}
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-card-border bg-card text-foreground"
        >
          <div
            data-aireq-theme-filters
            className="shrink-0 border-b border-border/60 px-3 py-3 @min-[760px]/conversation:px-4"
          >
            <AIReqProposalFilters
              query={query}
              applied={applied}
              hasFilters={hasFilters}
              releaseTitles={releaseTitles}
              items={groups}
              collator={collator}
              searchInput={searchInput}
              zh={zh}
              onSearch={(value) => {
                setQuery(value);
                setPage(0);
              }}
              onChangeColumn={setColumnFilter}
              onClear={clearFilters}
            >
              <AIReqProposalColumnConfig
                columns={configuredColumns}
                autoFit={autoFit}
                disabled={!columnConfig.ready}
                saving={columnConfig.saving}
                error={columnConfig.error}
                zh={zh}
                onChange={(next, fit = false) =>
                  updatePreferences({
                    autoFit: fit,
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
            data-scrolled-start={hasStart || undefined}
            data-scrolled-end={hasEnd || undefined}
            className="min-h-0 overflow-auto scroll-pr-(--actions-width) outline-none [--actions-width:var(--wide-actions-width)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-input-border-focused data-[scrolled-end=true]:[&_[data-pinned=end]]:shadow-[-4px_0_8px_-5px_var(--color-foreground-subtle)] @max-[620px]/conversation:[--actions-width:48px] @min-[760px]/conversation:scroll-pl-(--identity-width) @min-[760px]/conversation:data-[scrolled-start=true]:[&_[data-pinned=start]]:shadow-[4px_0_8px_-5px_var(--color-foreground-subtle)]"
            style={
              {
                "--wide-actions-width": `${actionsWidth}px`,
                "--identity-width": `${pinnedIdentity ? proposalColumns[pinnedIdentity].width : 0}px`,
              } as CSSProperties
            }
          >
            <table
              role="table"
              className="w-full table-fixed text-left text-ui-base"
              style={{ minWidth: `calc(${tableWidth}px + var(--actions-width))` }}
            >
              <colgroup>
                {columns.map((column) => (
                  <col key={column} style={{ width: proposalColumns[column].width }} />
                ))}
                {/* 剩余宽度留在操作列前，避免固定宽度的标题和其他字段被拉伸。 */}
                <col />
                <col className="w-(--actions-width)" />
              </colgroup>
              <thead
                role="rowgroup"
                className="sticky top-0 z-20 bg-card text-ui-caption text-foreground"
              >
                <tr role="row" className="border-b border-border/60">
                  {columns.map((column) => {
                    const numeric = proposalColumns[column].group === "number";
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
                        data-pinned={pinnedIdentity === column ? "start" : undefined}
                        className={`px-3 py-1 first:pl-4 ${numeric ? "text-right" : "text-left"} ${pinnedIdentity === column ? "first:@min-[760px]/conversation:sticky first:@min-[760px]/conversation:left-0 first:@min-[760px]/conversation:z-10 first:@min-[760px]/conversation:bg-card" : ""}`}
                      >
                        {isFilterableProposalColumn(column) ? (
                          <AIReqProposalColumnFilter
                            column={column}
                            items={groups}
                            selected={filters[column] ?? EMPTY_SELECTION}
                            releaseTitles={releaseTitles}
                            collator={collator}
                            zh={zh}
                            onChange={(values) => setColumnFilter(column, values)}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={!columnConfig.ready}
                            onClick={() => sortBy(column)}
                            data-sorted={direction ? true : undefined}
                            className="-mx-1 inline-flex min-h-8 max-w-[calc(100%+0.5rem)] items-center gap-1 rounded-sm px-1 text-left font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focused data-[sorted=true]:bg-selected"
                          >
                            {proposalColumns[column][zh ? "zh" : "en"]}
                            <Indicator
                              aria-hidden="true"
                              className={`size-3.5 shrink-0 ${direction ? "text-foreground" : "text-foreground-subtle"}`}
                            />
                          </button>
                        )}
                      </th>
                    );
                  })}
                  <th role="presentation" aria-hidden="true" />
                  <th
                    scope="col"
                    data-pinned="end"
                    className="sticky right-0 z-10 border-l border-border bg-card py-2 pr-4 text-right font-medium @max-[620px]/conversation:pr-0 @max-[620px]/conversation:text-center"
                  >
                    {zh ? "操作" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {filtered.slice(pageStart, pageEnd).map((item) => (
                  <AIReqProposalRow
                    key={item.id}
                    item={item}
                    columns={columns}
                    releaseTitle={
                      releaseTitles.get(item.releaseId) ?? (zh ? "未分配" : "Unassigned")
                    }
                    search={search}
                    now={now}
                    zh={zh}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <div className="border-t border-border/60 px-4 py-8 text-center text-ui-base">
              <p className="font-medium">
                {scopedGroups.length && hasFilters
                  ? zh
                    ? "没有符合筛选条件的需求。"
                    : "No requirements match these filters."
                  : releaseId
                    ? zh
                      ? "当前 PI 暂无需求。"
                      : "No requirements in this PI yet."
                    : zh
                      ? "当前项目暂无需求。"
                      : "No requirements in this project yet."}
              </p>
              {!!scopedGroups.length && hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    clearFilters();
                    searchInput.current?.focus();
                  }}
                >
                  {zh ? "清除筛选" : "Clear filters"}
                </Button>
              )}
            </div>
          )}
          <footer className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 @min-[760px]/conversation:px-4">
            <span className="text-ui-sm tabular-nums text-foreground-subtle" role="status">
              {countText}
              {pageCount > 1 && (
                <span className="ml-2">
                  {zh ? `· 第 ${pageRange} 条` : `· Showing ${pageRange}`}
                </span>
              )}
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
