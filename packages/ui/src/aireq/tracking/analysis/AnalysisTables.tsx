import type { ReactNode } from "react";
import type {
  AIReqAnalysisSnapshot,
  AIReqAnalysisTask,
  AIReqAnalysisRunSummary,
} from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { Progress } from "@/components/ui/progress.js";
import {
  MarkdownTableBody,
  MarkdownTableCell,
  MarkdownTableHead,
  MarkdownTableHeader,
  MarkdownTableRow,
} from "@/components/ai-elements/markdown-table.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { BranchCopy } from "../BranchCopy.js";
import {
  cellClass,
  tableClass,
  RowLabel,
  Status,
  time,
  shortTime,
  duration,
  runLabels,
  taskLabels,
} from "./AnalysisPresentation.js";

export function AnalysisTaskTable({
  items,
  projects,
  onMessage,
  taskActions,
}: {
  items: AIReqAnalysisTask[];
  projects: AIReqAnalysisSnapshot["projects"];
  onMessage: (value: string) => void;
  taskActions: (task: AIReqAnalysisTask) => ReactNode;
}) {
  return (
    // 表格不限制高度：纵向随页面滚动，窄窗口只在这里横向滚动。
    <div className="min-w-0 overflow-x-auto">
      <table data-testid="analysis-task-table" className={`${tableClass} min-w-[864px]`}>
        <colgroup>
          <col />
          <col className="w-44" />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-40" />
          <col className="w-32" />
        </colgroup>
        <MarkdownTableHeader className="bg-background text-foreground-subtle">
          <MarkdownTableRow className="border-y border-border">
            {["SR / 项目 · IR", "开发分支", "进度", "状态", "下次 / 最近分析", "操作"].map(
              (title) => (
                <MarkdownTableHead
                  key={title}
                  className={`${cellClass} font-medium text-foreground-subtle`}
                >
                  {title}
                </MarkdownTableHead>
              ),
            )}
          </MarkdownTableRow>
        </MarkdownTableHeader>
        <MarkdownTableBody>
          {items.map((task) => (
            <MarkdownTableRow
              key={task.id}
              data-task-id={task.id}
              className="border-b border-border last:border-0 hover:bg-hover"
            >
              <MarkdownTableCell className={cellClass}>
                <RowLabel
                  title={task.srTitle}
                  subtitle={`${projects.find((project) => project.id === task.projectId)?.name ?? task.projectId} · ${task.irId} · ${task.srId}`}
                />
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <BranchCopy branch={task.branch} onMessage={onMessage} />
              </MarkdownTableCell>
              <MarkdownTableCell className={`${cellClass} whitespace-nowrap tabular-nums`}>
                <div className="flex min-w-16 items-center gap-2">
                  <Progress
                    value={task.percent}
                    aria-label={`${task.srTitle}进度`}
                    className="h-1 flex-1"
                    indicatorClassName={
                      task.percent >= 100 ? "bg-success" : "bg-progress-surface-foreground"
                    }
                  />
                  <span>{task.percent}%</span>
                </div>
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <ControlHintTooltip title={task.error ?? taskLabels[task.state]}>
                  <span
                    tabIndex={0}
                    className="inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
                  >
                    <Status value={task.state}>{taskLabels[task.state]}</Status>
                  </span>
                </ControlHintTooltip>
              </MarkdownTableCell>
              <MarkdownTableCell
                className={`${cellClass} whitespace-nowrap text-ui-sm tabular-nums`}
              >
                <p title={time(task.nextRunAt)}>
                  <span className="mr-2 text-foreground-subtle">下次</span>
                  {task.state === "completed" ? "已停止" : shortTime(task.nextRunAt)}
                </p>
                <p className="mt-0.5" title={time(task.lastRunAt)}>
                  <span className="mr-2 text-foreground-subtle">最近</span>
                  {shortTime(task.lastRunAt)}
                </p>
              </MarkdownTableCell>
              <MarkdownTableCell className={`${cellClass} text-right`}>
                {taskActions(task)}
              </MarkdownTableCell>
            </MarkdownTableRow>
          ))}
        </MarkdownTableBody>
      </table>
    </div>
  );
}

export function AnalysisHistoryTable({
  items,
  projects,
  onMessage,
  selectedRunId,
  openReport,
}: {
  items: AIReqAnalysisRunSummary[];
  projects: AIReqAnalysisSnapshot["projects"];
  onMessage: (value: string) => void;
  selectedRunId?: string;
  openReport: (id: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table data-testid="analysis-history-table" className={`${tableClass} min-w-[864px]`}>
        <colgroup>
          <col />
          <col className="w-44" />
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-24" />
        </colgroup>
        <MarkdownTableHeader className="bg-background text-foreground-subtle">
          <MarkdownTableRow className="border-y border-border">
            {["SR / 项目 · IR", "执行分支", "执行时间", "结果", "进度变化", "报告"].map((title) => (
              <MarkdownTableHead
                key={title}
                className={`${cellClass} font-medium text-foreground-subtle`}
              >
                {title}
              </MarkdownTableHead>
            ))}
          </MarkdownTableRow>
        </MarkdownTableHeader>
        <MarkdownTableBody>
          {items.map((run) => (
            <MarkdownTableRow
              key={run.id}
              data-run-id={run.id}
              className={`border-b border-border last:border-0 hover:bg-hover ${selectedRunId === run.id ? "bg-selected" : ""}`}
            >
              <MarkdownTableCell className={cellClass}>
                <RowLabel
                  title={run.srTitle}
                  subtitle={`${projects.find((project) => project.id === run.projectId)?.name ?? run.projectId} · ${run.irId} · ${run.srId}`}
                />
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <BranchCopy branch={run.branch} onMessage={onMessage} />
              </MarkdownTableCell>
              <MarkdownTableCell
                className={`${cellClass} tabular-nums`}
                title={time(run.startedAt)}
              >
                <p className="whitespace-nowrap">{shortTime(run.startedAt)}</p>
                <p className="text-ui-sm text-foreground-subtle">
                  {run.trigger === "schedule" ? "定时" : "手动"} · {duration(run)}
                </p>
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <Status value={run.status}>{runLabels[run.status]}</Status>
              </MarkdownTableCell>
              <MarkdownTableCell className={`${cellClass} whitespace-nowrap tabular-nums`}>
                {run.before}% → {run.after}%
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-haspopup="dialog"
                  aria-label={`查看 ${run.srId} ${time(run.startedAt)} 报告`}
                  onClick={(event) => openReport(run.id, event.currentTarget)}
                >
                  查看详情
                </Button>
              </MarkdownTableCell>
            </MarkdownTableRow>
          ))}
        </MarkdownTableBody>
      </table>
    </div>
  );
}
