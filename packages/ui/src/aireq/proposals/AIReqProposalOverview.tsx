import { useLayoutEffect, useRef } from "react";
import { ArrowRight, FileText, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  proposalProgressIndex,
  proposalState,
  proposalStateLabel,
  PROPOSAL_STATE_OPTIONS,
  proposalAlignmentCurrent,
  requirementsReviewCurrent,
  type AIReqRequirementGroup,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { AIReqProposalReviewSnapshot } from "./AIReqProposalReviewPage.js";
import {
  proposalNextTask,
  proposalTaskGuidance,
  proposalTaskStatus,
  proposalTaskTitles,
  type ProposalTask,
} from "./proposalTasks.js";

const stages: ProposalTask[] = [
  "requirements",
  "requirementsReview",
  "solution",
  "solutionReview",
  "delivery",
];

const confirmRoles = [
  ["business", "业务"],
  ["development", "开发"],
  ["testing", "测试"],
] as const;
/** 需求入口只消费实时业务投影，任务导航归 Context，阅读时不运行 Agent。 */
export function AIReqProposalOverview({ group }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const next = proposalNextTask(group);
  const state = proposalState(group);
  const guidance = proposalTaskGuidance(group);
  const stateLabel = proposalStateLabel(group);
  const phase = proposalProgressIndex(group, {});
  const track = useRef<HTMLDivElement>(null);
  const currentStep = useRef<HTMLSpanElement>(null);
  const alignment =
    group.alignment?.filter((entry) => proposalAlignmentCurrent(group, entry)) ?? [];
  const contactLabel = ([role, label]: (typeof confirmRoles)[number]) =>
    `${label} ${group.contacts?.[role] ?? "未分配"}`;
  const roleLabel =
    state === "solution-confirmation-pending"
      ? confirmRoles
          .filter(([role]) => !alignment.some((entry) => entry.perspective === role))
          .map(contactLabel)
          .join("、")
      : state === "not-started" ||
          state === "ir-review-pending" ||
          state === "ir-confirmation-pending"
        ? contactLabel(confirmRoles[0])
        : state === "solution-review-pending" ||
            state === "solution-incomplete" ||
            state === "submission-pending"
          ? contactLabel(confirmRoles[1])
          : guidance.role;
  useLayoutEffect(() => {
    const container = track.current;
    if (!container) return;
    // 仅移动轨迹横向视口；scrollIntoView 会连带滚动主区，破坏标题基线。
    const revealCurrent = () => {
      const button = currentStep.current;
      if (!button) return;
      const viewport = container.getBoundingClientRect();
      const item = button.getBoundingClientRect();
      if (item.left < viewport.left + 4) container.scrollLeft += item.left - viewport.left - 4;
      else if (item.right > viewport.right - 4)
        container.scrollLeft += item.right - viewport.right + 4;
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(container);
    return () => observer.disconnect();
  }, [state, group.projectId, group.id]);
  const notes: Partial<Record<ProposalTask, string>> = {
    requirements: "明确目标、范围与验收标准",
    requirementsReview: "查看评审意见并确认业务需求",
    solution: "完善技术方案、开发任务与测试材料",
    solutionReview: "查看审查报告，由业务、开发和测试分别确认",
    delivery: "核对完整文件并提交文档 PR，查看合入核验",
  };
  const currentDecision = group.originalReview?.humanDecision;
  const originalDecision =
    currentDecision ??
    group.originalReviewHistory?.findLast((entry) => entry.humanDecision)?.humanDecision;
  const currentOriginal =
    originalDecision?.reviewId === group.originalReview?.id &&
    originalDecision?.snapshotDigest === group.originalReview?.snapshotDigest &&
    requirementsReviewCurrent(group);
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto bg-background [scrollbar-gutter:stable_both-edges]"
      data-testid="proposal-workbench"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-8`}>
        <header>
          <h1
            className={`${AIREQ_PAGE_TITLE_CLASSNAME} line-clamp-2 break-words`}
            title={group.title}
          >
            {group.title || "需求工作台"}
          </h1>
        </header>
        <section className="space-y-4 border-b border-border/50 pb-5" aria-label="当前待处理事项">
          <div
            className="rounded-lg border border-border/60 bg-card/40 p-4"
            data-testid="proposal-next-step"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-ui-sm text-foreground-subtle">下一步 · {stateLabel}</p>
                <p className="text-ui-base font-medium">{guidance.action}</p>
                <p className="max-w-prose text-ui-sm leading-relaxed text-foreground-subtle">
                  {guidance.description}
                </p>
                <p className="text-ui-sm text-foreground-subtle">处理方：{roleLabel}</p>
              </div>
              <Button onClick={() => ai.openProposalTask(next)}>
                {guidance.action}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div
            ref={track}
            className="overflow-x-auto overscroll-x-contain py-1"
            data-testid="proposal-state-track"
          >
            <ol
              className="flex w-max min-w-full items-center justify-between gap-1 whitespace-nowrap pr-1"
              aria-label="提案八态"
            >
              {PROPOSAL_STATE_OPTIONS.map((option) => (
                <li key={option.id} className="shrink-0">
                  <span
                    ref={state === option.id ? currentStep : undefined}
                    aria-current={state === option.id ? "step" : undefined}
                    className={
                      state === option.id
                        ? "inline-flex items-center gap-1 rounded-sm bg-selected px-2 py-1 text-ui-base font-semibold text-foreground"
                        : "inline-block px-2 py-1 text-ui-base text-foreground-subtle"
                    }
                  >
                    {option.title}
                    {state === option.id && (
                      <span className="rounded-sm bg-surface px-1 text-ui-xs font-normal text-foreground-subtle">
                        当前
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section aria-label="需求任务" className="space-y-2">
          <h2 className="text-ui-base font-medium">任务</h2>
          <ol className="divide-y divide-border/50">
            {stages.map((task) => (
              <li key={task}>
                <button
                  type="button"
                  onClick={() => ai.openProposalTask(task)}
                  aria-current={task === next ? "step" : undefined}
                  className={`group flex w-full items-center gap-4 rounded-md px-2 py-4 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring ${task === next ? "bg-surface" : ""}`}
                  data-testid={`proposal-task-${task}`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="block text-ui-base font-medium">
                      {proposalTaskTitles[task]}
                    </span>
                    <span className="block text-ui-sm text-foreground-subtle">{notes[task]}</span>
                  </div>
                  <span className="shrink-0 text-ui-sm text-foreground-subtle">
                    {proposalTaskStatus(group, task)}
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-foreground-subtle"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ol>
        </section>
        {/* 原文长度不可决定主要操作的位置；折叠阅读区保留完整文本与键盘滚动。 */}
        <details
          key={`${group.projectId}:${group.id}`}
          className="text-ui-sm text-foreground-subtle"
        >
          <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
            查看原始需求
          </summary>
          <div
            tabIndex={0}
            role="region"
            aria-label="原始需求正文"
            className="mt-3 max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-sm pr-3 leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"
          >
            {group.originalText || "尚未记录原始需求。"}
          </div>
        </details>
        {(originalDecision || alignment.length > 0) && (
          <section className="space-y-3" aria-label="确认记录">
            <h2 className="text-ui-base font-medium">确认记录</h2>
            {originalDecision && (
              <p className="break-words text-ui-sm text-foreground-subtle">
                {originalDecision.employeeId} ·{" "}
                {new Date(originalDecision.decidedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
                （北京时间） · 确认了业务需求
                {!currentOriginal && "（旧记录，已失效）"}
              </p>
            )}
            {confirmRoles.map(([role, label]) => {
              const entry = alignment.find((item) => item.perspective === role);
              return (
                entry && (
                  <p key={role} className="break-words text-ui-sm text-foreground-subtle">
                    {entry.employeeId} ·{" "}
                    {new Date(entry.confirmedAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                    （北京时间） · 确认了{label}角色
                  </p>
                )
              );
            })}
          </section>
        )}
        {group.originalReview && (
          <AIReqProposalReviewSnapshot
            key={group.originalReview.id}
            review={group.originalReview}
          />
        )}
        <div className="flex flex-wrap gap-3 border-t border-border/50 pt-4">
          <Button
            variant="ghost"
            onClick={() => ai.openProposalTask(phase >= 2 ? "solution" : "requirements")}
          >
            <FileText className="size-4" aria-hidden="true" />
            查看需求与方案材料
          </Button>
          <Button variant="ghost" onClick={() => ai.openProposalTask("management")}>
            <Settings2 className="size-4" aria-hidden="true" />
            管理需求（联系人与材料）
          </Button>
        </div>
      </div>
    </main>
  );
}
