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
import { TrackingTableScroll } from "../TrackingTableScroll.js";
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
    // 合并固定多列，避免正文宽度足够时仍横滚；仅窄面板横滚，纵向随页面滚动。
    <TrackingTableScroll label="SR 任务表格">
      <table data-testid="analysis-task-table" className={`${tableClass} min-w-[640px]`}>
        <colgroup>
          <col />
          <col />
          <col />
          <col className="w-32" />
        </colgroup>
        <MarkdownTableHeader className="bg-surface text-foreground-subtle">
          <MarkdownTableRow className="border-y border-border hover:bg-transparent">
            {["需求与项目", "状态与进度", "分支与分析时间", "操作"].map((title) => (
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
                <ControlHintTooltip title={task.error ?? taskLabels[task.state]}>
                  <span
                    tabIndex={0}
                    className="inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
                  >
                    <Status value={task.state}>{taskLabels[task.state]}</Status>
                  </span>
                </ControlHintTooltip>
                <div className="mt-2 flex min-w-0 items-center gap-2 tabular-nums">
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
                <BranchCopy branch={task.branch} onMessage={onMessage} />
                <p className="mt-1 text-ui-sm tabular-nums" title={time(task.nextRunAt)}>
                  <span className="mr-2 text-foreground-subtle">下次</span>
                  {task.state === "completed" ? "已停止" : shortTime(task.nextRunAt)}
                </p>
                <p className="mt-0.5 text-ui-sm tabular-nums" title={time(task.lastRunAt)}>
                  <span className="mr-2 text-foreground-subtle">最近</span>
                  {shortTime(task.lastRunAt)}
                </p>
              </MarkdownTableCell>
              <MarkdownTableCell className="px-2 py-2.5 text-right align-middle">
                {taskActions(task)}
              </MarkdownTableCell>
            </MarkdownTableRow>
          ))}
        </MarkdownTableBody>
      </table>
    </TrackingTableScroll>
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
    <TrackingTableScroll label="执行历史表格">
      <table data-testid="analysis-history-table" className={`${tableClass} min-w-[640px]`}>
        <colgroup>
          <col />
          <col />
          <col />
          <col className="w-32" />
        </colgroup>
        <MarkdownTableHeader className="bg-surface text-foreground-subtle">
          <MarkdownTableRow className="border-y border-border hover:bg-transparent">
            {["需求与项目", "执行信息", "结果与进度", "操作"].map((title) => (
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
                <p className="mt-1 tabular-nums" title={time(run.startedAt)}>
                  <span className="mr-2 text-foreground-subtle">开始</span>
                  {shortTime(run.startedAt)}
                </p>
                <p className="text-ui-sm text-foreground-subtle">
                  {run.trigger === "schedule" ? "定时" : "手动"} · {duration(run)}
                </p>
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <Status value={run.status}>{runLabels[run.status]}</Status>
                <p className="mt-2 text-ui-sm text-foreground-subtle">进度（执行前 → 后）</p>
                <p className="tabular-nums">
                  {run.before}% → {run.after}%
                </p>
              </MarkdownTableCell>
              <MarkdownTableCell className="px-2 py-2.5 text-right align-middle">
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
    </TrackingTableScroll>
  );
}
