import { Button } from "@/components/ui/button.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useAIReq } from "../AIReqContext.js";
import { fullReviewCurrent, proposalViewedIndex, requirementsReviewCurrent } from "../contract.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import type { AIReqReviewAgentId } from "../contract.js";

/** 两类评审分别显示；会话仍由原生 v4 owner 管理。 */
export function AIReqReviewNavigation() {
  const ai = useAIReq()!;
  const group = ai.view?.drafts.find((item) => item.id === ai.selection.irId && item.projectId === ai.selection.projectId);
  if (!group || ai.selection.srId) return null;
  const stage = proposalViewedIndex(group, ai.selection);
  if (stage !== 1 && stage !== 2 && stage !== 3) return null;
  const original = stage === 1;
  const review = original ? group.originalReview : group.review;
  const current = original ? requirementsReviewCurrent(group) : fullReviewCurrent(group);
  if (!review) return null;
  const agents = review.agents ?? [];
  // 修复：方案讨论没有评审选择，不能伪选综合头像而吞掉首次点击。
  const selected = ai.selection.reviewAgent ?? (original ? "a" : "");
  const choose = (id: string) => ai.select({
    ...ai.selection, proposalStep: original ? "requirements-review" : "solution",
    discussionPhase: original ? "requirements" : "solution", reviewAgent: id as AIReqReviewAgentId,
  });
  return <section className="max-h-[30vh] shrink-0 space-y-2 overflow-auto border-b border-border px-4 py-2 text-ui-sm" data-testid="aireq-review-navigation">
    <p>{original ? "原始需求 · 单 Agent" : "完整材料 · 三路审查 → 第四 Agent 终审 → 人工通过"} · {current ? "当前版本" : "旧版本只读，不能恢复批准"} · 第 {review.round ?? 1} 轮</p>
    <Tabs value={selected} onValueChange={choose}><TabsList aria-label="评审 Agent 会话" className="h-auto flex-wrap">{agents.map((agent) => <TabsTrigger key={agent.id} value={agent.id} data-testid={`review-avatar-${agent.id}`} className="gap-2 text-ui-sm">{agent.name} · {agent.status === "completed" ? "已完成" : agent.status === "failed" ? "失败" : agent.status === "running" ? "运行中" : "等待"}</TabsTrigger>)}</TabsList></Tabs>
    {!original && <Button variant="ghost" size="sm" onClick={() => ai.select({ ...ai.selection, proposalStep: "solution", discussionPhase: "solution", reviewAgent: undefined })}>返回方案讨论</Button>}
    <details>
      <summary className="cursor-pointer">只读审查材料与结论 · {current ? "当前版本" : "旧版本"} · {review.id}</summary>
      <details className="mt-2"><summary className="cursor-pointer">完整材料版本标识</summary><p className="mt-2 whitespace-pre-wrap break-all">{review.snapshotDigest}</p></details>
      {agents.map((agent) => <details key={agent.id} className="mt-2"><summary className="cursor-pointer">{agent.name} · {agent.status}</summary><AIReqMarkdownDocument>{agent.report || "本路报告尚未完成，不能放行。"}</AIReqMarkdownDocument></details>)}
      <p className="mt-2 whitespace-pre-wrap">{review.report}</p>
      {review.humanDecision && <p>人工决定：{review.humanDecision.employeeId} · {new Date(review.humanDecision.decidedAt).toLocaleString("zh-CN")}</p>}
    </details>
  </section>;
}
