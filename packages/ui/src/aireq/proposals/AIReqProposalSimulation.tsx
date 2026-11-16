import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import type { AIReqRequirementGroup, AIReqReviewScenario } from "../contract.js";

export function AIReqProposalSimulation({ group }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const [kind, setKind] = useState<"original" | "full">("original");
  const savedScenario = group.reviewScenarios?.[kind] ?? "normal";
  const [scenarioDraft, setScenarioDraft] = useState<{
    projectId: string; irId: string; kind: typeof kind; saved: AIReqReviewScenario; value: AIReqReviewScenario;
  }>();
  // 仅保留当前对象的未提交输入；服务端消费场景或切换 IR/种类时立即显示对应已保存值。
  const scenario = scenarioDraft?.projectId === group.projectId && scenarioDraft.irId === group.id &&
    scenarioDraft.kind === kind && scenarioDraft.saved === savedScenario ? scenarioDraft.value : savedScenario;
  useEffect(() => setScenarioDraft(undefined), [group.projectId, group.id, kind, savedScenario]);
  const [target, setTarget] = useState<"requirements" | "solution" | "test-plan">("requirements");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [branchSrId, setBranchSrId] = useState("");
  const [contactDraft, setContacts] = useState<typeof group.contacts>();
  const contacts = contactDraft ?? group.contacts ?? {};
  const { setDraftNavigationGuard } = ai;
  const contactsChanged = contactDraft !== undefined && JSON.stringify(contacts) !== JSON.stringify(group.contacts ?? {});
  useEffect(() => {
    if (!note && !contactsChanged) return;
    setDraftNavigationGuard((navigate) => {
      if (!window.confirm("有未保存的联系人或材料修改说明，丢弃并离开？")) return;
      setNote(""); setContacts(undefined);
      setDraftNavigationGuard(null);
      navigate();
    });
    return () => setDraftNavigationGuard(null);
  }, [note, contactsChanged, group.contacts, setDraftNavigationGuard]);
  const perform = async (action: () => unknown | Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setFeedback("");
    try { await action(); setFeedback("输入已送至业务 owner；请查看业务结果与错误，不替代正常评审、人工决定或版本门禁。"); }
    catch (error) { setFeedback(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <details className="space-y-2 rounded-lg border border-border p-3"><summary className="cursor-pointer">分工与模拟控制（共享服务内存，无真实模型／Git）</summary><div className="mt-3 space-y-3">
    <fieldset className="space-y-2">
      <legend>IR 联系人（空值为待认领，不限制代办）</legend>
      {/* 标签在弹性布局中被压缩会拆开末字，保持完整文字并让输入框使用剩余宽度。 */}
      {([["business", "业务"], ["development", "开发"], ["testing", "测试"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><span className="shrink-0 whitespace-nowrap">{label}联系人</span><Input aria-label={`${label}联系人`} value={contacts[key] ?? ""} placeholder="未分配" onChange={(event) => setContacts({ ...contacts, [key]: event.target.value })} /></label>)}
      <Button variant="outline" disabled={busy || Object.values(contacts).some((value) => Boolean(value) && !/^[a-z][0-9]{8}$/.test(value!))} onClick={() => void perform(async () => {
        const result = await ai.command({ type: "assignContacts", projectId: group.projectId, irId: group.id, contacts: {
          business: contacts.business || undefined, development: contacts.development || undefined,
          testing: contacts.testing || undefined,
        } });
        if (!result) throw new Error("分工保存失败；请查看上方业务错误，输入已保留。");
        setContacts(undefined);
      })}>保存联系人</Button>
    </fieldset>
    {source.prototype && <>
      <div className="flex flex-wrap gap-2">
        <select aria-label="模拟评审种类" className="rounded border border-border bg-background p-2" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="original">原始需求单评审</option><option value="full">完整材料三审终审</option></select>
        <select aria-label="模拟下一次评审结果" className="rounded border border-border bg-background p-2" value={scenario} onChange={(event) => setScenarioDraft({ projectId: group.projectId, irId: group.id, kind, saved: savedScenario, value: event.target.value as AIReqReviewScenario })}><option value="normal">正常</option><option value="blocked">阻断</option><option value="failed">失败</option><option value="hold">暂缓结果（保留旧版本）</option></select>
        <Button variant="outline" disabled={busy} onClick={() => void perform(async () => {
          await source.prototype!.setProposalReviewScenario(group.projectId, group.id, kind, scenario);
          setScenarioDraft(undefined);
        })}>设置下一次模拟结果</Button>
        <Button variant="outline" disabled={busy} onClick={() => void perform(() => source.prototype!.releaseProposalReviewResults(group.projectId, group.id))}>释放暂缓旧结果</Button>
      </div>
      <p>先选择模拟输入，再通过正常评审按钮运行；旧结果释放仍经版本校验。</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="模拟建分支失败的 SR" className="rounded border border-border bg-background p-2" value={branchSrId} onChange={(event) => setBranchSrId(event.target.value)}><option value="">选择 SR</option>{group.srIds.map((id) => <option key={id}>{id}</option>)}</select>
        <Button variant="outline" disabled={busy || !branchSrId} onClick={() => void perform(() => source.prototype!.failNextBranchCreation(group.projectId, group.id, branchSrId))}>模拟该 SR 下一次建分支失败</Button>
      </div>
    </>}
    <div className="space-y-2">
      <label className="flex items-center gap-2">请求修改材料<select aria-label="修改材料范围" className="rounded border border-border bg-background p-2" value={target} onChange={(event) => setTarget(event.target.value as typeof target)}><option value="requirements">业务原始需求文档</option><option value="solution">SR 方案完整包</option><option value="test-plan">仅测试方案</option></select></label>
      <SettingsFormTextarea aria-label="材料修改说明" value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="通过业务命令提交修改说明，不是手工文档编辑器。" />
      <Button variant="outline" disabled={busy || !note.trim() || group.status === "requirements-pr"} onClick={() => void perform(async () => {
        const result = await ai.command({ type: "reviseProposalMaterial", projectId: group.projectId, irId: group.id, target, note });
        if (!result) throw new Error("材料修改失败；请查看上方业务错误，输入已保留。");
        if (result.status === "completed") setNote("");
      })}>提交模拟材料修改</Button>
      <p>所有送审材料变化都撤销整包审查、终审、人工放行和三方确认；业务文档变化额外重做单评审。历史保留。</p>
    </div>
    {Boolean(group.rejectedReviewResults?.length) && <section className="space-y-2 border-t border-border pt-3" aria-label="旧评审结果拒绝记录">
      <h3 className="font-medium">旧评审结果已拒绝（模拟 owner 版本核验）</h3>
      {group.rejectedReviewResults?.map((entry, index) => {
        const review = [group.originalReview, group.review, ...(group.originalReviewHistory ?? []), ...(group.reviewHistory ?? [])]
          .find((item) => item?.id === entry.reviewId);
        return <div key={`${entry.reviewId}:${entry.at}:${index}`} className="space-y-1 break-all">
          <p role="status">拒绝原因：{entry.reason}</p>
          <p>评审：{entry.reviewId}</p>
          <p>材料版本：{review?.snapshotDigest ?? "该轮材料版本记录不可用，不能作为批准依据。"}</p>
          <time dateTime={entry.at}>{new Date(entry.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）</time>
        </div>;
      })}
    </section>}
    {feedback && <p role="status" className="whitespace-pre-wrap">{feedback}</p>}
  </div></details>;
}
