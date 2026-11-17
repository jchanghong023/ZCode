import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useAIReq } from "../AIReqContext.js";
import { fullReviewCurrent, proposalViewedIndex, requirementsReviewCurrent } from "../contract.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import type { AIReqReviewAgentId } from "../contract.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "../shell/pageLayout.js";

/** 两类评审分别显示；会话仍由原生 v4 owner 管理。 */
export function AIReqReviewNavigation({
  detailsOpen,
  onDetailsChange,
}: {
  detailsOpen: boolean;
  onDetailsChange(open: boolean): void;
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const group = ai.view?.drafts.find(
    (item) => item.id === ai.selection.irId && item.projectId === ai.selection.projectId,
  );
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
  // 用户切换评审会话也会替换当前工作区，必须先接纳未保存修改的离开请求。
  const choose = (id: string) =>
    ai.navigate(() =>
      ai.select({
        ...ai.selection,
        proposalStep: original ? "requirements-review" : "solution",
        discussionPhase: original ? "requirements" : "solution",
        reviewAgent: id as AIReqReviewAgentId,
      }),
    );
  const subject = original
    ? zh
      ? "业务需求"
      : "requirements"
    : zh
      ? "完整方案"
      : "complete solution";
  // 人工确认必须属于本次评审和当前材料，不能把 AI 完成或旧版本批准当成有效确认。
  const confirmed =
    current && review.passed && review.humanDecision?.reviewId === review.id
      ? review.humanDecision
      : undefined;
  const expectedAgents = original ? ["a"] : ["a", "b", "c", "summary"];
  const completed = expectedAgents.every((id) =>
    agents.some((agent) => agent.id === id && agent.status === "completed" && agent.report.trim()),
  );
  const blocked = review.findings?.some((finding) => finding.level === "blocking");
  const reviewName = original ? "需求评审" : "方案审查";
  const state = !current
    ? zh
      ? "材料已更新，需要重新评审并确认"
      : "Materials changed. Review and confirmation are required again."
    : agents.some((agent) => agent.status === "failed")
      ? zh
        ? `${reviewName}失败，请查看详情后重试`
        : "Review failed. Check the details and retry."
      : blocked
        ? zh
          ? `${reviewName}发现待解决问题，请查看详情`
          : "The review found issues that need attention."
        : completed && review.report.trim()
          ? zh
            ? `${reviewName}已完成，等待人工确认`
            : "Review completed. Awaiting human confirmation."
          : agents.some((agent) => agent.status === "running" || agent.status === "pending")
            ? zh
              ? `${reviewName}进行中，尚未人工确认`
              : "Review in progress. Not yet confirmed."
            : zh
              ? `${reviewName}材料尚未完整，请查看详情`
              : "Review materials are incomplete. Check the details.";
  const status = (value: string) =>
    value === "completed"
      ? "已完成"
      : value === "failed"
        ? "失败"
        : value === "running"
          ? "进行中"
          : "等待";
  return (
    <section
      className="max-h-[30vh] shrink-0 overflow-y-auto border-b border-border/50 py-3 text-ui-sm [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-review-navigation"
    >
      <div className={`mx-auto min-w-0 space-y-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
        <p className="text-foreground" data-testid="review-confirmation-summary">
          {confirmed ? (
            <>
              <span className="font-medium">{confirmed.employeeId}</span>
              {zh ? " 于 " : " · "}
              <time dateTime={confirmed.decidedAt}>
                {new Date(confirmed.decidedAt).toLocaleString(locale, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {zh ? ` 确认了${subject}` : ` confirmed the ${subject}`}
            </>
          ) : (
            state
          )}
        </p>
        <details
          open={detailsOpen}
          onToggle={(event) => {
            if (event.target === event.currentTarget) onDetailsChange(event.currentTarget.open);
          }}
        >
          <summary className="w-fit cursor-pointer rounded-sm text-foreground-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            {zh ? (original ? "查看评审详情" : "查看方案审查详情") : "Review details"}
          </summary>
          <div className="mt-3 min-w-0 space-y-3">
            <p className="text-foreground-subtle">
              {original
                ? zh
                  ? "需求评审"
                  : "Requirements review"
                : zh
                  ? "方案评审"
                  : "Solution review"}{" "}
              ·{" "}
              {zh
                ? `第 ${review.round ?? 1} 轮 · ${review.inputFiles?.length ?? 0} 份材料`
                : `Round ${review.round ?? 1} · ${review.inputFiles?.length ?? 0} materials`}
            </p>
            <Tabs value={selected} onValueChange={choose}>
              <TabsList
                aria-label="评审 Agent 会话"
                className="w-full flex-wrap justify-start gap-y-1 group-data-horizontal/tabs:h-auto"
              >
                {agents.map((agent) => (
                  <TabsTrigger
                    key={agent.id}
                    value={agent.id}
                    data-testid={`review-avatar-${agent.id}`}
                    className="h-auto flex-none gap-2 text-ui-sm"
                  >
                    {agent.name} · {status(agent.status)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {!original && selected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  ai.navigate(() =>
                    ai.select({
                      ...ai.selection,
                      proposalStep: "solution",
                      discussionPhase: "solution",
                      reviewAgent: undefined,
                    }),
                  )
                }
              >
                {zh ? "返回方案讨论" : "Back to solution discussion"}
              </Button>
            )}
            {review.invalidatedReason && (
              <p className="text-foreground-subtle">{review.invalidatedReason}</p>
            )}
            {agents.map((agent) => (
              <details key={agent.id}>
                <summary className="cursor-pointer">
                  {agent.name} · {status(agent.status)}
                </summary>
                <AIReqMarkdownDocument>
                  {agent.report || (zh ? "报告尚未完成。" : "Report not yet completed.")}
                </AIReqMarkdownDocument>
              </details>
            ))}
            {review.report && (
              <details>
                <summary className="cursor-pointer">
                  {zh ? "综合评审意见" : "Overall review"}
                </summary>
                <AIReqMarkdownDocument>{review.report}</AIReqMarkdownDocument>
              </details>
            )}
            {!current && review.humanDecision && (
              <p className="text-foreground-subtle">
                {zh ? "旧版本确认（已失效）：" : "Previous confirmation (invalidated): "}
                {review.humanDecision.employeeId} ·{" "}
                {new Date(review.humanDecision.decidedAt).toLocaleString(locale)}
              </p>
            )}
            <details className="text-foreground-subtle">
              <summary className="cursor-pointer">{zh ? "技术信息" : "Technical details"}</summary>
              <p className="mt-2 break-all">{review.id}</p>
              <p className="mt-2 break-all">{review.snapshotDigest}</p>
            </details>
          </div>
        </details>
      </div>
    </section>
  );
}
