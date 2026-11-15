import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../AIReqContext.js";
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
  const [preview, setPreview] = useState<ProposalCsvPreview | null>(null);
  const [csvError, setCsvError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [baseline, setBaseline] = useState<number>();
  const fileGeneration = useRef(0);
  const { setDraftNavigationGuard } = ai;
  const dirty = Boolean(text || preview);
  useEffect(() => {
    if (!dirty) return;
    setDraftNavigationGuard((navigate) => {
      if (!window.confirm("有未保存的提案或导入预览。丢弃并离开？")) return;
      setText(""); setPreview(null); setImportOpen(false); ai.closeProposalDraft();
      navigate();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setDraftNavigationGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, setDraftNavigationGuard, ai]);
  useEffect(() => () => { fileGeneration.current++; }, []);
  const groups = (ai.view?.drafts ?? []).filter((item) => item.projectId === ai.selection.projectId && (!ai.releaseId || item.releaseId === ai.releaseId));
  const filtered = groups.filter((item) => (!query || item.originalText.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (!submitter || item.submittedBy.includes(submitter)) && (!phase || proposalPhaseLabel(item) === phase));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const ready = Boolean(ai.selection.projectId && ai.releaseId);
  const close = () => ai.navigate(() => { fileGeneration.current++; ai.closeProposalDraft(); setImportOpen(false); setPreview(null); setCsvError(""); });
  const rebase = async () => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      await ai.refresh();
      // 修复：只更新下次显式提交的 CAS 基线；保留原文、预览和操作 ID，不自动重放写入。
      setBaseline(undefined);
    } finally { submitting.current = false; setBusy(false); }
  };
  const submit = async (kind: "create" | "import") => {
    if (submitting.current || !ready) return;
    submitting.current = true; setBusy(true);
    const expectedRevision = baseline ?? ai.view?.revision ?? 0;
    setBaseline(expectedRevision);
    try {
      const result = await ai.command(kind === "create" ? {
        type: "createProposal", projectId: ai.selection.projectId, releaseId: ai.releaseId,
        originalText: text, sourceIrId: ai.proposalDraft?.sourceIrId,
        operationId: `${ai.proposalDraft?.id ?? "proposal"}:${operationId}`, expectedRevision,
      } : {
        type: "importProposals", projectId: ai.selection.projectId, releaseId: ai.releaseId,
        originalTexts: preview!.texts, operationId, expectedRevision,
      });
      if (result?.status === "completed") {
        setDraftNavigationGuard(null); setText(""); setPreview(null); setImportOpen(false);
        ai.closeProposalDraft(); setOperationId(crypto.randomUUID()); setBaseline(undefined);
      }
    } finally { submitting.current = false; setBusy(false); }
  };
  return <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6 text-ui-base">
    <h1 className="text-ui-page-title">需求提案</h1>
    <div className="flex flex-wrap gap-2">
      <Button data-testid="new-requirement" disabled={busy} onClick={() => { setBaseline(undefined); ai.startProposalDraft(); }}>新增提案</Button>
      <Button variant="outline" disabled={busy} onClick={() => { setOperationId(crypto.randomUUID()); setBaseline(undefined); setImportOpen(true); }}>导入</Button>
      <Button variant="outline" onClick={() => downloadProposalCsv(filtered.map((item) => item.originalText), "需求提案.csv")}>导出</Button>
    </div>
    {!ready && <p className="text-ui-sm text-foreground-subtle">新增与导入需在项目菜单选择具体 Release；全部 Release 仅用于读取。</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="筛选原始需求" placeholder="筛选原始需求" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="max-w-sm" />
      <Input aria-label="筛选提交人工号" placeholder="提交人工号" value={submitter} onChange={(event) => { setSubmitter(event.target.value); setPage(0); }} className="max-w-48" />
      <select aria-label="筛选当前状态" className="rounded-md border border-border bg-background px-3 py-2 text-ui-sm" value={phase} onChange={(event) => { setPhase(event.target.value); setPage(0); }}><option value="">全部状态</option>{[...new Set(groups.map((item) => proposalPhaseLabel(item)))].map((label) => <option key={label}>{label}</option>)}</select>
      <span className="text-ui-sm text-foreground-subtle">共 {filtered.length} 条；导出包含全部筛选结果</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border"><table className="w-full text-left text-ui-base"><thead className="sticky top-0 bg-background"><tr>{["提交人", "原始需求", "提交日期", "当前状态", "操作"].map((label) => <th key={label} className="border-b border-border px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>
      {filtered.slice(currentPage * 20, currentPage * 20 + 20).map((item) => <tr key={item.id} className="border-b border-border/50"><td className="px-4 py-3">{item.submittedBy}</td><td className="max-w-xl whitespace-pre-wrap break-words px-4 py-3">{item.originalText}</td><td className="px-4 py-3"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time><span className="block text-ui-sm text-foreground-subtle">北京时间</span></td><td className="px-4 py-3">{proposalPhaseLabel(item)}</td><td className="px-4 py-3"><Button variant="outline" onClick={() => ai.select({ projectId: item.projectId, irId: item.id })}>详情／讨论</Button></td></tr>)}
      {!filtered.length && <tr><td colSpan={5} className="p-6 text-foreground-subtle">{groups.length ? "没有符合筛选条件的提案。" : "暂无需求提案。新增只保存原文，不启动 AI。"}</td></tr>}
    </tbody></table></div>
    <div className="flex items-center justify-end gap-2"><Button variant="outline" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</Button><span>{currentPage + 1} / {pageCount}</span><Button variant="outline" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</Button></div>
    <Dialog open={importOpen} onOpenChange={(open) => { if (!open && !busy) close(); }}><DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl"><DialogHeader><DialogTitle>CSV 导入预览</DialogTitle><DialogDescription>UTF-8 单列“原始需求”。确认前不写入，格式错误整批拒绝，重复正文保留。</DialogDescription></DialogHeader><Button variant="outline" onClick={() => downloadProposalCsv([], "需求提案模板.csv")}>下载模板</Button><Input type="file" accept=".csv,text/csv" aria-label="选择 UTF-8 CSV 文件" disabled={busy} onChange={async (event) => {
      const generation = ++fileGeneration.current; const file = event.target.files?.[0]; setPreview(null); setCsvError(""); setBaseline(undefined); setOperationId(crypto.randomUUID()); if (!file) return;
      try { const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); const next = parseProposalCsv(content, groups.map((item) => item.originalText)); if (generation === fileGeneration.current) setPreview(next); } catch (error) { if (generation === fileGeneration.current) setCsvError(error instanceof Error ? error.message : "无法读取 UTF-8 CSV。"); }
    }} />
    {csvError && <p role="alert" className="text-ui-sm text-destructive">{csvError}</p>}
    {preview && <><p>将导入 {preview.texts.length} 条，跳过 {preview.skipped} 个空行。</p>{preview.duplicateRows.length > 0 && <p role="status">第 {preview.duplicateRows.join("、")} 行与已有或本批正文重复；仍全部导入，不自动去重。</p>}<ol className="max-h-64 list-decimal space-y-2 overflow-auto pl-6">{preview.texts.map((value, index) => <li key={index} className="whitespace-pre-wrap break-words">{value}</li>)}</ol></>}
    {ai.error && <div className="space-y-2"><p role="alert" className="text-ui-sm text-destructive">{ai.error}</p><Button variant="outline" disabled={busy} onClick={() => void rebase()}>重新读取版本并保留输入</Button></div>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>取消</Button><Button disabled={!ready || !preview?.texts.length || busy || Boolean(csvError)} onClick={() => void submit("import")}>确认原子导入</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(ai.proposalDraft)} onOpenChange={(open) => { if (!open && !busy) close(); }}>
      <DialogContent><DialogHeader><DialogTitle>新增提案</DialogTitle><DialogDescription>只保存原始短需求，不生成材料或运行 AI。{ai.proposalDraft?.sourceIrId ? `来源 IR：${ai.proposalDraft.sourceIrId}` : ""}</DialogDescription></DialogHeader>
        <SettingsFormTextarea aria-label="原始需求" rows={6} value={text} onChange={(event) => { setText(event.target.value); setBaseline(undefined); setOperationId(crypto.randomUUID()); }} />
        {ai.error && <div className="space-y-2"><p role="alert" className="text-ui-sm text-destructive">{ai.error}</p><Button variant="outline" disabled={busy} onClick={() => void rebase()}>重新读取版本并保留输入</Button></div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>取消</Button><Button disabled={!ready || !text.trim() || busy} onClick={() => void submit("create")}>保存原文</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}
