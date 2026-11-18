import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  alignmentBlocker,
  fullReviewCurrent,
  proposalAlignmentCurrent,
  proposalReviewCanRetry,
  requirementsReviewCurrent,
  type AIReqRequirementGroup,
  type AIReqReview,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqMarkdownDocument } from "./AIReqMarkdownDocument.js";
import { AIReqAgentModelSummary } from "./AIReqAgentModelSummary.js";
import { AIReqProposalAlignment } from "./AIReqProposalAlignment.js";
import { AIReqProposalTaskActions } from "./AIReqProposalTaskActions.js";
import { proposalTaskStatus } from "./proposalTasks.js";

const detailsClass =
  "w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring";
const roleLabels = { business: "业务", development: "开发", testing: "测试" };
const reviewTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

function agentStatusLabel(agent: NonNullable<AIReqReview["agents"]>[number]) {
  if (agent.status === "completed") return agent.report.trim() ? "已完成" : "报告缺失";
  if (agent.status === "failed") return "评审失败";
  return agent.status === "running" ? "评审中" : "等待评审";
}

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

export function AIReqProposalReviewSnapshot({ review }: { review: AIReqReview }) {
  return (
    <details className="text-ui-sm text-foreground-subtle">
      <summary className={detailsClass}>查看评审详情</summary>
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
        {review.inputFiles?.map((file) => (
          <p key={file.path} className="break-all font-mono">
            {file.path}
          </p>
        ))}
      </div>
    </details>
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
  const canRetry = proposalReviewCanRetry(group, full);
  const [readReview, setReadReview] = useState<{ key: string; open: boolean }>();
  const reviewKey = `${review?.id}:${review?.snapshotDigest}`;
  const reportOpen = readReview?.key === reviewKey && readReview.open;
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
  const check = full ? group.solutionCheck : group.requirementsCheck;
  const agents = review?.agents ?? [];
  const reportAgent = agents.find((agent) => agent.id === (full ? "summary" : "a"));
  const completedIndependent = agents.filter(
    (agent) => agent.id !== "summary" && agent.status === "completed" && agent.report.trim(),
  ).length;
  const reportSource = review?.report.trim() ?? "";
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
  const openConversation = (agent: NonNullable<AIReqReview["agents"]>[number]) => (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`查看${agent.name}审查会话`}
      onClick={() =>
        ai.openProposalTask(full ? "solutionReviewDetail" : "requirementsReviewDetail", agent.id)
      }
    >
      查看会话 <ArrowRight className="size-4" aria-hidden="true" />
    </Button>
  );
  const nextActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => ai.openProposalTask(full ? "delivery" : "solution")}>
        {full ? "前往交付确认" : "进入方案设计"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" onClick={() => ai.openProposalTask("management")}>
        前往管理需求修改材料
      </Button>
    </div>
  );
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
        </header>
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
            {nextActions}
            {group.status === "requirements-pr" && (
              <p className="text-ui-sm text-foreground-subtle">
                当前材料已冻结；如需修改，请先关闭未合入的文档 PR。
              </p>
            )}
          </section>
        )}
        <AIReqProposalMaterialCheck check={check} />
        {!full && group.returnFeedback && !group.returnFeedback.resumedAt && (
          <section className="space-y-2" aria-label="当前退回意见">
            <p className="text-ui-sm font-medium">
              已退回业务补充 · 第 {group.returnFeedback.round} 轮
            </p>
            <p className="text-ui-sm text-foreground-subtle">
              {group.returnFeedback.employeeId} · {reviewTime(group.returnFeedback.returnedAt)}
              （北京时间）
            </p>
            <p className="whitespace-pre-wrap break-words text-ui-sm">
              {group.returnFeedback.reason}
            </p>
          </section>
        )}
        {check?.issues.length ? (
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
                  ? "当前材料通过校验后由系统自动评审，无需手动启动。"
                  : "先完善材料；校验通过后将自动评审。"}
              </p>
              {!check && (
                <Button
                  variant="outline"
                  onClick={() => ai.openProposalTask(full ? "solution" : "requirements")}
                >
                  {full ? "前往方案设计" : "前往需求澄清"}
                </Button>
              )}
            </div>
          )
        )}
        {current && review && (
          <>
            {full && (
              <section className="space-y-2" aria-label="独立审查">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-ui-base font-medium">三路独立审查</h2>
                  <p className="text-ui-sm text-foreground-subtle">
                    已完成 {completedIndependent} / 3
                  </p>
                </div>
                <ul className="divide-y divide-border/50">
                  {agents
                    .filter((agent) => agent.id !== "summary")
                    .map((agent) => (
                      <li
                        key={agent.id}
                        className="flex flex-wrap items-start justify-between gap-2 py-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="break-words font-medium">{agent.name}</p>
                          <p
                            className={`text-ui-sm ${agent.status === "failed" ? "text-destructive" : "text-foreground-subtle"}`}
                          >
                            {agentStatusLabel(agent)}
                          </p>
                          <AIReqAgentModelSummary binding={agent.session.modelConfig} />
                          {agent.status === "failed" && agent.report.trim() && (
                            <p className="break-words text-ui-sm text-destructive">
                              {agent.report}
                            </p>
                          )}
                        </div>
                        {openConversation(agent)}
                      </li>
                    ))}
                </ul>
              </section>
            )}
            <section
              className="min-w-0 overflow-hidden rounded-lg border border-border/60 bg-card/40"
              aria-label={reportLabel}
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-ui-base font-medium">{reportLabel}</h2>
                  <p className="text-ui-sm text-foreground-subtle">
                    {reportAgent?.name
                      ? `${reportAgent.name} · ${agentStatusLabel(reportAgent)} · `
                      : ""}
                    第 {review.round ?? 1} 轮 · {review.inputFiles?.length ?? 0} 份材料
                  </p>
                </div>
                {reportAgent && openConversation(reportAgent)}
              </header>
              <div className="min-w-0 space-y-3 px-4 py-3">
                <AIReqAgentModelSummary binding={reportAgent?.session.modelConfig} />
                {reportAgent?.status === "failed" && reportAgent.report.trim() && (
                  <p role="alert" className="break-words text-ui-sm text-destructive">
                    {reportAgent.report}
                  </p>
                )}
                {hasReport ? (
                  full || confirmation ? (
                    <AIReqMarkdownDocument headingLevelOffset={2}>
                      {reportBody}
                    </AIReqMarkdownDocument>
                  ) : (
                    <details
                      key={reviewKey}
                      open={reportOpen}
                      onToggle={(event) => {
                        if (event.target === event.currentTarget)
                          setReadReview({ key: reviewKey, open: event.currentTarget.open });
                      }}
                      className="space-y-3"
                    >
                      <summary className={`${detailsClass} text-ui-sm`}>
                        {reportOpen ? "收起评审报告" : "查看评审报告"}
                      </summary>
                      <AIReqMarkdownDocument headingLevelOffset={2}>
                        {reportBody}
                      </AIReqMarkdownDocument>
                    </details>
                  )
                ) : (
                  <p className="text-ui-sm text-foreground-subtle">
                    {canRetry
                      ? `${reportLabel}缺失或不可读取，重试后再确认。`
                      : `${reportLabel}尚未生成。`}
                  </p>
                )}
                <AIReqProposalReviewSnapshot review={review} />
              </div>
            </section>
            {Boolean(review.findings?.length) && (
              <section className="space-y-2" aria-label="评审意见">
                <h2 className="text-ui-base font-medium">主要意见</h2>
                <p className="text-ui-sm text-foreground-subtle">
                  是否采纳由确认人判断；意见不阻止确认。
                </p>
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
          </>
        )}
        {(!full || canRetry) && (
          <AIReqProposalTaskActions
            group={group}
            full={full}
            reviewed={Boolean(reportOpen)}
            focusFallback={heading}
          />
        )}
        {full && !fullConfirmed && <AIReqProposalAlignment group={group} />}
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
                {entry.agents?.map((agent) => (
                  <div key={agent.id} className="space-y-1">
                    <AIReqAgentModelSummary binding={agent.session.modelConfig} />
                    {full && agent.id !== "summary" && agent.report.trim() && (
                      <details className="space-y-2">
                        <summary className={detailsClass}>
                          {agent.name} · {agentStatusLabel(agent)}
                        </summary>
                        <AIReqMarkdownDocument headingLevelOffset={2}>
                          {agent.report}
                        </AIReqMarkdownDocument>
                      </details>
                    )}
                  </div>
                ))}
                {entry.report.trim() && (
                  <AIReqMarkdownDocument headingLevelOffset={2}>
                    {entry.report}
                  </AIReqMarkdownDocument>
                )}
                <AIReqProposalReviewSnapshot review={entry} />
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
