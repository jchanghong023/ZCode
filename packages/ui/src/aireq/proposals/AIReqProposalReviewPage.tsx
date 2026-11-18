import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  fullReviewCurrent,
  fullReviewReadyBlocker,
  hasCurrentProposalSolution,
  requirementsReviewReadyBlocker,
  requirementsReviewCurrent,
  requirementsReviewStartBlocker,
  type AIReqRequirementGroup,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqProposalTaskActions } from "./AIReqProposalTaskActions.js";
import { proposalTaskStatus, proposalNextTask, proposalTaskTitles } from "./proposalTasks.js";

function agentStatusLabel(status: "pending" | "running" | "completed" | "failed") {
  return status === "completed"
    ? "已完成"
    : status === "failed"
      ? "评审失败"
      : status === "running"
        ? "评审中"
        : "等待评审";
}

/** 报告卡已经承担标题；正文去掉首个 Markdown 标题，避免 Agent 名在卡片内重复。 */
function reportBodyWithoutTitle(report: string) {
  return report.replace(/^#[ \t]+[^\n]*(?:\r?\n)+/, "").trimStart();
}

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
  const readyForConfirmation =
    review &&
    current &&
    !(full ? fullReviewReadyBlocker(group) : requirementsReviewReadyBlocker(group));
  const startIssue = full
    ? hasCurrentProposalSolution(group)
      ? undefined
      : "请先完善方案、任务与测试材料。"
    : requirementsReviewStartBlocker(group);
  const next = proposalNextTask(group);
  const findings = review?.findings ?? [];
  const blockingCount = findings.filter((finding) => finding.level === "blocking").length;
  const independentAgents = review?.agents?.filter((agent) => agent.id !== "summary") ?? [];
  const summaryAgent = full ? review?.agents?.find((agent) => agent.id === "summary") : undefined;
  const independentRequired = full ? (["a", "b", "c"] as const) : (["a"] as const);
  const completedIndependent = independentRequired.filter((id) =>
    review?.agents?.some(
      (agent) => agent.id === id && agent.status === "completed" && agent.report.trim(),
    ),
  ).length;
  const reportAvailable = Boolean(review?.report);
  const reportLabel = full ? "综合报告" : "评审报告";
  const reportId = review?.id ?? "";
  const [readReview, setReadReview] = useState<{ reviewId: string; open: boolean }>({
    reviewId: "",
    open: false,
  });
  // 已读状态绑定当前评审 id；父级重渲染或确认弹窗开关不能把已展开报告重置。
  const reportOpen = readReview.reviewId === reportId && readReview.open;
  const setReportOpen = (open: boolean) => setReadReview({ reviewId: reportId, open });
  const reviewed = !reportAvailable || reportOpen;
  const title = full ? "方案审查" : "需求评审";
  const status = proposalTaskStatus(group, full ? "solutionReview" : "requirementsReview");
  const statusTone =
    status === "已确认"
      ? "text-success"
      : status === "待人工确认"
        ? "text-interaction-confirmation-foreground"
        : status === "评审失败"
          ? "text-destructive"
          : status === "有待处理问题"
            ? "text-warning"
            : "text-foreground-subtle";
  const recordDetails = review ? (
    <details className="text-ui-sm text-foreground-subtle">
      <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">评审记录详情</summary>
      <div className="mt-3 space-y-2">
        <p>
          第 {review.round ?? 1} 轮 · {review.inputFiles?.length ?? 0} 份材料
        </p>
        <p>
          评审 ID：<span className="break-all font-mono">{review.id}</span>
        </p>
        <p>
          材料摘要：<span className="break-all font-mono">{review.snapshotDigest}</span>
        </p>
      </div>
    </details>
  ) : null;
  const pendingReport = review?.report ? (
    <details
      className="space-y-3"
      open={reportOpen}
      onToggle={(event) => setReportOpen(event.currentTarget.open)}
    >
      <summary className="w-fit cursor-pointer rounded-sm text-ui-sm text-foreground-subtle focus-visible:outline-2 focus-visible:outline-ring">
        {reportOpen ? `收起${reportLabel}` : `查看${reportLabel}`}
      </summary>
      <AIReqMarkdownDocument headingLevelOffset={2}>{review.report}</AIReqMarkdownDocument>
    </details>
  ) : null;
  const reportAgent = full ? summaryAgent : independentAgents[0];
  const originalReport = full ? undefined : reportAgent?.report.trimStart();
  const reportSource = originalReport || review?.report.trimStart() || "";
  const reportBody = reportBodyWithoutTitle(reportSource);
  const reportCard = review?.report ? (
    <section
      className="overflow-hidden rounded-lg border border-border/60 bg-card/40"
      aria-label={reportLabel}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-ui-base font-medium">
            {full ? "综合报告" : `${reportAgent?.name ?? "原始业务需求评审"}报告`}
          </h3>
          <p className="text-ui-sm text-foreground-subtle">
            第 {review.round ?? 1} 轮 · {review.inputFiles?.length ?? 0} 份材料 ·{" "}
            {blockingCount ? `${blockingCount} 个阻断项` : "未记录阻断项"}
            {reportAgent ? ` · ${agentStatusLabel(reportAgent.status)}` : ""}
          </p>
        </div>
        {reportAgent && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label={`查看${reportAgent.name}审查会话`}
            onClick={() =>
              ai.openProposalTask(
                full ? "solutionReviewDetail" : "requirementsReviewDetail",
                reportAgent.id,
              )
            }
          >
            查看会话
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </header>
      <div className="px-4 py-3">
        {/* 报告卡接替正文 h1 时，正文原有 h2 应直接隶属于卡片 h3。 */}
        <AIReqMarkdownDocument headingLevelOffset={reportBody === reportSource ? 3 : 2}>
          {reportBody}
        </AIReqMarkdownDocument>
      </div>
      <div className="px-4 pb-3">{recordDetails}</div>
    </section>
  ) : null;
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
      data-testid="proposal-review-page"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-7`}>
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{title}</h1>
          <span
            className={`rounded-full border border-border/60 px-2 py-0.5 text-ui-sm ${statusTone}`}
          >
            {status}
          </span>
        </header>
        {readyForConfirmation && !confirmation && (
          <p className="text-ui-sm text-foreground-subtle">
            {full
              ? "完整审查已完成。请先展开综合报告核对三路审查结论，再确认当前方案。"
              : "业务评审已完成。请展开评审报告核对结论，再确认当前需求。"}
          </p>
        )}
        {review && current && !confirmation && (
          <section
            className="grid gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-ui-sm sm:grid-cols-2"
            aria-label={full ? "综合审查摘要" : "评审摘要"}
          >
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {full ? "综合审查摘要" : "评审摘要"}
              </p>
              <p className="text-foreground-subtle">
                第 {review.round ?? 1} 轮 · {review.inputFiles?.length ?? 0} 份材料
              </p>
            </div>
            <div className="space-y-1 sm:text-right">
              <p className={blockingCount ? "text-destructive" : "text-foreground"}>
                {blockingCount ? `${blockingCount} 个阻断项待处理` : "未记录阻断项"}
              </p>
              <p className="text-foreground-subtle">
                {full
                  ? `独立审查 ${completedIndependent} / ${independentRequired.length} 已完成`
                  : "报告与人工决定绑定同一版本"}
              </p>
              <p
                className={
                  reportOpen || !reportAvailable
                    ? "text-foreground-subtle"
                    : "text-interaction-confirmation-foreground"
                }
              >
                {reportAvailable
                  ? reportOpen
                    ? `${reportLabel}已展开`
                    : `确认前请展开${reportLabel}`
                  : `${reportLabel}尚未生成`}
              </p>
            </div>
          </section>
        )}
        {confirmation ? (
          <section className="space-y-3 border-y border-border/50 py-5" aria-label="人工确认结果">
            <p className="flex items-start gap-2 text-ui-base">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                {confirmation.employeeId} 于{" "}
                <time dateTime={confirmation.decidedAt}>
                  {new Date(confirmation.decidedAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </time>{" "}
                确认了{full ? "完整方案" : "业务需求"}
                {review ? `（第 ${review.round ?? 1} 轮）` : ""}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => ai.openProposalTask(full ? "delivery" : "solution")}>
                {full ? "前往交付确认" : "进入方案设计"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                // 历史讨论保持只读，沿用管理页已有的材料修改与版本检查流程。
                onClick={() => ai.openProposalTask("management")}
              >
                前往管理需求修改材料
              </Button>
            </div>
            <p className="text-ui-sm text-foreground-subtle">
              {group.status === "requirements-pr"
                ? "文档 MR 冻结了当前材料。请先在管理需求中关闭未合并的 MR。"
                : full
                  ? "在管理需求中选择材料范围并提交修改。更新方案材料后需重新审查并确认完整方案。"
                  : "在管理需求中选择材料范围并提交修改。更新业务需求文档后需重新评审并确认。"}
            </p>
          </section>
        ) : (
          <AIReqProposalTaskActions
            key={`${group.projectId}:${group.id}:${full}`}
            group={group}
            full={full}
            reviewed={reviewed}
          />
        )}
        {!review ? (
          <section className="space-y-2 py-6">
            <p className="text-ui-base">
              {startIssue
                ? `尚未发起${title}。`
                : full
                  ? "方案材料已就绪，可发起方案审查。"
                  : "需求澄清已整理，可发起需求评审。"}
            </p>
            {!startIssue && (
              <p className="text-ui-sm text-foreground-subtle">
                发起后，{full ? "独立审查" : "评审"}意见与人工确认会汇总到这里。
              </p>
            )}
            <Button
              variant="ghost"
              onClick={() => ai.openProposalTask(full ? "solution" : "requirements")}
            >
              {startIssue
                ? full
                  ? "前往完善方案"
                  : "前往需求澄清"
                : full
                  ? "查看方案材料"
                  : "查看需求澄清"}
            </Button>
          </section>
        ) : (
          <>
            {!current && (
              <p role="status" className="text-ui-sm text-foreground-subtle">
                材料已更新，以下意见仅供追溯，不能用于确认当前版本。
                <Button variant="link" onClick={() => ai.openProposalTask(next)}>
                  前往{proposalTaskTitles[next]}
                </Button>
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
            <section className="space-y-3" aria-label={full ? "独立审查" : "评审意见"}>
              <h2 className="text-ui-base font-medium">
                {full ? "独立审查" : "评审意见"}
              </h2>
              {!full && confirmation ? (
                reportCard
              ) : independentAgents.length ? (
                <ul className="divide-y divide-border/50">
                  {independentAgents.map((agent) => (
                    <li
                      key={agent.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words text-ui-base font-medium">{agent.name}</p>
                        <p className="text-ui-sm text-foreground-subtle">
                          {agentStatusLabel(agent.status)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`查看${agent.name}审查会话`}
                        onClick={() =>
                          ai.openProposalTask(
                            full ? "solutionReviewDetail" : "requirementsReviewDetail",
                            agent.id,
                          )
                        }
                      >
                        查看会话
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-ui-sm text-foreground-subtle">暂无独立评审记录。</p>
              )}
              {!full && !confirmation && (
                <>
                  {pendingReport ?? (
                    <p className="py-3 text-ui-sm text-foreground-subtle">
                      {reportLabel}尚未生成。
                    </p>
                  )}
                  {recordDetails}
                </>
              )}
            </section>
            {full && (
              <section className="space-y-3" aria-label="综合报告">
                <h2 className="text-ui-base font-medium">综合报告</h2>
                {confirmation ? (
                  reportCard
                ) : (
                  <>
                    {summaryAgent && (
                      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                        <p className="text-ui-sm text-foreground-subtle">
                          {agentStatusLabel(summaryAgent.status)}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="查看综合终审会话"
                          onClick={() => ai.openProposalTask("solutionReviewDetail", "summary")}
                        >
                          查看会话
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                    {pendingReport ?? (
                      <p className="py-3 text-ui-sm text-foreground-subtle">
                        {reportLabel}尚未生成。
                      </p>
                    )}
                    {recordDetails}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
