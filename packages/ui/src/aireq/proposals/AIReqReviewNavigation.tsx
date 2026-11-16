import { Button } from "@/components/ui/button.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useAIReq } from "../AIReqContext.js";
import { fullReviewCurrent, proposalViewedIndex, requirementsReviewCurrent } from "../contract.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import type { AIReqReviewAgentId } from "../contract.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";

/** 两类评审分别显示；会话仍由原生 v4 owner 管理。 */
export function AIReqReviewNavigation() {
  const ai = useAIReq()!;
  const group = ai.view?.drafts.find((item) => item.id === ai.selection.irId && item.projectId === ai.selection.projectId);
  if (!group || ai.selection.srId) return null;
  const stage = proposalViewedIndex(group, ai.selection);
  // 三方确认是交付阶段，不应把上一阶段的评审导航留在当前画面。
  if (stage !== 1 && stage !== 2) return null;
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
  // 修复：评审区原先贴靠讨论栏左边，未跟随会话和输入框的居中内容列。
  return <section className="@container/conversation max-h-[30vh] shrink-0 overflow-y-auto border-b border-border py-2 text-ui-sm [scrollbar-gutter:stable_both-edges]" data-testid="aireq-review-navigation">
    <div className={`mx-auto min-w-0 px-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
    {/* 修复：评审信息原本占满滚动内容列，外边缘比输入框宽；卡片放进同一内边距以对齐输入框。 */}
    <div className="min-w-0 space-y-2 rounded-xl border border-card-border bg-card p-3">
    <p>{original ? "原始需求 · 单 Agent" : "完整材料 · 三路审查 → 第四 Agent 终审 → 人工通过"} · {current ? "当前版本" : "旧版本只读，不能恢复批准"} · 第 {review.round ?? 1} 轮</p>
    {/* 修复：默认横向标签栏固定高度，换行后会遮住下方操作。 */}
    <Tabs value={selected} onValueChange={choose}><TabsList aria-label="评审 Agent 会话" className="w-full flex-wrap justify-start gap-y-1 group-data-horizontal/tabs:h-auto">{agents.map((agent) => <TabsTrigger key={agent.id} value={agent.id} data-testid={`review-avatar-${agent.id}`} className="h-auto flex-none gap-2 text-ui-sm">{agent.name} · {agent.status === "completed" ? "已完成" : agent.status === "failed" ? "失败" : agent.status === "running" ? "运行中" : "等待"}</TabsTrigger>)}</TabsList></Tabs>
    {!original && <Button variant="ghost" size="sm" onClick={() => ai.select({ ...ai.selection, proposalStep: "solution", discussionPhase: "solution", reviewAgent: undefined })}>返回方案讨论</Button>}
    <details>
      {/* 内部标识过长会挤占聊天区；轮次足以帮助用户定位，技术标识按需展开。 */}
      <summary className="cursor-pointer">只读审查材料与结论 · {current ? "当前版本" : "旧版本"}</summary>
      <details className="mt-2"><summary className="cursor-pointer">评审与材料版本标识</summary><p className="mt-2 whitespace-pre-wrap break-all">{review.id}</p><p className="mt-2 whitespace-pre-wrap break-all">{review.snapshotDigest}</p></details>
      {/* 修复：摘要直出内部状态和 Markdown 源码，与同页评审标签及消息展示不一致。 */}
      {agents.map((agent) => <details key={agent.id} className="mt-2"><summary className="cursor-pointer">{agent.name} · {agent.status === "completed" ? "已完成" : agent.status === "failed" ? "失败" : agent.status === "running" ? "运行中" : "等待"}</summary><AIReqMarkdownDocument>{agent.report || "本路报告尚未完成，不能放行。"}</AIReqMarkdownDocument></details>)}
      {review.report && <AIReqMarkdownDocument>{review.report}</AIReqMarkdownDocument>}
      {review.humanDecision && <p>人工决定：{review.humanDecision.employeeId} · {new Date(review.humanDecision.decidedAt).toLocaleString("zh-CN")}</p>}
    </details>
    </div>
    </div>
  </section>;
}
