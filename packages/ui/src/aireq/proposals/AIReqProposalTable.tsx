// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { useEffect, useMemo, useRef, useState } from "react";
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
  SelectItem,
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
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqRequirementViews } from "../shell/AIReqRequirementNavigation.js";
import { proposalPhaseLabel } from "../contract.js";
import { downloadProposalCsv, parseProposalCsv } from "./proposal-csv.js";

export function AIReqProposalTable() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [query, setQuery] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [phase, setPhase] = useState("");
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const importOpen = ai.proposalImportOpen;
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [operationId, setOperationId] = useState(() => createUuid());
  const [baseline, setBaseline] = useState<number>();
  const fileGeneration = useRef(0);
  const { setDraftNavigationGuard } = ai;
  const groups = useMemo(
    () =>
      (ai.view?.drafts ?? []).filter(
        (item) =>
          item.projectId === ai.selection.projectId &&
          (!ai.releaseId || item.releaseId === ai.releaseId),
      ),
    [ai.view?.drafts, ai.selection.projectId, ai.releaseId],
  );
  const releases = (ai.view?.releases ?? []).filter(
    (item) => item.projectId === ai.selection.projectId,
  );
  // 修复：预览可以先于 Release 选择；保留 CSV 原文并按当前范围重算重复行，避免沿用旧版本提示。
  const parsedCsv = useMemo(() => {
    if (csvContent === null) return { preview: null, error: "" };
    try {
      return {
        preview: parseProposalCsv(
          csvContent,
          groups.map((item) => item.originalText),
        ),
        error: "",
      };
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : "无法读取 UTF-8 CSV。",
      };
    }
  }, [csvContent, groups]);
  const preview = parsedCsv.preview;
  const csvError = fileError || parsedCsv.error;
  const dirty = Boolean(text || (importOpen && preview));
  // 修复：列表保持挂载以恢复筛选，切换项目时不能沿用上一个项目的筛选条件。
  useEffect(() => {
    setQuery("");
    setSubmitter("");
    setPhase("");
    setPage(0);
  }, [ai.selection.projectId]);
  useEffect(() => {
    if (!dirty) return;
    // 原生确认框与应用交互不一致；暂存一次导航，待应用内确认后再执行。
    setDraftNavigationGuard((navigate) => {
      if (pendingNavigation.current) return;
      pendingNavigation.current = navigate;
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
  }, [dirty, setDraftNavigationGuard, ai]);
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
  const filtered = groups.filter(
    (item) =>
      (!query ||
        item.originalText.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
        item.id.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
      (!submitter || item.submittedBy.includes(submitter)) &&
      (!phase || proposalPhaseLabel(item) === phase),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const ready = releases.some((release) => release.id === ai.releaseId);
  const releaseSelector = (
    <div className="space-y-2">
      <Label>{zh ? "所属 Release" : "Release"}</Label>
      <Select
        value={ai.releaseId || undefined}
        disabled={busy || !releases.length}
        onValueChange={(id) => {
          // 修复：弹窗内切换范围是同一表单的选择，不应触发离开门禁或丢弃输入。
          ai.setReleaseId(id, { inProposalDialog: true });
          setBaseline(undefined);
          setOperationId(createUuid());
        }}
      >
        <SelectTrigger aria-label={zh ? "选择所属 Release" : "Choose a Release"}>
          <SelectValue placeholder={zh ? "选择具体 Release" : "Choose a Release"} />
        </SelectTrigger>
        <SelectContent>
          {releases.map((release) => (
            <SelectItem key={release.id} value={release.id}>
              {release.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!releases.length && (
        <p className="text-ui-sm text-foreground-subtle">
          {zh
            ? "当前项目尚无 Release，请关闭弹窗并在项目配置中添加。"
            : "This project has no Releases. Close this dialog and add one in project settings."}
        </p>
      )}
    </div>
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
              releaseId: ai.releaseId,
              originalText: text,
              sourceIrId: ai.proposalDraft?.sourceIrId,
              operationId: `${ai.proposalDraft?.id ?? "proposal"}:${operationId}`,
              expectedRevision,
            }
          : {
              type: "importProposals",
              projectId: ai.selection.projectId,
              releaseId: ai.releaseId,
              originalTexts: preview!.texts,
              operationId,
              expectedRevision,
            },
      );
      if (result?.status === "completed") {
        setDraftNavigationGuard(null);
        setText("");
        fileGeneration.current++;
        setCsvContent(null);
        setFileName("");
        setFileError("");
        ai.closeProposalDraft();
        setOperationId(createUuid());
        setBaseline(undefined);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <main className="min-h-0 flex-1 overflow-auto text-ui-base [scrollbar-gutter:stable_both-edges]">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} flex flex-col gap-4`}>
        <div className="pt-4">
          <AIReqRequirementViews />
        </div>
        <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>需求提案</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="new-requirement"
            disabled={busy}
            onClick={() => {
              setBaseline(undefined);
              ai.startProposalDraft();
            }}
          >
            新增提案
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              fileGeneration.current++;
              setCsvContent(null);
              setFileName("");
              setFileError("");
              setOperationId(createUuid());
              setBaseline(undefined);
              ai.startProposalImport();
            }}
          >
            导入
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadProposalCsv(
                filtered.map((item) => item.originalText),
                "需求提案.csv",
              )
            }
          >
            导出
          </Button>
        </div>
        {!ready && (
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "新增与导入需要选择具体 Release；可在弹窗内选择。"
              : "Choose a specific Release in the dialog when adding or importing proposals."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={zh ? "筛选原始需求或 IR 编号" : "Filter by requirement or IR ID"}
            placeholder={zh ? "筛选原始需求或 IR 编号" : "Filter by requirement or IR ID"}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="max-w-sm"
          />
          <Input
            aria-label="筛选提交人工号"
            placeholder="提交人工号"
            value={submitter}
            onChange={(event) => {
              setSubmitter(event.target.value);
              setPage(0);
            }}
            className="max-w-48"
          />
          <select
            aria-label="筛选当前状态"
            className="rounded-md border border-border bg-background px-3 py-2 text-ui-sm"
            value={phase}
            onChange={(event) => {
              setPhase(event.target.value);
              setPage(0);
            }}
          >
            <option value="">全部状态</option>
            {[...new Set(groups.map((item) => proposalPhaseLabel(item)))].map((label) => (
              <option key={label}>{label}</option>
            ))}
          </select>
          <span className="text-ui-sm text-foreground-subtle">
            共 {filtered.length} 条；导出包含全部筛选结果
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[680px] table-fixed text-left text-ui-base">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[38%]" />
              <col className="w-[23%]" />
              <col />
              <col className="w-28" />
            </colgroup>
            <thead className="sticky top-0 bg-background">
              <tr>
                {[
                  "提交人",
                  zh ? "原始需求／编号" : "Requirement / ID",
                  "提交日期",
                  "当前状态",
                  "操作",
                ].map((label, index) => (
                  <th
                    key={label}
                    className={`border-b border-border py-3 font-medium ${index === 4 ? "px-2 text-right" : "px-4"}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(currentPage * 20, currentPage * 20 + 20).map((item) => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-hover">
                  <td className="px-4 py-3">{item.submittedBy}</td>
                  <td className="max-w-xl whitespace-pre-wrap break-words px-4 py-3">
                    {/* 正文应和详情入口一样可直接打开讨论，同时保留键盘操作。 */}
                    <div className="flex flex-col items-start gap-1">
                      <Button
                        variant="link"
                        className="h-auto max-w-full whitespace-pre-wrap break-words p-0 text-left text-foreground"
                        onClick={() => ai.select({ projectId: item.projectId, irId: item.id })}
                      >
                        {item.originalText}
                      </Button>
                      <span className="break-all text-ui-sm text-foreground-subtle">{item.id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        hour12: false,
                      })}
                    </time>
                    <span className="block text-ui-sm text-foreground-subtle">北京时间</span>
                  </td>
                  <td className="px-4 py-3">{proposalPhaseLabel(item)}</td>
                  <td className="px-2 py-3 text-right align-middle">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="whitespace-nowrap"
                      aria-label={
                        zh ? `查看 ${item.id} 提案详情／讨论` : `Open discussion for ${item.id}`
                      }
                      onClick={() => ai.select({ projectId: item.projectId, irId: item.id })}
                    >
                      {zh ? "进入讨论" : "Discuss"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-foreground-subtle">
                    {groups.length
                      ? "没有符合筛选条件的提案。"
                      : "暂无需求提案。新增只保存原文，不启动 AI。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2">
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
          <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>CSV 导入预览</DialogTitle>
              <DialogDescription>
                UTF-8 单列“原始需求”。确认前不写入，格式错误整批拒绝，重复正文保留。
              </DialogDescription>
            </DialogHeader>
            {releaseSelector}
            <Button variant="outline" onClick={() => downloadProposalCsv([], "需求提案模板.csv")}>
              下载模板
            </Button>
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-label="选择 UTF-8 CSV 文件"
              className="text-transparent file:text-foreground"
              disabled={busy || !releases.length}
              onChange={async (event) => {
                const generation = ++fileGeneration.current;
                const file = event.target.files?.[0];
                // 先保留 File 引用再清空选择器，读取失败后仍能重选同一文件触发 change。
                event.target.value = "";
                setCsvContent(null);
                setFileName(file?.name ?? "");
                setFileError("");
                setBaseline(undefined);
                setOperationId(createUuid());
                if (!file) return;
                try {
                  const content = new TextDecoder("utf-8", { fatal: true }).decode(
                    await file.arrayBuffer(),
                  );
                  if (generation === fileGeneration.current) setCsvContent(content);
                } catch (error) {
                  if (generation === fileGeneration.current)
                    setFileError(error instanceof Error ? error.message : "无法读取 UTF-8 CSV。");
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
                disabled={!ready || !preview?.texts.length || busy || Boolean(csvError)}
                onClick={() => void submit("import")}
              >
                确认原子导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(ai.proposalDraft)}
          onOpenChange={(open) => {
            if (!open && !busy) close();
          }}
        >
          {/* 修复：通用弹窗默认按视口铺满；新增提案应使用与导入一致的限宽和多行编辑区。 */}
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>新增提案</DialogTitle>
              <DialogDescription>
                只保存原始短需求，不生成材料或运行 AI。
                {ai.proposalDraft?.sourceIrId ? `来源 IR：${ai.proposalDraft.sourceIrId}` : ""}
              </DialogDescription>
            </DialogHeader>
            {releaseSelector}
            <div className="space-y-2">
              <Label htmlFor="new-proposal-text">原始需求</Label>
              <SettingsFormTextarea
                id="new-proposal-text"
                className="field-sizing-fixed min-h-32"
                rows={6}
                value={text}
                disabled={busy || !releases.length}
                onChange={(event) => {
                  setText(event.target.value);
                  setBaseline(undefined);
                  setOperationId(createUuid());
                }}
              />
              {!ready && releases.length > 0 && (
                <p className="text-ui-sm text-foreground-subtle">
                  {zh ? "请选择所属 Release 后保存。" : "Choose a Release before saving."}
                </p>
              )}
            </div>
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
                disabled={!ready || !text.trim() || busy}
                onClick={() => void submit("create")}
              >
                保存原文
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={discardOpen}
          onOpenChange={(open) => {
            setDiscardOpen(open);
            if (!open) pendingNavigation.current = null;
          }}
        >
          <AlertDialogContent>
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
                  setDraftNavigationGuard(null);
                  setText("");
                  fileGeneration.current++;
                  setCsvContent(null);
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
