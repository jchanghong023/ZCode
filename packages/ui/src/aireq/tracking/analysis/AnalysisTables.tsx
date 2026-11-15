import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type {
  AIReqAnalysisSnapshot,
  AIReqAnalysisTask,
  AIReqAnalysisRunSummary,
} from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
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
  tableClass,
  RowLabel,
  Status,
  time,
  shortTime,
  runLabels,
  taskLabels,
} from "./AnalysisPresentation.js";

const cellClass = "px-4 py-3 text-left align-middle";
const headerClass = "h-10 px-4 text-left text-ui-sm font-normal text-foreground-subtle";

export function AnalysisTaskTable({
  items,
  projects,
  onMessage,
  taskActions,
  openReport,
}: {
  items: AIReqAnalysisTask[];
  projects: AIReqAnalysisSnapshot["projects"];
  onMessage: (value: string) => void;
  taskActions: (task: AIReqAnalysisTask, onOpenReport: () => void) => ReactNode;
  openReport: (id: string, trigger: HTMLButtonElement) => void;
}) {
  const [detailTaskId, setDetailTaskId] = useState<string>();
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const reportAfterClose = useRef<(() => void) | undefined>(undefined);
  return (
    // 合并固定多列，避免正文宽度足够时仍横滚；仅窄面板横滚，纵向随页面滚动。
    <TrackingTableScroll label="SR 任务表格">
      <table data-testid="analysis-task-table" className={`${tableClass} min-w-[640px]`}>
        <colgroup>
          <col className="w-[44%]" />
          <col />
          <col className="w-36" />
          <col className="w-14" />
        </colgroup>
        <MarkdownTableHeader className="bg-surface text-foreground-subtle">
          <MarkdownTableRow className="border-b border-border hover:bg-transparent">
            {["需求与项目", "状态与进度", "下次分析", "操作"].map((title) => (
              <MarkdownTableHead
                key={title}
                className={headerClass}
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
              className="group/row border-b border-border last:border-0 hover:bg-hover"
            >
              <MarkdownTableCell className={cellClass}>
                <RowLabel
                  title={task.srTitle}
                  subtitle={`${projects.find((project) => project.id === task.projectId)?.name ?? task.projectId} · ${task.irId} · ${task.srId}`}
                />
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <Status value={task.state}>{taskLabels[task.state]}</Status>
                {task.error && (
                  <p className="mt-1 break-words text-ui-sm text-destructive">{task.error}</p>
                )}
                {!task.branch?.trim() && (
                  <p className="mt-1 text-ui-sm text-destructive">开发分支缺失</p>
                )}
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
                <ControlHintTooltip title={time(task.nextRunAt)}>
                  <span
                    tabIndex={0}
                    className="rounded-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
                  >
                    {task.state === "completed" ? "已停止" : shortTime(task.nextRunAt)}
                  </span>
                </ControlHintTooltip>
              </MarkdownTableCell>
              <MarkdownTableCell className="px-2 py-3 text-right align-middle">
                <Dialog
                  open={detailTaskId === task.id}
                  onOpenChange={(open) => setDetailTaskId(open ? task.id : undefined)}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="pointer-events-none size-8 rounded-lg opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                      aria-haspopup="dialog"
                      aria-label={`查看 ${task.srId} 任务详情`}
                      onClick={(event) => {
                        detailTrigger.current = event.currentTarget;
                      }}
                    >
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl"
                    onCloseAutoFocus={(event) => {
                      const openNextReport = reportAfterClose.current;
                      if (!openNextReport) return;
                      event.preventDefault();
                      reportAfterClose.current = undefined;
                      openNextReport();
                    }}
                  >
                    <DialogTitle>SR 任务详情</DialogTitle>
                    <DialogDescription>
                      {task.irId} · {task.srId}
                    </DialogDescription>
                    <div className="min-h-0 space-y-4 overflow-y-auto text-ui-base">
                      <h3 className="break-words font-medium">{task.srTitle}</h3>
                      <p className="break-words">
                        项目：
                        {projects.find((project) => project.id === task.projectId)?.name ??
                          task.projectId}
                      </p>
                      <div className="flex items-center gap-2">
                        <Status value={task.state}>{taskLabels[task.state]}</Status>
                        <span className="tabular-nums">{task.percent}%</span>
                      </div>
                      {task.error && (
                        <p className="break-words text-destructive">原因：{task.error}</p>
                      )}
                      <section aria-label="开发分支" className="space-y-1">
                        <h4 className="font-medium">开发分支</h4>
                        {task.branch?.trim() && (
                          <p className="break-all font-mono text-ui-sm">{task.branch}</p>
                        )}
                        <BranchCopy branch={task.branch} onMessage={onMessage} />
                      </section>
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
                        <dt className="text-foreground-subtle">下次分析</dt>
                        <dd>{task.state === "completed" ? "已停止" : time(task.nextRunAt)}</dd>
                        <dt className="text-foreground-subtle">最近分析</dt>
                        <dd>{time(task.lastRunAt)}</dd>
                      </dl>
                      <div className="border-t border-border pt-3">
                        {task.lastRunId ? (
                          taskActions(task, () => {
                            const trigger = detailTrigger.current;
                            if (!trigger || !task.lastRunId) return;
                            // 先卸载任务弹窗，再打开报告；回焦目标始终是表格入口。
                            reportAfterClose.current = () => openReport(task.lastRunId!, trigger);
                            setDetailTaskId(undefined);
                          })
                        ) : (
                          <p className="text-foreground-subtle">尚无分析报告。</p>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
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
  selectedRunId,
  openReport,
}: {
  items: AIReqAnalysisRunSummary[];
  projects: AIReqAnalysisSnapshot["projects"];
  selectedRunId?: string;
  openReport: (id: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <TrackingTableScroll label="执行历史表格">
      <table data-testid="analysis-history-table" className={`${tableClass} min-w-[640px]`}>
        <colgroup>
          <col className="w-[44%]" />
          <col className="w-36" />
          <col />
          <col className="w-14" />
        </colgroup>
        <MarkdownTableHeader className="bg-surface text-foreground-subtle">
          <MarkdownTableRow className="border-b border-border hover:bg-transparent">
            {["需求与项目", "开始时间", "结果与进度", "操作"].map((title) => (
              <MarkdownTableHead
                key={title}
                className={headerClass}
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
              className={`group/row border-b border-border last:border-0 hover:bg-hover ${selectedRunId === run.id ? "bg-selected" : ""}`}
            >
              <MarkdownTableCell className={cellClass}>
                <RowLabel
                  title={run.srTitle}
                  subtitle={`${projects.find((project) => project.id === run.projectId)?.name ?? run.projectId} · ${run.irId} · ${run.srId}`}
                />
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <ControlHintTooltip title={time(run.startedAt)}>
                  <span
                    tabIndex={0}
                    className="rounded-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
                  >
                    {shortTime(run.startedAt)}
                  </span>
                </ControlHintTooltip>
              </MarkdownTableCell>
              <MarkdownTableCell className={cellClass}>
                <Status value={run.status}>{runLabels[run.status]}</Status>
                {!run.branch?.trim() && (
                  <p className="mt-1 text-ui-sm text-destructive">开发分支缺失</p>
                )}
                <p className="mt-2 text-ui-sm text-foreground-subtle">进度（执行前 → 后）</p>
                <p className="tabular-nums">
                  {run.before}% → {run.after}%
                </p>
              </MarkdownTableCell>
              <MarkdownTableCell className="px-2 py-3 text-right align-middle">
                <Button
                  variant="ghost"
                  size="icon"
                  className="pointer-events-none size-8 rounded-lg opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                  aria-haspopup="dialog"
                  aria-label={`查看 ${run.srId} ${time(run.startedAt)} 执行详情`}
                  onClick={(event) => openReport(run.id, event.currentTarget)}
                >
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </Button>
              </MarkdownTableCell>
            </MarkdownTableRow>
          ))}
        </MarkdownTableBody>
      </table>
    </TrackingTableScroll>
  );
}
