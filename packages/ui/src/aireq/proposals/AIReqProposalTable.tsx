import { formatUserFacingError } from "@/lib/errorMessage.js";
// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import {
  checkMarkdownSections,
  PROPOSAL_STATE_GROUPS,
  PROPOSAL_STATE_OPTIONS,
  proposalState,
} from "../contract.js";
import { downloadProposalCsv, parseProposalCsv, ProposalCsvError } from "./proposal-csv.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { businessDocumentRequest } from "./proposal-markdown.js";
import {
  AIReqProposalCreateDialog,
  AIReqProposalReleaseField,
} from "./AIReqProposalCreateDialog.js";
import { AIReqProposalExport } from "./AIReqProposalExport.js";
import { AIReqProposalRow } from "./AIReqProposalRow.js";
import { AIReqProposalSavedNotice, type SavedProposal } from "./AIReqProposalSavedNotice.js";

export function AIReqProposalTable({
  overviewCreateTrigger,
}: {
  overviewCreateTrigger: RefObject<HTMLButtonElement | null>;
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [query, setQuery] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [phase, setPhase] = useState("");
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const importOpen = ai.proposalImportOpen;
  const createOpen = Boolean(ai.proposalDraft);
  const [targetReleaseId, setTargetReleaseId] = useState<string>();
  const draftReleaseId = targetReleaseId ?? ai.releaseId;
  const createButton = useRef<HTMLButtonElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [importFormat, setImportFormat] = useState<"csv" | "markdown">("csv");
  const [documentRequest, setDocumentRequest] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedProposal, setSavedProposal] = useState<SavedProposal>();
  const clarificationAction = useRef<HTMLButtonElement>(null);
  const focusClarificationAfterSave = useRef(false);
  const [focusSavedWhenReady, setFocusSavedWhenReady] = useState(false);
  const submitting = useRef(false);
  const [operationId, setOperationId] = useState(() => createUuid());
  const [baseline, setBaseline] = useState<number>();
  const fileGeneration = useRef(0);
  const { setDraftNavigationGuard } = ai;
  const groups = useMemo(
    () =>
      (ai.view?.drafts ?? []).filter(
        (item) => item.projectId === ai.selection.projectId && item.releaseId === ai.releaseId,
      ),
    [ai.view?.drafts, ai.selection.projectId, ai.releaseId],
  );
  const releases = (ai.view?.releases ?? []).filter(
    (item) => item.projectId === ai.selection.projectId,
  );
  useEffect(() => {
    if (!createOpen && !importOpen) setTargetReleaseId(undefined);
  }, [createOpen, importOpen]);
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
  // 修复：预览可以先于 Release 选择；保留 CSV 原文并按当前范围重算重复行，避免沿用旧版本提示。
  const parsedCsv = useMemo(() => {
    if (fileContent === null || importFormat !== "csv") return { preview: null, error: "" };
    try {
      return {
        preview: parseProposalCsv(
          fileContent,
          (ai.view?.drafts ?? [])
            .filter(
              (item) =>
                item.projectId === ai.selection.projectId && item.releaseId === draftReleaseId,
            )
            .map((item) => item.originalText),
        ),
        error: "",
      };
    } catch (error) {
      return {
        preview: null,
        error:
          error instanceof ProposalCsvError
            ? error.message
            : formatUserFacingError(error, "CSV 解析失败，请检查文件格式。"),
      };
    }
  }, [fileContent, importFormat, ai.view?.drafts, ai.selection.projectId, draftReleaseId]);
  const preview = parsedCsv.preview;
  const csvError = fileError || parsedCsv.error;
  const businessDocument = importFormat === "markdown" ? fileContent : null;
  const requiredSections = ai.view?.documentFormats["requirements.md"];
  const sectionIssues = useMemo(
    () =>
      businessDocument === null || !requiredSections
        ? []
        : checkMarkdownSections(businessDocument, requiredSections),
    [businessDocument, requiredSections],
  );
  const proposals =
    businessDocument !== null
      ? [{ originalText: documentRequest, businessDocument }]
      : (preview?.texts.map((originalText) => ({ originalText })) ?? []);
  // 文件读取及格式错误也属于用户输入；仅以成功预览判断会让这些状态无提示丢失。
  const dirty = Boolean(text || (importOpen && fileName));
  // 修复：列表保持挂载以恢复筛选，切换项目时不能沿用上一个项目的筛选条件。
  useEffect(() => {
    setQuery("");
    setSubmitter("");
    setPhase("");
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
  }, [dirty, busy, setDraftNavigationGuard, ai]);
  useEffect(
    () => () => {
      fileGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    if (!importOpen) return;
    // 修复：浏览器后退关闭导入后，迟到的文件读取不能污染下次打开的预览。
    const generation = fileGeneration;
    return () => {
      generation.current++;
    };
  }, [importOpen]);
  const search = query.trim().toLocaleLowerCase();
  const filtered = groups.filter(
    (item) =>
      (!search ||
        item.title.toLocaleLowerCase().includes(search) ||
        item.originalText.toLocaleLowerCase().includes(search) ||
        item.id.toLocaleLowerCase().includes(search)) &&
      (!submitter || item.submittedBy.includes(submitter)) &&
      (!phase || proposalState(item) === phase),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const ready = releases.some((release) => release.id === draftReleaseId);
  const releaseSelector = (
    <AIReqProposalReleaseField
      releaseId={draftReleaseId}
      releases={releases}
      busy={busy}
      onChange={(id) => {
        // 选中的版本属于草稿。原列表、历史和概览返回来源只在成功回执后更新。
        setTargetReleaseId(id);
        setBaseline(undefined);
        setOperationId(createUuid());
      }}
    />
  );
  // 关闭时保留预览供退场动画使用；重新打开导入时再清空，关闭后不算草稿。
  const close = () =>
    ai.navigate(() => {
      fileGeneration.current++;
      ai.closeProposalDraft();
    });
  const rebase = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await ai.refresh();
      // 修复：只更新下次显式提交的 CAS 基线；保留原文、预览和操作 ID，不自动重放写入。
      setBaseline(undefined);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const submit = async (kind: "create" | "import") => {
    if (submitting.current || !ready) return;
    if (
      kind === "import" &&
      (!proposals.length || proposals.some((entry) => !entry.originalText.trim()))
    )
      return;
    submitting.current = true;
    setBusy(true);
    const expectedRevision = baseline ?? ai.view?.revision ?? 0;
    setBaseline(expectedRevision);
    try {
      const result = await ai.command(
        kind === "create"
          ? {
              type: "createProposal",
              projectId: ai.selection.projectId,
              releaseId: draftReleaseId,
              originalText: text,
              sourceIrId: ai.proposalDraft?.sourceIrId,
              operationId: `${ai.proposalDraft?.id ?? "proposal"}:${operationId}`,
              expectedRevision,
            }
          : {
              type: "importProposals",
              projectId: ai.selection.projectId,
              releaseId: draftReleaseId,
              proposals,
              operationId,
              expectedRevision,
            },
      );
      if (result?.receipt.status === "completed") {
        if (kind === "create" && result.irId) {
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
        fileGeneration.current++;
        setFileContent(null);
        setDocumentRequest("");
        setFileName("");
        setFileError("");
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
      aria-label={zh ? "需求提案" : "Proposals"}
      className="@container/conversation h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
    >
      <div
        className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex h-full min-h-0 flex-col gap-4 pb-2 lg:pb-2`}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <ScopedPageTitle title={zh ? "需求共创" : "Co-creation"} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              ref={createButton}
              data-testid="new-requirement"
              disabled={busy}
              onClick={() => {
                setBaseline(undefined);
                ai.startProposalDraft();
              }}
            >
              {zh ? "新建需求" : "New requirement"}
            </Button>
            <Button
              ref={importButton}
              variant="outline"
              disabled={busy}
              onClick={() => {
                fileGeneration.current++;
                setFileContent(null);
                setDocumentRequest("");
                setImportFormat("csv");
                setFileName("");
                setFileError("");
                setOperationId(createUuid());
                setBaseline(undefined);
                ai.startProposalImport();
              }}
            >
              导入
            </Button>
            <AIReqProposalExport
              groups={filtered}
              materials={ai.view?.materials ?? []}
              disabled={busy}
            />
          </div>
        </header>
        <AIReqProposalSavedNotice target={savedProposal} buttonRef={clarificationAction} zh={zh} />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
            />
            <Input
              aria-label={
                zh ? "搜索提案名称或原始需求" : "Search proposal name or original request"
              }
              placeholder={
                zh ? "搜索提案名称或原始需求" : "Search proposal name or original request"
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
            className="h-9 w-40 rounded-lg bg-surface"
          />
          <Select
            value={phase || "all"}
            onValueChange={(value) => {
              setPhase(value === "all" ? "" : value);
              setPage(0);
            }}
          >
            <SelectTrigger
              aria-label={zh ? "筛选当前状态" : "Filter current status"}
              className="h-9 w-44 rounded-lg bg-surface"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{zh ? "全部状态" : "All statuses"}</SelectItem>
              {/* 修复原因：八态平铺近义标签超出工作记忆；按 proposals spec 分三组展示，筛选值仍是稳定标识。 */}
              {PROPOSAL_STATE_GROUPS.map((group) => (
                <SelectGroup key={group.title}>
                  <SelectLabel className="text-ui-sm">
                    {zh ? group.title : group.titleEn}
                  </SelectLabel>
                  {group.ids.map((id) => {
                    const option = PROPOSAL_STATE_OPTIONS.find((item) => item.id === id);
                    return option ? (
                      <SelectItem key={option.id} value={option.id}>
                        {zh ? option.title : option.titleEn}
                      </SelectItem>
                    ) : null;
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <span
            className="ml-auto shrink-0 text-ui-sm tabular-nums text-foreground-subtle"
            role="status"
          >
            {query || submitter || phase ? `${filtered.length} / ${groups.length}` : groups.length}{" "}
            {zh ? "条" : "items"}
          </span>
        </div>
        {/* 原表格透出页面底色；复用外观页卡片配色，粘性表头也保持不透明。 */}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-card-border bg-card text-foreground">
          <table className="w-full table-fixed text-left text-ui-base">
            <colgroup>
              <col />
              <col className="hidden w-28 @min-[640px]/conversation:table-column" />
              <col className="hidden w-32 @min-[640px]/conversation:table-column" />
              <col className="w-28 @min-[640px]/conversation:w-32" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-medium">
                  {zh ? "需求提案" : "Proposal"}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-medium @min-[640px]/conversation:table-cell"
                >
                  {zh ? "提交人" : "Submitted by"}
                </th>
                <th
                  scope="col"
                  title={zh ? "北京时间" : "Beijing time"}
                  className="hidden px-4 py-3 font-medium @min-[640px]/conversation:table-cell"
                >
                  {zh ? "提交日期" : "Submitted"}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {zh ? "当前状态" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(currentPage * 20, currentPage * 20 + 20).map((item) => (
                <AIReqProposalRow key={item.id} item={item} zh={zh} />
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-foreground-subtle">
                    {groups.length
                      ? "没有符合筛选条件的提案。"
                      : "暂无需求提案。可以新建需求，保存后成为提案。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页
          </Button>
          <span>
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
          </Button>
        </div>
        <Dialog
          open={importOpen}
          onOpenChange={(open) => {
            if (!open && !busy) close();
          }}
        >
          <DialogContent
            className="max-h-[85dvh] overflow-auto sm:max-w-2xl"
            onCloseAutoFocus={(event) => {
              const button = importButton.current;
              if (!button || button.closest("[hidden], [inert]")) return;
              event.preventDefault();
              button.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>{zh ? "导入需求预览" : "Preview requirement import"}</DialogTitle>
              <DialogDescription>
                {zh
                  ? "原始短需求使用 UTF-8 单列 CSV；IR 业务需求文档使用 Markdown（不超过 1 MiB）。确认前不写入，不导入其他材料。"
                  : "Use a UTF-8 single-column CSV for original requests, or Markdown (up to 1 MiB) for an IR business document. Nothing is saved before confirmation. Other materials are not imported."}
              </DialogDescription>
            </DialogHeader>
            {releaseSelector}
            <Button variant="outline" onClick={() => downloadProposalCsv([], "需求提案模板.csv")}>
              {zh ? "下载原始需求 CSV 模板" : "Download original request CSV template"}
            </Button>
            <Input
              type="file"
              accept=".csv,.md,.markdown,text/csv,text/markdown"
              aria-label={
                zh ? "选择 UTF-8 CSV 或 Markdown 文件" : "Choose a UTF-8 CSV or Markdown file"
              }
              className="text-transparent file:text-foreground"
              disabled={busy || !releases.length}
              onChange={async (event) => {
                const generation = ++fileGeneration.current;
                const file = event.target.files?.[0];
                // 先保留 File 引用再清空选择器，读取失败后仍能重选同一文件触发 change。
                event.target.value = "";
                setFileContent(null);
                setDocumentRequest("");
                setFileName(file?.name ?? "");
                setFileError("");
                setBaseline(undefined);
                setOperationId(createUuid());
                if (!file) return;
                const markdown = /\.(md|markdown)$/i.test(file.name);
                setImportFormat(markdown ? "markdown" : "csv");
                if (!markdown && !/\.csv$/i.test(file.name)) {
                  setFileError(
                    zh
                      ? "只支持 CSV 原始需求或 Markdown 业务需求文档。"
                      : "Only CSV requests or Markdown business documents are supported.",
                  );
                  return;
                }
                if (markdown && file.size > 1_048_576) {
                  setFileError(
                    zh
                      ? "业务需求文档不能超过 1 MiB。"
                      : "The business document must not exceed 1 MiB.",
                  );
                  return;
                }
                try {
                  const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
                    await file.arrayBuffer(),
                  );
                  if (generation !== fileGeneration.current) return;
                  if (markdown && !content.trim()) {
                    setFileError(
                      zh ? "业务需求文档不能为空。" : "The business document must not be empty.",
                    );
                    return;
                  }
                  setFileContent(content);
                  if (markdown) setDocumentRequest(businessDocumentRequest(file.name, content));
                } catch (error) {
                  if (generation === fileGeneration.current)
                    setFileError(
                      formatUserFacingError(
                        error,
                        zh
                          ? "文件读取失败，请确认文件为有效的 UTF-8 编码。"
                          : "Could not read the file. Check that it uses valid UTF-8 encoding.",
                      ),
                    );
                }
              }}
            />
            {fileName && (
              <p className="break-all text-ui-sm text-foreground-subtle">已选择：{fileName}</p>
            )}
            {csvError && (
              <p role="alert" className="text-ui-sm text-destructive">
                {csvError}
              </p>
            )}
            {businessDocument !== null && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="import-document-request">
                    {zh ? "原始短需求" : "Original short request"}
                  </Label>
                  <SettingsFormTextarea
                    id="import-document-request"
                    value={documentRequest}
                    disabled={busy}
                    rows={3}
                    onChange={(event) => {
                      setDocumentRequest(event.target.value);
                      setBaseline(undefined);
                      setOperationId(createUuid());
                    }}
                  />
                  <p className="text-ui-sm text-foreground-subtle">
                    {zh
                      ? "短需求独立保存；下方业务文档保留原始正文，仍须评审后才能进入方案拆分。"
                      : "The short request is stored separately. The document below is preserved and still requires review before solution planning."}
                  </p>
                </div>
                {sectionIssues.length > 0 && (
                  <div role="status" className="space-y-1 text-ui-base text-foreground">
                    <p className="font-medium">
                      {zh ? "文档有待补充的必需章节" : "Required sections need attention"}
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {sectionIssues.map(({ heading, kind }) => (
                        <li key={heading} className="break-words">
                          {zh
                            ? kind === "missing"
                              ? `缺少章节「${heading}」`
                              : `章节「${heading}」缺少正文`
                            : kind === "missing"
                              ? `Missing section: ${heading}`
                              : `Empty section: ${heading}`}
                        </li>
                      ))}
                    </ul>
                    <p className="text-foreground-subtle">
                      {zh
                        ? "仍可原样导入，之后在需求澄清中补齐。"
                        : "You can import the original as-is and complete it during clarification."}
                    </p>
                  </div>
                )}
                <div
                  className="max-h-64 overflow-auto rounded-lg border border-border p-3"
                  aria-label={zh ? "IR 业务需求文档预览" : "IR business document preview"}
                >
                  <AIReqMarkdownDocument>{businessDocument}</AIReqMarkdownDocument>
                </div>
              </>
            )}
            {preview && (
              <>
                <p>
                  将导入 {preview.texts.length} 条，跳过 {preview.skipped} 个空行。
                </p>
                {preview.duplicateRows.length > 0 && (
                  <p role="status">
                    第 {preview.duplicateRows.join("、")}{" "}
                    行与已有或本批正文重复；仍全部导入，不自动去重。
                  </p>
                )}
                <ol className="max-h-64 list-decimal space-y-2 overflow-auto pl-6">
                  {preview.texts.map((value, index) => (
                    <li key={index} className="whitespace-pre-wrap break-words">
                      {value}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {!ready && releases.length > 0 && (
              <p className="text-ui-sm text-foreground-subtle">
                {zh ? "请选择所属 Release 后导入。" : "Choose a Release before importing."}
              </p>
            )}
            {ai.error && (
              <div className="space-y-2">
                <p role="alert" className="text-ui-sm text-destructive">
                  {ai.error}
                </p>
                <Button variant="outline" disabled={busy} onClick={() => void rebase()}>
                  重新读取版本并保留输入
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={close}>
                取消
              </Button>
              <Button
                disabled={
                  !ready ||
                  !proposals.length ||
                  proposals.some((entry) => !entry.originalText.trim()) ||
                  busy ||
                  Boolean(csvError)
                }
                onClick={() => void submit("import")}
              >
                确认原子导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AIReqProposalCreateDialog
          busy={busy}
          ready={ready}
          hasReleases={releases.length > 0}
          releaseField={releaseSelector}
          text={text}
          onTextChange={(value) => {
            setText(value);
            setBaseline(undefined);
            setOperationId(createUuid());
          }}
          onClose={close}
          onRetry={() => void rebase()}
          onSave={() => void submit("create")}
          onCloseAutoFocus={(event) => {
            const afterSave = focusClarificationAfterSave.current;
            focusClarificationAfterSave.current = false;
            const overviewTrigger = overviewCreateTrigger.current;
            overviewCreateTrigger.current = null;
            if (afterSave) {
              // 必须等 Dialog 释放锁再交给成功提示，跨版本仍在读取时延后交焦。
              event.preventDefault();
              setFocusSavedWhenReady(true);
              return;
            }
            const button = [overviewTrigger, createButton.current].find(
              (candidate) => candidate?.isConnected && !candidate.closest("[hidden], [inert]"),
            );
            if (!button) return;
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
                当前提案原文或导入预览尚未保存。丢弃后，这些内容不会被创建。
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
                  fileGeneration.current++;
                  setFileContent(null);
                  setDocumentRequest("");
                  setFileName("");
                  setFileError("");
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
