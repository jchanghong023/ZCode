// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { proposalPhaseLabel } from "../contract.js";
import { downloadProposalCsv, parseProposalCsv, type ProposalCsvPreview } from "./proposal-csv.js";

export function AIReqProposalTable() {
  const ai = useAIReq()!;
  const [query, setQuery] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [phase, setPhase] = useState("");
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<ProposalCsvPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [operationId, setOperationId] = useState(() => createUuid());
  const [baseline, setBaseline] = useState<number>();
  const fileGeneration = useRef(0);
  const { setDraftNavigationGuard } = ai;
  const dirty = Boolean(text || (importOpen && preview));
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
  const groups = (ai.view?.drafts ?? []).filter(
    (item) =>
      item.projectId === ai.selection.projectId &&
      (!ai.releaseId || item.releaseId === ai.releaseId),
  );
  const filtered = groups.filter(
    (item) =>
      (!query || item.originalText.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
      (!submitter || item.submittedBy.includes(submitter)) &&
      (!phase || proposalPhaseLabel(item) === phase),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const ready = Boolean(ai.selection.projectId && ai.releaseId);
  // 关闭时保留预览供退场动画使用；重新打开导入时再清空，关闭后不算草稿。
  const close = () =>
    ai.navigate(() => {
      fileGeneration.current++;
      ai.closeProposalDraft();
      setImportOpen(false);
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
        setImportOpen(false);
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
              setPreview(null);
              setFileName("");
              setCsvError("");
              setOperationId(createUuid());
              setBaseline(undefined);
              setImportOpen(true);
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
            新增与导入需通过页头 Release 选择指定具体版本；全部 Release 仅用于读取。
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="筛选原始需求"
            placeholder="筛选原始需求"
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
              <col className="w-14" />
            </colgroup>
            <thead className="sticky top-0 bg-background">
              <tr>
                {["提交人", "原始需求", "提交日期", "当前状态", "操作"].map((label, index) => (
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
                <tr key={item.id} className="group/row border-b border-border/50 hover:bg-hover">
                  <td className="px-4 py-3">{item.submittedBy}</td>
                  <td className="max-w-xl whitespace-pre-wrap break-words px-4 py-3">
                    {/* 正文应和详情入口一样可直接打开讨论，同时保留键盘操作。 */}
                    <Button
                      variant="link"
                      className="h-auto max-w-full whitespace-pre-wrap break-words p-0 text-left text-foreground"
                      onClick={() => ai.select({ projectId: item.projectId, irId: item.id })}
                    >
                      {item.originalText}
                    </Button>
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
                      size="icon"
                      className="pointer-events-none size-8 rounded-lg opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                      aria-label={`查看 ${item.id} 提案详情／讨论`}
                      onClick={() => ai.select({ projectId: item.projectId, irId: item.id })}
                    >
                      <MoreHorizontal aria-hidden="true" className="size-4" />
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
            <Button variant="outline" onClick={() => downloadProposalCsv([], "需求提案模板.csv")}>
              下载模板
            </Button>
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-label="选择 UTF-8 CSV 文件"
              className="text-transparent file:text-foreground"
              disabled={busy}
              onChange={async (event) => {
                const generation = ++fileGeneration.current;
                const file = event.target.files?.[0];
                // 先保留 File 引用再清空选择器，读取失败后仍能重选同一文件触发 change。
                event.target.value = "";
                setPreview(null);
                setFileName(file?.name ?? "");
                setCsvError("");
                setBaseline(undefined);
                setOperationId(createUuid());
                if (!file) return;
                try {
                  const content = new TextDecoder("utf-8", { fatal: true }).decode(
                    await file.arrayBuffer(),
                  );
                  const next = parseProposalCsv(
                    content,
                    groups.map((item) => item.originalText),
                  );
                  if (generation === fileGeneration.current) setPreview(next);
                } catch (error) {
                  if (generation === fileGeneration.current)
                    setCsvError(error instanceof Error ? error.message : "无法读取 UTF-8 CSV。");
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
            {/* 遮罩会遮住页面上的条件提示，弹窗内需说明无法确认导入的原因。 */}
            {!ready && (
              <p className="text-ui-sm text-foreground-subtle">
                请先关闭弹窗，在页头 Release 选择中指定具体版本后再导入。
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
            <div className="space-y-2">
              <Label htmlFor="new-proposal-text">原始需求</Label>
              <SettingsFormTextarea
                id="new-proposal-text"
                className="field-sizing-fixed min-h-32"
                rows={6}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setBaseline(undefined);
                  setOperationId(createUuid());
                }}
              />
              {!ready && (
                <p className="text-ui-sm text-foreground-subtle">
                  请先关闭弹窗，在页头 Release 选择中指定具体版本后再保存。
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
                  setImportOpen(false);
                  ai.closeProposalDraft();
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
