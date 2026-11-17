import { ArrowRight, FileText, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  proposalProgressIndex,
  proposalState,
  proposalStateLabel,
  PROPOSAL_STATE_OPTIONS,
  fullReviewCurrent,
  requirementsReviewCurrent,
  type AIReqRequirementGroup,
} from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
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
/** 需求入口只消费实时业务投影，任务导航归 Context，阅读时不运行 Agent。 */
export function AIReqProposalOverview({ group }: { group: AIReqRequirementGroup }) {
  const ai = useAIReq()!;
  const next = proposalNextTask(group);
  const state = proposalState(group);
  const guidance = proposalTaskGuidance(group);
  const phase = proposalProgressIndex(group, {});
  const notes: Partial<Record<ProposalTask, string>> = {
    requirements: "明确目标、范围与验收标准",
    requirementsReview: "查看评审意见并确认业务需求",
    solution: "完善技术方案、开发任务与测试材料",
    solutionReview: "处理独立审查意见并确认完整方案",
    delivery: "完成三方确认，核对文件并提交文档 MR",
  };
  const decisions = [
    { key: "requirements", label: "确认了业务需求", review: group.originalReview },
    { key: "solution", label: "确认了完整方案", review: group.review },
  ].filter((item) => item.review?.passed && item.review.humanDecision?.reviewId === item.review.id);
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto bg-background [scrollbar-gutter:stable_both-edges]"
      data-testid="proposal-workbench"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-8`}>
        <header className="space-y-3">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>需求工作台</h1>

          <p className="max-w-prose whitespace-pre-wrap break-words text-ui-sm leading-relaxed text-foreground-subtle">
            {group.originalText || "尚未记录原始需求。"}
          </p>
        </header>
        <section className="space-y-3 border-y border-border/50 py-5" aria-label="当前待处理事项">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-ui-lg font-semibold" aria-live="polite">
                {proposalStateLabel(group, "zh-CN")}
              </h2>
              <p className="max-w-prose text-ui-sm leading-relaxed text-foreground-subtle">
                {guidance.description}
              </p>
              <p className="text-ui-sm text-foreground-subtle">处理方：{guidance.role}</p>
            </div>
            <Button onClick={() => ai.openProposalTask(next)}>
              {guidance.action}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <details className="pt-2 text-ui-sm text-foreground-subtle">
            <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              查看完整流程
            </summary>
            <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="提案八态">
              {PROPOSAL_STATE_OPTIONS.map((option) => (
                <li
                  key={option.id}
                  aria-current={state === option.id ? "step" : undefined}
                  className={state === option.id ? "font-medium text-foreground" : undefined}
                >
                  {option.title}
                </li>
              ))}
            </ol>
            <p className="mt-3">材料变化或退回时，状态会回退；合入核验通过后转为正式需求。</p>
          </details>
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
        {decisions.length > 0 && (
          <section className="space-y-3" aria-label="确认记录">
            <h2 className="text-ui-base font-medium">确认记录</h2>
            {decisions.map(({ key, label, review }) => (
              <p key={key} className="break-words text-ui-sm text-foreground-subtle">
                {review!.humanDecision!.employeeId} ·{" "}
                {new Date(review!.humanDecision!.decidedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}{" "}
                · {label}
                {!(key === "requirements"
                  ? requirementsReviewCurrent(group)
                  : fullReviewCurrent(group)) && "（材料已更新，原确认已失效）"}
              </p>
            ))}
          </section>
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
            联系人与材料管理
          </Button>
        </div>
      </div>
    </main>
  );
}
