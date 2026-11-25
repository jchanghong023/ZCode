import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const releaseId = ai.view?.releases.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.releaseId,
  )?.id;
  const groups = useMemo(
    () =>
      (ai.view?.requirements ?? [])
        .filter(
          (item) =>
            item.projectId === ai.selection.projectId &&
            (!releaseId || item.releaseId === releaseId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [ai.view?.requirements, ai.selection.projectId, releaseId],
  );
  const submitters = useMemo(
    () => [...new Set(groups.map((item) => item.submittedBy))].sort(),
    [groups],
  );
  const search = query.trim().toLocaleLowerCase();
  const hasFilters = Boolean(search || submitter !== "all" || version !== "all");
  const filtered = groups.filter(
    (item) =>
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
  useLayoutEffect(() => {
    // 表格保留挂载，切页和改变筛选时从新结果的第一行读起。
    if (tableScroll.current) tableScroll.current.scrollTop = 0;
  }, [currentPage, search, submitter, version]);
  return (
    <main
      aria-label={zh ? "需求共创" : "Co-creation"}
      className="@container/conversation h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
    >
      <div
        className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex h-full min-h-0 flex-col gap-4 pb-2 lg:pb-2`}
      >
        <header className="shrink-0">
          <ScopedPageTitle title={zh ? "需求共创" : "Co-creation"} />
        </header>
        <AIReqProposalFilters
          filters={filters}
          submitters={submitters}
          searchInput={searchInput}
          zh={zh}
          onChange={(field, value) => {
            setFilters((current) => ({ ...current, [field]: value }));
            setPage(0);
          }}
        />
        {/* 原表格透出页面底色；复用外观页卡片配色，粘性表头也保持不透明。 */}
        <div
          ref={tableScroll}
          className="min-h-0 overflow-auto rounded-xl border border-card-border bg-card text-foreground"
        >
          <table
            role="table"
            className="w-full table-fixed text-left text-ui-base @max-[520px]/conversation:block"
          >
            <colgroup className="@max-[520px]/conversation:hidden">
              <col />
              <col className="w-38 @min-[740px]/conversation:w-44" />
              <col className="hidden w-40 @min-[780px]/conversation:table-column @min-[980px]/conversation:w-48" />
              <col className="w-40 @min-[780px]/conversation:w-56 @min-[980px]/conversation:w-80" />
            </colgroup>
            <thead
              role="rowgroup"
              className="sticky top-0 z-10 bg-card @max-[520px]/conversation:sr-only"
            >
              <tr role="row" className="border-b border-border">
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">
                  {zh ? "标题" : "Title"}
                </th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">
                  {zh ? "需求编号" : "Requirement ID"}
                </th>
                <th
                  role="columnheader"
                  scope="col"
                  className="hidden px-4 py-3 font-medium @min-[780px]/conversation:table-cell"
                >
                  {zh ? "文档版本" : "Document version"}
                </th>
                <th role="columnheader" scope="col" className="px-4 py-3 text-right font-medium">
                  {zh ? "操作" : "Actions"}
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="@max-[520px]/conversation:block">
              {filtered
                .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                .map((item) => (
                  <AIReqProposalRow key={item.id} item={item} search={search} zh={zh} />
                ))}
              {!filtered.length && (
                <tr role="row" className="@max-[520px]/conversation:block">
                  <td
                    role="cell"
                    colSpan={4}
                    className="p-6 text-foreground-subtle @max-[520px]/conversation:block"
                  >
                    {groups.length
                      ? zh
                        ? "没有符合筛选条件的需求。"
                        : "No requirements match these filters."
                      : zh
                        ? "当前项目暂无需求。"
                        : "No requirements in this project yet."}
                    {!!groups.length && hasFilters && (
                      <Button
                        variant="ghost"
                        className="ml-2"
                        onClick={() => {
                          setFilters(EMPTY_FILTERS);
                          setPage(0);
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
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2">
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
                variant="outline"
                aria-disabled={currentPage === 0}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                onClick={() => {
                  if (currentPage > 0) setPage(currentPage - 1);
                }}
              >
                {zh ? "上一页" : "Previous page"}
              </Button>
              <span role="status">
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
                variant="outline"
                aria-disabled={currentPage + 1 >= pageCount}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                onClick={() => {
                  if (currentPage + 1 < pageCount) setPage(currentPage + 1);
                }}
              >
                {zh ? "下一页" : "Next page"}
              </Button>
            </nav>
          )}
        </footer>
      </div>
    </main>
  );
}
