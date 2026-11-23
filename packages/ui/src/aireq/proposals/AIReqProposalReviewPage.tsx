import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button.js";
import { getEmployeeId } from "../identity.js";
import { hasProjectRole } from "../contract.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import {
  alignmentBlocker,
  fullReviewCurrent,
  fullReviewReadyBlocker,
  proposalAlignmentCurrent,
  proposalReviewCanRetry,
  proposalReturnBlocker,
  requirementsReviewCurrent,
  type AIReqRequirementGroup,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqProposalAlignment } from "./AIReqProposalAlignment.js";
import { AIReqProposalTaskActions } from "./AIReqProposalTaskActions.js";
import { AIReqProposalReturn } from "./AIReqProposalReturn.js";
import { proposalTaskStatus } from "./proposalTasks.js";

const detailsClass =
  "w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring";
const roleLabels = { business: "业务", development: "开发", testing: "测试" };
const reviewTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

export function AIReqProposalMaterialCheck({
  check,
  compact = false,
}: {
  check: AIReqRequirementGroup["requirementsCheck"];
  compact?: boolean;
}) {
  if (compact && !check?.issues.length) return null;
  return (
    <section className="min-w-0 space-y-2" aria-label="材料校验">
      <p className="text-ui-sm font-medium" role="status">
        {check?.issues.length ? "材料校验失败" : check ? "材料校验已通过" : "等待材料校验"}
      </p>
      {check && check.issues.length > 0 && (
        <ul
          className={`divide-y divide-border/50 ${compact ? "max-h-32 overflow-auto overscroll-contain" : ""}`}
        >
          {check.issues.map((issue, index) => (
            <li key={`${issue.path}:${index}`} className="space-y-1 py-2">
              <p className="break-all font-mono text-ui-sm text-foreground">{issue.path}</p>
              <p className="break-words text-ui-sm text-destructive">{issue.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AIReqProposalReviewPage({
  group,
  full,
}: {
  group: AIReqRequirementGroup;
  full: boolean;
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const developer = hasProjectRole(ai.view, group.projectId, getEmployeeId(), "development");
  const heading = useRef<HTMLHeadingElement>(null);
  const review = full ? group.review : group.originalReview;
  const current = full ? fullReviewCurrent(group) : requirementsReviewCurrent(group);
  const confirmation =
    !full &&
    current &&
    review?.passed &&
    review.humanDecision?.reviewId === review.id &&
    review.humanDecision.snapshotDigest === review.snapshotDigest
      ? review.humanDecision
      : undefined;
  const fullConfirmed = full && !alignmentBlocker(group);
  const fullReady = full && !fullReviewReadyBlocker(group);
  const canEditMaterials = !full || developer;
  const returnTarget = full ? "solution" : "requirements";
  const canReturn =
    current &&
    (developer || (!full && !confirmation)) &&
    !proposalReturnBlocker(group, returnTarget);
  const feedback = group.returnFeedback;
  const canRetry = canEditMaterials && proposalReviewCanRetry(group, full);
  const title = full ? "方案审查" : "需求评审";
  const reportLabel = full ? "综合报告" : "评审报告";
  const status = proposalTaskStatus(group, full ? "solutionReview" : "requirementsReview");
  const statusTone =
    status === "已确认"
      ? "text-success"
      : status === "待人工确认"
        ? "text-interaction-confirmation-foreground"
        : status === "评审失败" || status === "校验失败"
          ? "text-destructive"
          : "text-foreground-subtle";
  const directReturn = !full && !confirmation;
  const check = full ? group.solutionCheck : group.requirementsCheck;
  const agents = review?.agents ?? [];
  const independentAgents = agents.filter((agent) => agent.id !== "summary");
  const failedAgents = agents.filter(
    (agent) => agent.status === "failed" || (agent.status === "completed" && !agent.report.trim()),
  );
  const reportAgent = agents.find((agent) => agent.id === (full ? "summary" : "a"));
  const completedIndependent = agents.filter(
    (agent) => agent.id !== "summary" && agent.status === "completed" && agent.report.trim(),
  ).length;
  const reportSource = review?.report.trim() ?? "";
  // 报告标题由页面的 h2 提供；去掉 Markdown 一级标题后，二级小节应紧接为 h3。
  const reportBody = reportSource.replace(/^#[ \t]+[^\n]*(?:\r?\n)+/, "").trimStart();
  const hasReport = reportAgent?.status === "completed" && Boolean(reportBody);
  const history = [
    ...(full ? (group.reviewHistory ?? []) : (group.originalReviewHistory ?? [])),
    ...(!current && review ? [review] : []),
  ].filter((entry, index, entries) => entries.findIndex((item) => item.id === entry.id) === index);
  const pastRoles = full
    ? [
        ...(group.alignmentHistory ?? []),
        ...(group.alignment ?? []).filter((entry) => !proposalAlignmentCurrent(group, entry)),
      ]
    : [];
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]"
      data-testid="proposal-review-page"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-6`}>
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 ref={heading} tabIndex={-1} className={AIREQ_PAGE_TITLE_CLASSNAME}>
            {title}
          </h1>
          <span
            role="status"
            className={`rounded-full border border-border/60 px-2 py-0.5 text-ui-sm ${statusTone}`}
          >
            {status}
          </span>
          {canReturn && source.capabilities.proposalDiscussion && (
            <div className="ml-auto">
              <AIReqProposalReturn
                group={group}
                target={returnTarget}
                focusFallback={heading}
                direct={directReturn}
                label={directReturn ? "返回需求澄清" : undefined}
              />
            </div>
          )}
        </header>
        {!(current && hasReport) && <AIReqProposalMaterialCheck check={check} />}
        {!full && feedback && feedback.target !== "solution" && !feedback.resumedAt && (
          <section className="space-y-2" aria-label="当前退回意见">
            <p className="text-ui-sm font-medium">已退回业务补充 · 第 {feedback.round} 轮</p>
            <p className="text-ui-sm text-foreground-subtle">
              {feedback.employeeId} · {reviewTime(feedback.returnedAt)}
              （北京时间）
            </p>
            <p className="whitespace-pre-wrap break-words text-ui-sm">{feedback.reason}</p>
          </section>
        )}
        {canEditMaterials &&
          (check?.issues.length ? (
            <Button
              variant="outline"
              onClick={() => ai.openProposalTask(full ? "solution" : "requirements")}
            >
              {full ? "前往完善方案" : "前往需求澄清"}
            </Button>
          ) : (
            !current && (
              <div className="space-y-2">
                <p className="text-ui-sm text-foreground-subtle">
                  {check
                    ? "当前材料尚未提交。请核对后发起评审。"
                    : "先完善材料，校验通过后可提交评审。"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => ai.openProposalTask(full ? "solution" : "requirements")}
                >
                  {full ? "前往方案设计" : "前往需求澄清"}
                </Button>
              </div>
            )
          ))}
        {current && review && (
          <section
            className="min-w-0 space-y-4 rounded-xl border border-card-border bg-card p-4 lg:p-6"
            aria-labelledby="proposal-review-report"
          >
            <h2 id="proposal-review-report" className="text-ui-lg font-semibold">
              {reportLabel}
            </h2>
            {hasReport ? (
              <AIReqMarkdownDocument>{reportBody}</AIReqMarkdownDocument>
            ) : (
              <div className="space-y-2 text-ui-sm text-foreground-subtle">
                {full && (
                  <p role="status">
                    三路审查已完成 {completedIndependent} / 3
                    {completedIndependent === 3 &&
                      reportAgent?.status === "running" &&
                      " · 综合终审中"}
                  </p>
                )}
                {canRetry ? (
                  <p role="alert" className="break-words text-destructive">
                    {failedAgents.length
                      ? `${failedAgents.map((agent) => agent.name).join("、")}未生成可读报告。`
                      : `${reportLabel}缺失或不可读取。`}
                    {
                      failedAgents.find((agent) => agent.report && !agent.report.includes("请重试"))
                        ?.report
                    }
                  </p>
                ) : (
                  <p>{reportLabel}尚未生成。</p>
                )}
              </div>
            )}
            {hasReport && Boolean(review.findings?.length) && (
              <section className="space-y-2" aria-label="主要意见">
                <h3 className="text-ui-base font-medium">主要意见</h3>
                <ul className="divide-y divide-border/50">
                  {review.findings?.map((finding) => (
                    <li key={finding.id} className="space-y-1 py-3">
                      <p className="text-ui-sm text-foreground-subtle">
                        {finding.level === "blocking" ? "重点意见" : "建议"}
                        {finding.documentPath && (
                          <span className="ml-2 break-all font-mono">{finding.documentPath}</span>
                        )}
                      </p>
                      <p className="break-words text-ui-base">{finding.message}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}
        {full && current && hasReport && independentAgents.length > 0 && (
          <section className="space-y-2" aria-label="三路审查报告">
            <h2 className="text-ui-lg font-semibold">三路审查报告</h2>
            {independentAgents.map((agent) => (
              <details
                key={agent.id}
                className="rounded-lg border border-card-border bg-card px-3 py-2"
              >
                <summary className={detailsClass}>
                  {agent.name} ·{" "}
                  {agent.status === "completed" && agent.report.trim()
                    ? "报告已完成"
                    : "报告暂不可用"}
                </summary>
                {agent.report.trim() && (
                  <div className="mt-2">
                    <AIReqMarkdownDocument headingLevelOffset={2}>
                      {agent.report}
                    </AIReqMarkdownDocument>
                  </div>
                )}
              </details>
            ))}
          </section>
        )}
        {(!full || canRetry) && (
          <AIReqProposalTaskActions group={group} full={full} focusFallback={heading} />
        )}
        {fullReady && hasReport && !fullConfirmed && <AIReqProposalAlignment group={group} />}
        {(confirmation || fullConfirmed) && (
          <section
            className="space-y-3 border-y border-border/50 py-4"
            aria-label="确认记录与下一步"
          >
            {confirmation ? (
              <p className="flex items-start gap-2 text-ui-base">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  {confirmation.employeeId} 于{" "}
                  <time dateTime={confirmation.decidedAt}>
                    {reviewTime(confirmation.decidedAt)}
                  </time>
                  （北京时间）确认了业务需求（第 {review?.round ?? 1} 轮）。
                </span>
              </p>
            ) : (
              <AIReqProposalAlignment group={group} readOnly />
            )}
            {developer && (
              <Button onClick={() => ai.openProposalTask(full ? "delivery" : "solution")}>
                {full ? "前往交付确认" : "进入方案设计"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </section>
        )}
        {ai.error && (
          <p role="alert" className="break-words text-ui-sm text-destructive">
            {ai.error}
          </p>
        )}
        {(history.length > 0 || pastRoles.length > 0) && (
          <details className="space-y-3 border-t border-border/50 pt-4 text-ui-sm">
            <summary className={detailsClass}>历史评审与确认 · 只读</summary>
            {history.map((entry) => (
              <details key={entry.id} className="space-y-2">
                <summary className={detailsClass}>
                  第 {entry.round ?? 1} 轮 · {reviewTime(entry.createdAt)}（北京时间）
                </summary>
                {entry.invalidatedReason && <p>{entry.invalidatedReason}</p>}
                {!full && entry.humanDecision && (
                  <p>
                    {entry.humanDecision.employeeId} 于 {reviewTime(entry.humanDecision.decidedAt)}
                    （北京时间）确认了旧版业务需求。
                  </p>
                )}
                {entry.report.trim() && (
                  <AIReqMarkdownDocument headingLevelOffset={2}>
                    {entry.report}
                  </AIReqMarkdownDocument>
                )}
              </details>
            ))}
            {pastRoles.map((entry, index) => (
              <p key={`${entry.perspective}:${entry.confirmedAt}:${index}`} className="break-words">
                {roleLabels[entry.perspective]} · {entry.employeeId} ·{" "}
                {reviewTime(entry.confirmedAt)}（北京时间） · 旧版确认
              </p>
            ))}
          </details>
        )}
      </div>
    </main>
  );
}
