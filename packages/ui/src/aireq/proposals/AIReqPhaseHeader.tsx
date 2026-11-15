import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { proposalProgressIndex, proposalViewedIndex, requirementsReviewStartBlocker, requirementsReviewReadyBlocker, hasCurrentProposalSolution, fullReviewReadyBlocker, fullReviewCurrent, proposalVersion } from "../contract.js";
import type { AIReqSelection } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqWorkflowTimeline } from "./AIReqWorkflowTimeline.js";
import { AIReqProposalDeliveryControls, AIReqProposalBackgroundStatus } from "./AIReqProposalDeliveryControls.js";
import { AIReqProposalSimulation } from "./AIReqProposalSimulation.js";

const labels = ["业务需求", "原始需求评审", "完整方案与审查", "三方确认与 PR"];
const steps: NonNullable<AIReqSelection["proposalStep"]>[] = ["requirements", "requirements-review", "solution", "intake"];
const perspectives = [["business", "业务"], ["development", "开发"], ["testing", "测试"]] as const;

/** 只投影 owner 的门禁；每个按钮仍提交当前版本和实际操作者。 */
export function AIReqPhaseHeader({ details = null, placement = "header" }: { details?: ReactNode; placement?: "header" | "document" }) {
  const ai = useAIReq()!;
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState("");
  const group = ai.view?.drafts.find((item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId);
  if (!group || !ai.view || ai.selection.srId) return placement === "header" ? <>{details}</> : null;
  const phase = proposalProgressIndex(group, ai.selection);
  const selected = proposalViewedIndex(group, ai.selection);
  const history = phase !== selected;
  const frozen = group.status === "requirements-pr";
  const running = ai.view.running.some((item) => item.projectId === group.projectId && item.irId === group.id);
  const target = { projectId: group.projectId, irId: group.id };
  const originalIssue = requirementsReviewStartBlocker(group);
  const originalReadyIssue = requirementsReviewReadyBlocker(group);
  const fullIssue = hasCurrentProposalSolution(group) ? undefined : "请先完善全部 SR 的规格、设计、任务和测试方案，以及 IR 整体验收材料。";
  const fullReadyIssue = fullReviewReadyBlocker(group);
  const version = proposalVersion(group);
  const review = selected === 1 ? group.originalReview : group.review;
  const current = () => ai.select({ ...ai.selection, proposalStep: undefined, discussionPhase: undefined, reviewAgent: undefined, materialPath: undefined });
  if (placement === "header") return <header className="shrink-0 space-y-2 border-b border-border px-4 py-2" data-testid="aireq-phase-header">
    {details}
    <AIReqWorkflowTimeline labels={labels} phase={phase} selected={selected} complete={false} running={running} proposal sr={false}
      rounds={[group.proposalRound ?? 1, group.originalReview?.round ?? 0, group.review?.round ?? 0, 0]}
      returned={Boolean(group.returnFeedback)} canNavigate
      entered={labels.map((_, index) => index <= phase || (index === 1 && Boolean(group.originalReview)) || (index === 2 && group.sessions.some((item) => item.phase === "solution")) || (index === 3 && Boolean(group.proposalDelivery)))}
      onSelect={(index) => ai.select({ ...ai.selection, proposalStep: steps[index], discussionPhase: index >= 2 ? "solution" : "requirements", reviewAgent: undefined, materialPath: undefined })}
      review={selected === 1 ? group.originalReview : undefined} reviewAgent={ai.selection.reviewAgent ?? (selected === 1 ? "a" : undefined)} canOpenReview={selected === 1}
      onSelectReview={(id) => ai.select({ ...ai.selection, proposalStep: "requirements-review", discussionPhase: "requirements", reviewAgent: id })} />
    <p className="text-center text-ui-sm text-foreground-subtle" data-testid="aireq-phase-agent">{history ? "历史阶段只读；查看不会运行或恢复批准。" : frozen ? "文档 PR 已提交，材料冻结；修改前须关闭未合并 PR。" : running ? "模拟 Agent 运行中" : `当前：${labels[phase]} · 服务端共享内存模拟`}</p>
  </header>;
  return <footer className="max-h-[48vh] shrink-0 space-y-3 overflow-auto border-t border-border px-4 py-3 text-ui-sm" data-testid="aireq-document-actions">
    {history ? <Button variant="outline" onClick={current}>返回当前阶段</Button> : <>
      {phase === 0 && <><p>{originalIssue ?? "业务材料就绪后先进行单 Agent 评审；通过前不会生成 SR。"}</p><Button disabled={ai.pending || running || Boolean(originalIssue)} onClick={() => void ai.command({ type: "runRequirementsReview", ...target })}>发起原始需求单 Agent 评审</Button></>}
      {phase === 1 && <>
        <p>{originalReadyIssue ?? "阅读业务需求评审意见，由人工通过或退回。"}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={ai.pending || running || Boolean(originalReadyIssue)} onClick={() => void ai.command({ type: "acceptProposal", ...target, reviewId: group.originalReview?.id, snapshotDigest: group.originalReview?.snapshotDigest })}>人工通过原始需求，进入方案</Button>
          <Button variant="outline" disabled={ai.pending || running || Boolean(originalIssue)} onClick={() => void ai.command({ type: "runRequirementsReview", ...target })}>重新运行原始需求评审</Button>
          <Button variant="outline" disabled={running} onClick={() => setBack(true)}>退回业务补充</Button>
        </div>
      </>}
      {phase === 2 && <><p>{fullIssue ?? "当前完整包可送三路审查，再由第四 Agent 终审；不会自动授权。"}</p><div className="flex flex-wrap gap-2"><Button disabled={ai.pending || running || Boolean(fullIssue)} onClick={() => void ai.command({ type: "runFullReview", ...target })}>发起完整材料三审与终审</Button><Button disabled={ai.pending || running || Boolean(fullReadyIssue)} title={fullReadyIssue} onClick={() => void ai.command({ type: "approveFullReview", ...target, reviewId: group.review!.id, snapshotDigest: group.review!.snapshotDigest })}>人工通过完整终审</Button><Button variant="outline" disabled={running} onClick={() => setBack(true)}>退回业务补充</Button></div><p>{fullReadyIssue}</p></>}
      {phase === 3 && !frozen && <><p>开发组织三方对齐：三个视角分别绑定同一材料版本，同一工号可分别确认。</p><div className="space-y-2">{perspectives.map(([perspective, label]) => {
        const confirmation = group.alignment?.find((item) => item.perspective === perspective && item.version === version);
        return <div key={perspective} className="flex flex-wrap items-center justify-between gap-2"><span>{label}视角：{confirmation ? `${confirmation.employeeId} · ${new Date(confirmation.confirmedAt).toLocaleString("zh-CN")}` : "未确认"}</span><Button variant="outline" disabled={ai.pending || Boolean(confirmation) || !fullReviewCurrent(group) || !group.review?.humanDecision} onClick={() => void ai.command({ type: "confirmAlignment", ...target, perspective, version })}>确认{label}视角</Button></div>;
      })}</div></>}
      {phase === 3 && <AIReqProposalDeliveryControls group={group} />}
      {frozen && group.proposalDelivery && <Button variant="outline" onClick={() => void ai.command({ type: "closeProposalPr", ...target, candidate: group.proposalDelivery!.candidate })}>关闭未合并文档 PR 后修改</Button>}
      <AIReqProposalSimulation key={group.id} group={group} />
    </>}
    {review?.report && <details><summary className="cursor-pointer">{selected === 1 ? "原始需求单评审" : "完整审查终审"}报告 · {review.id}</summary><p className="mt-2 whitespace-pre-wrap">{review.report}</p></details>}
    <Dialog open={back} onOpenChange={setBack}><DialogContent><DialogHeader><DialogTitle>退回业务补充</DialogTitle><DialogDescription>保留旧材料和意见。业务原文修改后需要重做单评审；任何材料改变均使整包批准失效。</DialogDescription></DialogHeader><SettingsFormTextarea aria-label="退回原因" rows={8} value={reason} onChange={(event) => setReason(event.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setBack(false)}>取消</Button><Button disabled={!reason.trim() || ai.pending} onClick={async () => { const result = await ai.command({ type: "returnProposal", ...target, reason }); if (result?.status === "completed") { setBack(false); setReason(""); } }}>确认退回</Button></DialogFooter></DialogContent></Dialog>
  </footer>;
}
export function AIReqDocumentPhaseActions() { return <AIReqPhaseHeader placement="document" />; }
export function AIReqProposalStageBody() {
  const ai = useAIReq()!;
  const group = ai.view?.drafts.find((item) => item.id === ai.selection.irId && item.projectId === ai.selection.projectId);
  return <main className="min-h-0 flex-1 space-y-4 overflow-auto p-6 text-ui-base"><h2 className="font-medium">三方对齐与文档 PR · 服务端内存模拟</h2><p>原生讨论和材料历史保留。提交后冻结，等待 owner 核验同一完整候选合入，不根据 URL 或按钮推断转正。</p>{group?.proposalDelivery?.pushedAt && <AIReqProposalBackgroundStatus group={group} />}</main>;
}
