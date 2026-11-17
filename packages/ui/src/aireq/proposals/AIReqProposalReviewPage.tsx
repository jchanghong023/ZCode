import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  fullReviewCurrent,
  requirementsReviewCurrent,
  type AIReqRequirementGroup,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqProposalTaskActions } from "./AIReqProposalTaskActions.js";
import { proposalTaskStatus } from "./proposalTasks.js";

export function AIReqProposalReviewPage({
  group,
  full,
}: {
  group: AIReqRequirementGroup;
  full: boolean;
}) {
  const ai = useAIReq()!;
  const review = full ? group.review : group.originalReview;
  const current = full ? fullReviewCurrent(group) : requirementsReviewCurrent(group);
  const confirmation =
    current && review?.passed && review.humanDecision?.reviewId === review.id
      ? review.humanDecision
      : undefined;
  const findings = review?.findings ?? [];
  const title = full ? "方案审查" : "需求评审";
  const status = proposalTaskStatus(group, full ? "solutionReview" : "requirementsReview");
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
      data-testid="proposal-review-page"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-7`}>
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{title}</h1>
          <span className="text-ui-sm text-foreground-subtle">{status}</span>
        </header>
        {confirmation ? (
          <section className="space-y-3 border-y border-border/50 py-5" aria-label="人工确认结果">
            <p className="flex items-start gap-2 text-ui-base">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                {confirmation.employeeId} 于{" "}
                <time dateTime={confirmation.decidedAt}>
                  {new Date(confirmation.decidedAt).toLocaleString("zh-CN")}
                </time>{" "}
                确认了{full ? "完整方案" : "业务需求"}
              </span>
            </p>
            <Button onClick={() => ai.openProposalTask(full ? "delivery" : "solution")}>
              {full ? "前往交付确认" : "进入方案设计"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </section>
        ) : (
          <AIReqProposalTaskActions
            key={`${group.projectId}:${group.id}:${full}`}
            group={group}
            full={full}
          />
        )}
        {!review ? (
          <section className="space-y-2 py-6">
            <p className="text-ui-base">尚未发起{title}。</p>
            <p className="text-ui-sm text-foreground-subtle">
              {full
                ? "完善方案材料后发起独立审查，结论汇总到这里。"
                : "先完成需求澄清，再发起业务需求评审。"}
            </p>
            <Button
              variant="ghost"
              onClick={() => ai.openProposalTask(full ? "solution" : "requirements")}
            >
              {full ? "前往完善方案" : "前往需求澄清"}
            </Button>
          </section>
        ) : (
          <>
            {!current && (
              <p role="status" className="text-ui-sm text-foreground-subtle">
                材料已更新，以下意见仅供追溯，需要重新评审并确认。
              </p>
            )}
            {findings.length > 0 && (
              <section className="space-y-3" aria-label="待处理问题">
                <h2 className="text-ui-base font-medium">待处理问题</h2>
                <ul className="divide-y divide-border/50">
                  {findings.map((finding) => (
                    <li key={finding.id} className="space-y-1 py-3">
                      <span className="text-ui-sm text-foreground-subtle">
                        {finding.level === "blocking" ? "需要解决" : "建议"}
                      </span>
                      <p className="break-words text-ui-base">{finding.message}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="space-y-3" aria-label="独立评审记录">
              <h2 className="text-ui-base font-medium">{full ? "独立审查" : "评审意见"}</h2>
              <ul className="divide-y divide-border/50">
                {review.agents?.map((agent) => (
                  <li
                    key={agent.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words text-ui-base font-medium">{agent.name}</p>
                      <p className="text-ui-sm text-foreground-subtle">
                        {agent.status === "completed"
                          ? "已完成"
                          : agent.status === "failed"
                            ? "评审失败"
                            : agent.status === "running"
                              ? "评审中"
                              : "等待评审"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={`查看${agent.name}`}
                      onClick={() =>
                        ai.openProposalTask(
                          full ? "solutionReviewDetail" : "requirementsReviewDetail",
                          agent.id,
                        )
                      }
                    >
                      查看
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
            {review.report && (
              <details className="space-y-3">
                <summary className="w-fit cursor-pointer text-ui-sm text-foreground-subtle">
                  查看综合评审意见
                </summary>
                <AIReqMarkdownDocument>{review.report}</AIReqMarkdownDocument>
              </details>
            )}
            <details className="text-ui-sm text-foreground-subtle">
              <summary className="w-fit cursor-pointer">评审记录详情</summary>
              <div className="mt-3 space-y-2">
                <p>
                  第 {review.round ?? 1} 轮 · {review.inputFiles?.length ?? 0} 份材料
                </p>
                <p className="break-all font-mono">{review.id}</p>
                <p className="break-all font-mono">{review.snapshotDigest}</p>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
