import type { ReactNode } from "react";
import type { AIReqAnalysisRun } from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.js";
import { RunModelFacts } from "../RunModelFacts.js";
import { BranchCopy } from "../BranchCopy.js";
import { duration, runLabels, Status, time } from "./AnalysisPresentation.js";

export function ReportPane({
  run,
  onRetry,
  retryDisabledReason,
  onRestoreFocus,
  feedback,
  onMessage,
}: {
  run: AIReqAnalysisRun;
  onRetry: () => void;
  retryDisabledReason?: string;
  onRestoreFocus: () => void;
  feedback: ReactNode;
  onMessage: (value: string) => void;
}) {
  const report = run.report;
  return (
    <DialogContent
      data-testid="analysis-report-dialog"
      className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onRestoreFocus();
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 pr-6">
        <div className="min-w-0">
          <DialogTitle>分析执行详情</DialogTitle>
          <DialogDescription className="mt-1 break-all">{run.srId}</DialogDescription>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-ui-base text-foreground">
        <div className="flex items-center gap-3">
          <h3 className="min-w-0 flex-1 break-words font-medium">{run.srTitle}</h3>
          <Status value={run.status}>{runLabels[run.status]}</Status>
        </div>
        <p className="break-words text-ui-sm text-foreground-subtle">
          项目：{run.projectId} · {run.irId} · {run.srId}
        </p>
        <section aria-label="开发分支" className="space-y-1">
          <h4 className="font-medium">开发分支</h4>
          {run.branch?.trim() && <p className="break-all font-mono text-ui-sm">{run.branch}</p>}
          <BranchCopy branch={run.branch} onMessage={onMessage} />
        </section>
        {run.status !== "failed" && <p className="break-words leading-relaxed">{run.message}</p>}
        {run.status === "failed" && (
          <section
            aria-label="失败处理建议"
            className="space-y-3 rounded-lg border border-destructive p-3 text-ui-sm"
          >
            <h5 className="font-medium">分析失败 · {run.failure?.stage ?? "分析阶段未记录"}</h5>
            <dl className="space-y-2">
              <div>
                <dt className="font-medium">原因</dt>
                <dd>{run.failure?.reason ?? run.message}</dd>
              </div>
              <div>
                <dt className="font-medium">下一步</dt>
                <dd>
                  {run.failure?.nextStep ??
                    "由启动者核对当前 SR 的需求与项目配置；请按报告中的诊断信息处理。"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">是否可重试</dt>
                <dd>
                  {run.failure?.retryable === false
                    ? "不可直接重试，需先处理上述问题。"
                    : "可重试；仅派发当前 SR，不影响其他任务。"}
                </dd>
              </div>
            </dl>
            <Button size="sm" disabled={Boolean(retryDisabledReason)} onClick={onRetry}>
              重试此 SR
            </Button>
            <p role="status" className="text-foreground-subtle">
              {retryDisabledReason ?? "任一合法工号可代办；项目需开启，当前 SR 未完成且未运行。"}
            </p>
          </section>
        )}
        <details open className="border-t border-border pt-3 text-ui-sm">
          <summary className="cursor-pointer text-foreground-subtle">
            执行信息 · {duration(run)} · {run.before}% → {run.after}%
          </summary>
          <div className="pt-3">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-ui-sm">
              <dt className="text-foreground-subtle">触发方式</dt>
              <dd>{run.trigger === "schedule" ? "定时" : "手动"}</dd>
              <dt className="text-foreground-subtle">开始</dt>
              <dd>{time(run.startedAt)}</dd>
              <dt className="text-foreground-subtle">结束</dt>
              <dd>{time(run.endedAt)}</dd>
              <dt className="text-foreground-subtle">耗时</dt>
              <dd>{duration(run)}</dd>
              <dt className="text-foreground-subtle">进度</dt>
              <dd>
                {run.before}% → {run.after}%
              </dd>
            </dl>
            {/* 执行时绑定属于历史执行信息，不在原版报告正文前额外插入配置卡。 */}
            <RunModelFacts binding={run.modelConfig} />
          </div>
        </details>
        {report ? (
          <>
            <div className="space-y-2 border-t border-border pt-3 text-ui-sm">
              <h5 className="font-medium">代码依据</h5>
              <p>模拟 AI 原始评分：{report.aiPercent ?? Math.min(99, report.percent)}% · 本次运行时有效进度：{report.percent}%</p>
              {report.stale && <p className="text-warning">报告已过期；业务有效进度仍以合入及人工测试事实为准。</p>}
              <p className="break-all">分支：{report.branch}</p>
              <p>
                合入：{report.merged ? "已合入" : "未合入"} ·{" "}
                {report.certain ? "判断确定" : "仍有不确定项"}
              </p>
              <p className="break-all">
                代码版本：{report.codeVersion}
                <br />
                默认分支：{report.defaultVersion}
              </p>
            </div>
            <ReportList title="已实现" items={report.implemented} />
            <ReportList title="待完成" items={report.remaining} />
            <ReportList
              title="问题与风险"
              items={report.issues.map((issue) => `${issue.title}：${issue.detail}`)}
            />
            <ReportList
              title="代码活动"
              items={report.activity.map(
                (item) => `${item.commit} · ${item.message} · ${time(item.at)}`,
              )}
            />
          </>
        ) : (
          <p className="text-foreground-subtle">本次执行未生成分析报告，执行信息仍可查阅。</p>
        )}
      </div>
      {feedback}
    </DialogContent>
  );
}
function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    // 报告结论属于正文，不沿用执行元数据的辅助字号和弱化颜色。
    <div className="space-y-2 text-ui-base leading-6 text-foreground">
      <h5 className="font-medium">{title}</h5>
      {items.length ? (
        <ul className="list-disc space-y-1 break-words pl-4">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-foreground-subtle">无</p>
      )}
    </div>
  );
}
