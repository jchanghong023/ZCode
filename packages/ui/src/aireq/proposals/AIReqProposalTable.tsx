// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import {
  AIReqProposalCreateDialog,
  AIReqProposalReleaseField,
} from "./AIReqProposalCreateDialog.js";
import { AIReqProposalRow } from "./AIReqProposalRow.js";
import { AIReqProposalSavedNotice, type SavedProposal } from "./AIReqProposalSavedNotice.js";

export function AIReqProposalTable() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [query, setQuery] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const dirty = Boolean(text);
  const createOpen = Boolean(ai.proposalDraft);
  const [targetReleaseId, setTargetReleaseId] = useState<string>();
  const draftReleaseId = targetReleaseId ?? ai.releaseId;
  const createButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedProposal, setSavedProposal] = useState<SavedProposal>();
  const clarificationAction = useRef<HTMLButtonElement>(null);
  const focusClarificationAfterSave = useRef(false);
  const [focusSavedWhenReady, setFocusSavedWhenReady] = useState(false);
  const submitting = useRef(false);
  const [operationId, setOperationId] = useState(() => createUuid());
  const [baseline, setBaseline] = useState<number>();
  const { setDraftNavigationGuard } = ai;
  const groups = useMemo(
    () =>
      (ai.view?.requirements ?? []).filter(
        (item) => item.projectId === ai.selection.projectId && item.releaseId === ai.releaseId,
      ),
    [ai.view?.requirements, ai.selection.projectId, ai.releaseId],
  );
  const releases = ai.selectionReady
    ? ai.view?.releases.filter((item) => item.projectId === ai.selection.projectId)
    : undefined;
  useEffect(() => {
    if (!createOpen) setTargetReleaseId(undefined);
  }, [createOpen]);
  useEffect(() => {
    if (
      createOpen ||
      !focusSavedWhenReady ||
      !ai.selectionReady ||
      ai.releaseId !== savedProposal?.releaseId
    )
      return;
    const button = clarificationAction.current;
    if (!button || button.closest("[hidden], [inert]")) return;
    setFocusSavedWhenReady(false);
    button.focus();
  }, [createOpen, focusSavedWhenReady, savedProposal, ai.releaseId, ai.selectionReady]);
  // 修复：列表保持挂载以恢复筛选，切换项目时不能沿用上一个项目的筛选条件。
  useEffect(() => {
    setQuery("");
    setSubmitter("");
    setPage(0);
  }, [ai.selection.projectId]);
  useEffect(() => {
    if (!dirty && !busy) return;
    // 原生确认框与应用交互不一致；暂存一次导航，待应用内确认后再执行。
    setDraftNavigationGuard((navigate) => {
      // 保存锁必须覆盖所有导航入口，不能仅禁用弹窗按钮而让历史后退绕过在途写入。
      if (submitting.current) return;
      if (pendingNavigation.current) return;
      pendingNavigation.current = navigate;
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDiscardOpen(true);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setDraftNavigationGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, busy, setDraftNavigationGuard]);
  const search = query.trim().toLocaleLowerCase();
  const employeeSearch = submitter.trim().toLowerCase();
  const hasFilters = Boolean(search || employeeSearch);
  const filtered = groups.filter(
    (item) =>
      (!search ||
        item.title.toLocaleLowerCase().includes(search) ||
        item.originalText.toLocaleLowerCase().includes(search) ||
        item.id.toLocaleLowerCase().includes(search)) &&
      (!employeeSearch || item.submittedBy.toLowerCase().includes(employeeSearch)),
  );
  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  useLayoutEffect(() => {
    // 表格保留挂载，切页和改变筛选时从新结果的第一行读起。
    if (tableScroll.current) tableScroll.current.scrollTop = 0;
  }, [ai.releaseId, currentPage, employeeSearch, search]);
  const ready = releases?.some((release) => release.id === draftReleaseId) ?? false;
  const releaseSelector = (
    <AIReqProposalReleaseField
      releaseId={draftReleaseId}
      releases={releases}
      busy={busy}
      onChange={(id) => {
        // 表单内选择的版本在保存成功后才成为列表范围。
        setTargetReleaseId(id);
        setBaseline(undefined);
        setOperationId(createUuid());
      }}
    />
  );
  const close = () => ai.navigate(ai.closeProposalDraft);
  const rebase = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await ai.refresh();
      // 只更新下次显式提交的 CAS 基线，保留原文和操作 ID。
      setBaseline(undefined);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const submit = async () => {
    if (submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    const expectedRevision = baseline ?? ai.view?.revision ?? 0;
    setBaseline(expectedRevision);
    try {
      const result = await ai.command({
        type: "createProposal",
        projectId: ai.selection.projectId,
        releaseId: draftReleaseId,
        originalText: text,
        operationId: `${ai.proposalDraft?.id ?? "proposal"}:${operationId}`,
        expectedRevision,
      });
      if (result?.receipt.status === "completed") {
        if (result.irId) {
          // 使用成功回执定位本次提案，避免筛选或同名提案让入口打开错误对象。
          setSavedProposal({
            projectId: result.projectId,
            releaseId: draftReleaseId,
            irId: result.irId,
          });
          focusClarificationAfterSave.current = true;
        }
        setDraftNavigationGuard(null);
        setText("");
        ai.completeProposalDraft(draftReleaseId);
        setOperationId(createUuid());
        setBaseline(undefined);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <main
      aria-label={zh ? "需求共创" : "Co-creation"}
      className="@container/conversation h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
    >
      <div
        className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex h-full min-h-0 flex-col gap-4 pb-2 lg:pb-2`}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <ScopedPageTitle title={zh ? "需求共创" : "Co-creation"} />
          <Button
            ref={createButton}
            className="ml-auto"
            data-testid="new-requirement"
            disabled={busy}
            onClick={() => {
              setBaseline(undefined);
              ai.startProposalDraft();
            }}
          >
            {zh ? "新建需求" : "New requirement"}
          </Button>
        </header>
        <AIReqProposalSavedNotice target={savedProposal} buttonRef={clarificationAction} zh={zh} />
        <div className="grid shrink-0 gap-2 @min-[520px]/conversation:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="relative min-w-0">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
            />
            <Input
              ref={searchInput}
              aria-label={
                zh ? "搜索需求名称或原始需求" : "Search requirement name or original request"
              }
              placeholder={
                zh ? "搜索需求名称或原始需求" : "Search requirement name or original request"
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              className="h-9 rounded-lg bg-surface pl-9"
            />
          </div>
          <Input
            aria-label={zh ? "筛选提交人工号" : "Filter by submitter ID"}
            placeholder={zh ? "提交人工号" : "Submitter ID"}
            value={submitter}
            onChange={(event) => {
              setSubmitter(event.target.value);
              setPage(0);
            }}
            className="h-9 min-w-0 rounded-lg bg-surface"
          />
        </div>
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
              <col className="hidden w-28 @min-[640px]/conversation:table-column" />
              <col className="w-40 @min-[640px]/conversation:w-56 @min-[740px]/conversation:w-80" />
            </colgroup>
            <thead
              role="rowgroup"
              className="sticky top-0 z-10 bg-card @max-[520px]/conversation:sr-only"
            >
              <tr role="row" className="border-b border-border">
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">
                  {zh ? "需求" : "Requirement"}
                </th>
                <th
                  role="columnheader"
                  scope="col"
                  className="hidden px-4 py-3 font-medium @min-[640px]/conversation:table-cell"
                >
                  {zh ? "文档版本" : "Document version"}
                </th>
                <th role="columnheader" scope="col" className="px-4 py-3 text-right font-medium">
                  {zh ? "操作" : "Actions"}
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="@max-[520px]/conversation:block">
              {filtered.slice(currentPage * 20, currentPage * 20 + 20).map((item) => (
                <AIReqProposalRow key={item.id} item={item} zh={zh} />
              ))}
              {!filtered.length && (
                <tr role="row" className="@max-[520px]/conversation:block">
                  <td
                    role="cell"
                    colSpan={3}
                    className="p-6 text-foreground-subtle @max-[520px]/conversation:block"
                  >
                    {groups.length
                      ? zh
                        ? "没有符合筛选条件的需求。"
                        : "No requirements match these filters."
                      : zh
                        ? "当前版本暂无需求。"
                        : "No requirements in this release yet."}
                    {!!groups.length && hasFilters && (
                      <Button
                        variant="ghost"
                        className="ml-2"
                        onClick={() => {
                          setQuery("");
                          setSubmitter("");
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
        <AIReqProposalCreateDialog
          busy={busy}
          ready={ready}
          hasReleases={Boolean(releases?.length)}
          releaseField={releaseSelector}
          text={text}
          onTextChange={(value) => {
            setText(value);
            setBaseline(undefined);
            setOperationId(createUuid());
          }}
          onClose={close}
          onRetry={() => void rebase()}
          onSave={() => void submit()}
          onCloseAutoFocus={(event) => {
            const afterSave = focusClarificationAfterSave.current;
            focusClarificationAfterSave.current = false;
            if (afterSave) {
              // 必须等 Dialog 释放锁再交给成功提示，跨版本仍在读取时延后交焦。
              event.preventDefault();
              setFocusSavedWhenReady(true);
              return;
            }
            const button = createButton.current;
            if (!button?.isConnected || button.closest("[hidden], [inert]")) return;
            event.preventDefault();
            // Dialog 释放焦点锁之后才能聚焦原入口，页面恢复时提前 focus 会被弹窗拦住。
            button.focus({ preventScroll: true });
          }}
        />
        <AlertDialog
          open={discardOpen}
          onOpenChange={(open) => {
            setDiscardOpen(open);
            if (!open) pendingNavigation.current = null;
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              // 受控确认没有 Trigger；历史后退取消也须恢复表单原控件，而非落到 body。
              if (returnFocus.current?.isConnected) {
                event.preventDefault();
                returnFocus.current.focus({ preventScroll: true });
              }
              returnFocus.current = null;
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>丢弃未保存的内容？</AlertDialogTitle>
              <AlertDialogDescription>
                当前需求原文尚未保存。丢弃后，本次需求不会被创建。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>继续编辑</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  const next = pendingNavigation.current;
                  pendingNavigation.current = null;
                  returnFocus.current = null;
                  setDraftNavigationGuard(null);
                  setText("");
                  // 修复：暂存的导航已包含关闭弹窗或恢复历史，重复关闭会多退一页。
                  next?.();
                }}
              >
                丢弃并离开
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}
