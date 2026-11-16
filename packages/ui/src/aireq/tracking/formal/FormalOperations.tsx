import { useId, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../../AIReqContext.js";
import { useAIReqDataSource } from "../../data-source.js";
import { srCompletionBlocker, srProgress } from "../../contract.js";
import type { AIReqBranchCleanupItem, AIReqRequirementGroup, AIReqSystemRequirement, AIReqTestAcceptanceInput } from "../../contract.js";

export function AIReqFormalTestControls({ group, sr }: { group: AIReqRequirementGroup; sr: AIReqSystemRequirement }) {
  const source = useAIReqDataSource();
  const aireq = useAIReq()!;
  const id = useId();
  const [request, setRequest] = useState<AIReqTestAcceptanceInput>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const blocker = !source.progress ? "测试验收服务暂不可用。" : srCompletionBlocker(sr);
  const open = (outcome: "passed" | "failed") => {
    if (!aireq.view) return;
    setReason("");
    setError("");
    setRequest({ operationId: crypto.randomUUID(), expectedRevision: aireq.view.revision,
      expectedCodeVersion: sr.codeMerge?.commit ?? "", outcome, reason: "" });
    setDialogOpen(true);
  };
  const versionChanged = request && (request.expectedRevision !== aireq.view?.revision || request.expectedCodeVersion !== sr.codeMerge?.commit);
  return <section className="space-y-3" aria-label="人工测试验收">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={Boolean(blocker)} onClick={() => open("passed")}>测试验收通过</Button>
      <Button size="sm" variant="outline" disabled={Boolean(blocker)} onClick={() => open("failed")}>测试不通过</Button>
    </div>
    {blocker && <p className="text-ui-sm text-foreground-subtle">{blocker}</p>}
    {sr.developmentIssues?.map((issue) => <div key={issue.id} className="rounded-md border border-border p-3 text-ui-sm">
      <p className="font-medium">{issue.status === "open" ? "待开发修复" : issue.status === "awaiting-retest" ? "已处理，待人工复测" : "复测通过，已解决"}：{issue.detail}</p>
      <p className="break-all text-foreground-subtle">失败版本 {issue.failedCodeVersion} · {issue.reportedBy} · {issue.reportedAt}</p>
      {issue.fixCodeVersion && <p className="break-all text-foreground-subtle">修复版本 {issue.fixCodeVersion}</p>}
    </div>)}
    {sr.acceptanceHistory?.length ? <details className="text-ui-sm"><summary className="cursor-pointer">测试验收历史（实际操作者与代码版本）</summary>
      <ul className="space-y-2 pt-2">{sr.acceptanceHistory.map((item) => <li key={item.operationId} className="break-words">
        {item.outcome === "passed" ? "通过" : "不通过"} · {item.employeeId} · {item.at}<br />{item.reason}<br /><span className="break-all">{item.codeVersion}</span>
      </li>)}</ul>
    </details> : null}
    {/* 关闭动画仍会渲染内容，保留本次请求避免标题和版本在退场时闪变。 */}
    <Dialog open={dialogOpen} onOpenChange={(value) => { if (!value && !saving) setDialogOpen(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{request?.outcome === "failed" ? "记录测试不通过" : "记录测试验收通过"}</DialogTitle>
          <DialogDescription>{sr.title} · 仅人工测试通过才达到 100%；不通过保持 99%，交开发修复。</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (saving || !request || !reason.trim() || versionChanged || blocker) return;
          setSaving(true); setError("");
          try {
            await source.progress!.recordTest(group.projectId, group.id, sr.id, { ...request, reason });
            setDialogOpen(false);
          } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          finally { setSaving(false); }
        }}>
          <p className="break-all text-ui-sm">本次已合入代码版本：{request?.expectedCodeVersion}</p>
          <Label htmlFor={`${id}-basis`}>{request?.outcome === "failed" ? "测试依据与具体问题" : "测试通过依据"}</Label>
          <SettingsFormTextarea id={`${id}-basis`} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="记录平台外实际测试结果及依据；不会运行测试" />
          {dialogOpen && !saving && (versionChanged || error) && <p role="alert" className="text-ui-sm text-destructive">{versionChanged ? "业务或代码版本已变化；请关闭后基于新版本重新记录，当前输入已保留。" : error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>取消</Button>
            <Button type="submit" disabled={saving || Boolean(blocker) || Boolean(versionChanged) || !reason.trim()}>{saving ? "记录中…" : request?.outcome === "failed" ? "记录不通过并交开发" : "记录测试通过到 100%"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}

export function AIReqFormalSimulationControls({ group, sr }: { group: AIReqRequirementGroup; sr: AIReqSystemRequirement }) {
  const source = useAIReqDataSource();
  const aireq = useAIReq()!;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const exact = { projectId: group.projectId, irId: group.id, srId: sr.id };
  const input = () => ({ operationId: crypto.randomUUID(), expectedRevision: aireq.view!.revision });
  const mutate = async (action: () => void | Promise<void>, success: string) => {
    if (pending) return;
    setPending(true); setMessage("");
    try { await action(); setMessage(success); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(false); }
  };
  return <details className="space-y-3 rounded-md border border-border p-3 text-ui-sm">
    <summary className="cursor-pointer font-medium">模拟场景控制（无真实 Git／AI／测试）</summary>
    <p className="pt-2 text-foreground-subtle">只输入模拟外部事实，仍经过版本、幂等、问题复测及人工验收门禁。</p>
    <div className="flex flex-wrap gap-2">
      {source.prototype && <>
        {/* 待复测仍是未解决问题：只允许修复合入，不改变人工测试入口。 */}
        <Button size="sm" variant="outline" disabled={pending || srProgress(sr) === 100 || Boolean(sr.developmentIssues?.some((issue) => issue.status !== "resolved"))} onClick={() => void mutate(() => source.prototype!.simulateCodeMerge(group.projectId, group.id, sr.id, { ...input(), fix: false }), "模拟代码合入已登记；业务进度固定 99%，等待人工测试。")}>模拟代码合入</Button>
        <Button size="sm" variant="outline" disabled={pending || !sr.developmentIssues?.some((issue) => issue.status !== "resolved")} onClick={() => void mutate(() => source.prototype!.simulateCodeMerge(group.projectId, group.id, sr.id, { ...input(), fix: true }), "模拟修复合入新版本；问题已处理，等待人工复测。")}>模拟修复合入</Button>
        <Button size="sm" variant="outline" disabled={pending || sr.trackingBranch?.status === "deleted"} onClick={() => void mutate(() => source.prototype!.failNextBranchCleanup(group.projectId, group.id, sr.id, input()), "已指定本 SR 分支下一次清理失败（模拟）。")}>下一次清理失败</Button>
      </>}
      {source.progressScheduler && <>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(() => source.progressScheduler!.setScenario(exact, "fail-next"), "已设置下一次分析失败；请通过正常分析动作触发。")}>下一次分析失败</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(() => source.progressScheduler!.setScenario(exact, "hold-next"), "已暂缓本次或下一次分析结果；可改变模拟代码版本后显式释放。")}>暂缓分析结果</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(() => source.progressScheduler!.setScenario(exact, "release-held"), "已释放暂缓结果；owner 将核验版本，旧版本拒绝写回。")}>释放暂缓结果</Button>
        <Button size="sm" variant="outline" disabled={pending || srProgress(sr) === 100} onClick={() => void mutate(() => source.progressScheduler!.runNow(exact), "已请求此 SR 的正常模拟分析；项目需在进度分析设置中开启。")}>分析此 SR</Button>
      </>}
    </div>
    {sr.trackingBranch?.nextCleanupFailure && <p>已设置：此登记分支下一次清理失败。</p>}
    <p role="status" className="break-words">{message}</p>
  </details>;
}

export function AIReqBranchCleanup({ group, rows }: { group: AIReqRequirementGroup; rows: AIReqSystemRequirement[] }) {
  const source = useAIReqDataSource();
  const aireq = useAIReq()!;
  const [preview, setPreview] = useState<{ items: AIReqBranchCleanupItem[]; expectedRevision: number; operationId: string }>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const complete = rows.length > 0 && rows.length === group.srIds.length && rows.every((sr) => srProgress(sr) === 100);
  const changed = preview && preview.expectedRevision !== aireq.view?.revision;
  return <section className="space-y-3" aria-label="IR 开发分支清理">
    <Button variant="outline" size="sm" disabled={!source.progress || !complete || pending} onClick={async () => {
      const expectedRevision = aireq.view!.revision;
      setPending(true); setMessage("");
      try { setPreview({ items: await source.progress!.cleanupPreview(group.projectId, group.id), expectedRevision, operationId: crypto.randomUUID() }); setDialogOpen(true); }
      catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
      finally { setPending(false); }
    }}>预览并清理本 IR 开发分支</Button>
    {!complete && <p className="text-ui-sm text-foreground-subtle">全部 SR 人工测试通过达到 100% 后才可清理。</p>}
    <ul className="space-y-1 text-ui-sm">{rows.map((sr) => <li key={sr.id} className="break-all">
      {sr.id} · {sr.trackingBranch?.name ?? "分支缺失"} · {sr.trackingBranch?.status === "deleted" ? "已清理（模拟）" : sr.trackingBranch?.status === "failed" ? "失败" : "已登记"}
      {sr.trackingBranch?.error && <span className="text-destructive"> · {sr.trackingBranch.error}</span>}
    </li>)}</ul>
    <p role="status" className="text-ui-sm">{message}</p>
    {/* 预览在退场动画中仍可见，成功提示只显示在弹窗外。 */}
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open && !pending) setDialogOpen(false); }}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>确认清理本 IR 登记开发分支</DialogTitle>
        <DialogDescription>模拟删除；永不删除主分支、材料、报告或验收历史。已清理项不重复执行，只处理未成功项。</DialogDescription></DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-auto text-ui-sm">{preview?.items.map((item) => <li key={item.srId} className="break-all">{item.srId} · {item.branch || "分支缺失"} · {item.status === "deleted" ? "已清理，不重试" : item.status === "failed" ? "失败，待重试" : "待清理"}{item.error && ` · ${item.error}`}</li>)}</ul>
        {dialogOpen && !pending && changed && <p role="alert" className="text-ui-sm text-destructive">业务版本已变化，请关闭后重新预览。</p>}
        {/* RPC 拒绝时保留预览，并在遮罩内展示错误，供用户显式重试。 */}
        {dialogOpen && !pending && message && <p role="alert" className="text-ui-sm text-destructive">{message}</p>}
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDialogOpen(false)}>取消</Button>
          <Button disabled={pending || Boolean(changed) || !preview?.items.some((item) => item.status !== "deleted")} onClick={async () => {
            if (!preview || pending || changed) return;
            setPending(true); setMessage("");
            try {
              await source.progress!.cleanupBranches(group.projectId, group.id, { operationId: preview.operationId, expectedRevision: preview.expectedRevision, branches: preview.items.map((item) => item.branch) });
              setDialogOpen(false); setMessage("模拟清理已逐项记录；失败项可重新预览后重试，进度和历史保持不变。");
            } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
            finally { setPending(false); }
          }}>{pending ? "清理中…" : "确认仅清理未成功项"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
