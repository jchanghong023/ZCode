import { AnalysisRunConfirmation } from "./AnalysisRunConfirmation.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Switch } from "@/components/ui/switch.js";
import { SelectItem } from "@/components/ui/select.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.js";
import { AutomationsMainBreadcrumbFrame } from "@/settings/AutomationsMainBreadcrumbFrame.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useOptionalAIReqDataSource } from "../data-source.js";
import { useAIReq } from "../AIReqContext.js";
import type {
  AIReqAnalysisFilter,
  AIReqAnalysisRunSummary,
  AIReqAnalysisTask,
  AIReqProgressScheduler,
} from "../contract.js";
import {
  FilterSelect,
  Pagination,
  QueryFeedback,
  UpdateFeedback,
  runLabels,
  time,
  shortTime,
} from "./analysis/AnalysisPresentation.js";
import { useSchedulerQuery } from "./analysis/useSchedulerQuery.js";
import { AnalysisSettings } from "./analysis/AnalysisSettings.js";
import { AnalysisTaskTable, AnalysisHistoryTable } from "./analysis/AnalysisTables.js";
import { ReportPane } from "./analysis/ReportPane.js";

export function AIReqRequirementAnalysisPage({
  onOpenModelSettings,
}: {
  onOpenModelSettings(): void;
}) {
  const source = useOptionalAIReqDataSource();
  const aireq = useAIReq()!;
  return (
    <main
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background"
      aria-label="进度分析"
    >
      <AutomationsMainBreadcrumbFrame
        isDesktop={false}
        ariaLabel="进度分析导航"
        sectionLabel="进度分析"
      >
        {/* 滚动条属于全宽页面，限宽内容列不再承担纵向滚动。 */}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
          <div className={cn(AIREQ_PAGE_CONTENT_CLASSNAME, "min-w-0")}>
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>进度分析</h1>
                <p className="mt-2 text-ui-base text-foreground-subtle">
                  跟踪正式需求的开发进度，查看代码依据与待处理问题。
                </p>
              </div>
            </header>
            {source?.progressScheduler ? (
              <ConnectedProgressAnalysis
                key={`${aireq.selection.projectId ?? ""}:${aireq.releaseId}`}
                scheduler={source.progressScheduler}
                onOpenModelSettings={onOpenModelSettings}
              />
            ) : (
              <p role="status" className="text-ui-base text-foreground-subtle">
                进度分析暂不可用，请稍后重试。
              </p>
            )}
          </div>
        </div>
      </AutomationsMainBreadcrumbFrame>
    </main>
  );
}
function ConnectedProgressAnalysis({
  scheduler,
  onOpenModelSettings,
}: {
  scheduler: AIReqProgressScheduler;
  onOpenModelSettings(): void;
}) {
  const [revision, setRevision] = useState(0);
  const aireq = useAIReq()!;
  const projectId = aireq.selection.projectId ?? "";
  const releaseId = aireq.releaseId;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const loadSnapshot = useCallback(() => scheduler.read(), [scheduler]);
  const snapshotQuery = useSchedulerQuery(loadSnapshot, revision);
  const snapshot = snapshotQuery.value;
  const [interval, setInterval] = useState("");
  const [irId, setIrId] = useState("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [srSearch, setSrSearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [tab, setTab] = useState("tasks");
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(25);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const reportTrigger = useRef<HTMLButtonElement | null>(null);
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisRequest, setAnalysisRequest] = useState<{
    filter: AIReqAnalysisFilter;
    count: number;
    scope: string;
  }>();
  const [pending, setPending] = useState(false);
  const mutation = useRef(false);
  const lifecycle = useRef<object | undefined>(undefined);
  useEffect(() => {
    const scope = {};
    lifecycle.current = scope;
    mutation.current = false;
    setPending(false);
    const unsubscribe = scheduler.subscribe(refresh);
    refresh();
    return () => {
      lifecycle.current = undefined;
      unsubscribe();
    };
  }, [scheduler, refresh]);
  const intervalMinutes = snapshot?.intervalMinutes;
  useEffect(() => {
    if (intervalMinutes !== undefined) setInterval(String(intervalMinutes));
  }, [intervalMinutes]);
  const mutate = async (action: () => void | Promise<void>, success: string) => {
    if (mutation.current) return;
    const scope = lifecycle.current;
    mutation.current = true;
    setPending(true);
    setMessage("");
    try {
      await action();
      if (lifecycle.current === scope) {
        setMessage(success);
        refresh();
      }
    } catch (cause) {
      if (lifecycle.current === scope)
        setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (lifecycle.current === scope) {
        mutation.current = false;
        setPending(false);
      }
    }
  };
  const irs = snapshot?.irs.filter((ir) => ir.projectId === projectId && (!releaseId || ir.releaseId === releaseId)) ?? [];
  const dateError = Boolean(since && until && since > until);
  const filter: AIReqAnalysisFilter = useMemo(
    () => ({
      projectId: projectId || "__no_project__",
      releaseId: releaseId || undefined,
      irId: irId === "all" ? undefined : irId,
      srSearch,
    }),
    [projectId, releaseId, irId, srSearch],
  );
  const loadTasks = useCallback(
    () => scheduler.queryTasks(filter, taskPage, taskPageSize),
    [scheduler, filter, taskPage, taskPageSize],
  );
  const taskQuery = useSchedulerQuery(loadTasks, revision);
  const taskResult = taskQuery.value;
  const loadHistory = useCallback(
    () =>
      scheduler.queryRuns(
        {
          ...filter,
          status:
            historyStatus === "all"
              ? undefined
              : (historyStatus as AIReqAnalysisRunSummary["status"]),
          since: since ? new Date(since).toISOString() : undefined,
          until: until ? new Date(until).toISOString() : undefined,
        },
        historyPage,
        historyPageSize,
      ),
    [scheduler, filter, historyStatus, since, until, historyPage, historyPageSize],
  );
  const historyQuery = useSchedulerQuery(loadHistory, revision, tab === "history" && !dateError);
  const historyResult = historyQuery.value;
  const loadReport = useCallback(async () => {
    const run = selectedRunId ? await scheduler.readRun(selectedRunId) : undefined;
    if (!run) throw new Error("未找到此执行报告。");
    const tasks = await scheduler.queryTasks(
      { projectId: run.projectId, irId: run.irId, srId: run.srId },
      1,
      25,
    );
    return { run, task: tasks.items[0] };
  }, [scheduler, selectedRunId]);
  const reportQuery = useSchedulerQuery(loadReport, revision, Boolean(selectedRunId));
  const selectedRun = reportQuery.value?.run;
  const selectedTask = reportQuery.value?.task;
  const retryBlocker = (task?: AIReqAnalysisTask) =>
    !task
      ? "此 SR 已不在当前任务范围，无法重试。"
      : !snapshot?.projects.find((project) => project.id === task.projectId)?.enabled
        ? "项目分析已关闭，请先开启项目分析。"
        : task.state === "running"
          ? "此 SR 正在分析，不会重复接纳；完成后再查看结果。"
          : task.state === "completed" || task.percent >= 100
            ? "此 SR 已完成，分析已停止。"
            : undefined;
  const retry = (task: AIReqAnalysisTask) => {
    const exact = { projectId: task.projectId, irId: task.irId, srId: task.srId };
    void mutate(async () => {
      const current = (await scheduler.queryTasks(exact, 1, 25)).items[0];
      const blocker = retryBlocker(current);
      if (blocker) throw new Error(blocker);
      await scheduler.runNow(exact);
    }, `仅已请求 ${task.srId} 的单 SR 重试；未派发其他 SR，运行中不会重复接纳。`);
  };
  const openReport = (id: string, trigger: HTMLButtonElement) => {
    reportTrigger.current = trigger;
    setSelectedRunId(id);
  };
  const taskActions = (task: AIReqAnalysisTask, onOpenReport: () => void) =>
    task.error && task.lastRunId ? (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`查看 ${task.srId} 失败原因`}
          onClick={onOpenReport}
        >
          原因
        </Button>
        <ControlHintTooltip title={retryBlocker(task) ?? "仅重试当前 SR"}>
          <span tabIndex={retryBlocker(task) ? 0 : undefined}>
            <Button
              variant="outline"
              size="sm"
              aria-label={`重试 ${task.srId}`}
              disabled={pending || Boolean(retryBlocker(task))}
              onClick={() => retry(task)}
            >
              重试
            </Button>
          </span>
        </ControlHintTooltip>
      </div>
    ) : task.lastRunId ? (
      <Button
        variant="ghost"
        size="sm"
        aria-label={`查看 ${task.srId} 最近报告`}
        onClick={onOpenReport}
      >
        查看报告
      </Button>
    ) : (
      <span className="text-ui-sm text-foreground-subtle">—</span>
    );
  useEffect(() => {
    if (taskResult && taskResult.page !== taskPage) {
      setTaskPage(taskResult.page);
      setSelectedRunId(undefined);
    }
    if (historyResult && historyResult.page !== historyPage) {
      setHistoryPage(historyResult.page);
      setSelectedRunId(undefined);
    }
  }, [taskResult, taskPage, historyResult, historyPage, selectedRunId, tab]);
  const resetAnalysisPages = () => {
    setTaskPage(1);
    setHistoryPage(1);
    setSelectedRunId(undefined);
  };
  const resetHistoryPage = () => {
    setHistoryPage(1);
    setSelectedRunId(undefined);
  };
  if (!snapshot)
    return (
      <section data-testid="aireq-requirement-analysis">
        <QueryFeedback
          loading={snapshotQuery.loading}
          error={snapshotQuery.error}
          onRetry={refresh}
        />
      </section>
    );
  const activeQuery = tab === "tasks" ? taskQuery : historyQuery;
  const refreshError = snapshotQuery.error ?? (activeQuery.value ? activeQuery.error : undefined);
  const runningCount = snapshot.projects.reduce(
    (total, project) => total + project.runningCount,
    0,
  );
  return (
    <section className="min-w-0 space-y-3" data-testid="aireq-requirement-analysis">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 py-1">
        <div className="flex flex-wrap items-center gap-3 text-ui-sm">
          <Label htmlFor="analysis-enabled">自动分析</Label>
          <Switch
            id="analysis-enabled"
            checked={snapshot.enabled}
            disabled={pending}
            onCheckedChange={(enabled) =>
              mutate(
                () => scheduler.configure(enabled, snapshot.intervalMinutes),
                `全局自动分析已${enabled ? "开启" : "暂停"}。`,
              )
            }
          />
          <span className="text-foreground-subtle">
            {snapshot.enabled ? `每 ${snapshot.intervalMinutes} 分钟` : "已暂停"}
          </span>
          <span className="tabular-nums text-foreground-subtle" title={time(snapshot.nextCheckAt)}>
            下次检查 {shortTime(snapshot.nextCheckAt)}
          </span>
          <span className="tabular-nums text-foreground-subtle">全局 {runningCount} 个运行中</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 aria-hidden="true" className="size-4" />
          分析设置
          <span className="text-foreground-subtle">
            {snapshot.projects.filter((project) => project.enabled).length}/
            {snapshot.projects.length} 项目
          </span>
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => void mutate(
          () => scheduler.advance(),
          "模拟推进全局调度：已有任务先完成；否则检查已开启项目的到期 SR。非真实时钟或模型执行。",
        )}>
          模拟推进下一次调度检查
        </Button>
      </div>
      {/* 退场动画期间保留提交快照，避免范围和数量闪为空值。 */}
      <AnalysisRunConfirmation
        open={analysisDialogOpen}
        onOpenChange={(open) => {
          if (!open) setAnalysisDialogOpen(false);
        }}
        scope={analysisRequest?.scope ?? ""}
        count={analysisRequest?.count ?? 0}
        unit="SR"
        disabled={pending}
        onConfirm={() => {
          if (!analysisRequest) return;
          const requestedFilter = analysisRequest.filter;
          setAnalysisDialogOpen(false);
          void mutate(
            () => scheduler.runNow(requestedFilter),
            "已提交全部筛选结果的分析任务；运行中的 SR 不会重复提交。",
          );
        }}
      />
      <AnalysisSettings
        snapshot={snapshot}
        scheduler={scheduler}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        onOpenModelSettings={onOpenModelSettings}
        projectSearch={projectSearch}
        setProjectSearch={setProjectSearch}
        interval={interval}
        setInterval={setInterval}
        pending={pending}
        message={message}
        mutate={mutate}
      />
      {/* 列表按内容自然撑高，纵向滚动统一交给页面，表格只负责横向滚动。 */}
      <section aria-label="分析任务与执行历史" className="min-w-0">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            setSelectedRunId(undefined);
          }}
          className="min-w-0 gap-3"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Label htmlFor="analysis-sr-search" className="sr-only">
                搜索 SR（任务与历史）
              </Label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
              />
              <Input
                id="analysis-sr-search"
                className="h-9 rounded-lg bg-surface pl-9"
                placeholder="搜索 SR 名称或编号"
                value={srSearch}
                onChange={(event) => {
                  setSrSearch(event.target.value);
                  resetAnalysisPages();
                }}
              />
            </div>
            <FilterSelect
              id="analysis-project"
              label="项目"
              triggerClassName="rounded-lg bg-surface"
              value={projectId}
              onChange={(value) => aireq.navigate(() => {
                aireq.switchProject(value);
                setIrId("all");
                resetAnalysisPages();
              })}
            >
              {!snapshot.projects.length && <SelectItem value="none" disabled>请在设置创建项目</SelectItem>}
              {snapshot.projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect id="analysis-release" label="Release" triggerClassName="rounded-lg bg-surface"
              value={releaseId || "all"} onChange={(value) => aireq.navigate(() => {
                aireq.setReleaseId(value === "all" ? "" : value);
                setIrId("all"); resetAnalysisPages();
              })}>
              <SelectItem value="all">全部 Release</SelectItem>
              {aireq.view?.releases.filter((release) => release.projectId === projectId).map((release) => <SelectItem key={release.id} value={release.id}>{release.title}</SelectItem>)}
            </FilterSelect>
            <FilterSelect
              id="analysis-ir"
              label="IR"
              triggerClassName="rounded-lg bg-surface"
              value={irId}
              onChange={(value) => {
                setIrId(value);
                resetAnalysisPages();
              }}
            >
              <SelectItem value="all">全部 IR</SelectItem>
              {irs.map((ir) => (
                <SelectItem key={`${ir.projectId}-${ir.id}`} value={ir.id}>
                  {ir.id} · {ir.title}
                </SelectItem>
              ))}
            </FilterSelect>
            {(irId !== "all" || srSearch) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIrId("all");
                  setSrSearch("");
                  resetAnalysisPages();
                }}
              >
                清除搜索／IR 筛选
              </Button>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <TabsList aria-label="进度分析列表">
              <TabsTrigger value="tasks" aria-label="SR 任务">
                SR 任务{" "}
                <span className="ml-1 tabular-nums text-foreground-subtle">
                  {taskResult?.total ?? "…"}
                </span>
              </TabsTrigger>
              <TabsTrigger value="history" aria-label="执行历史">
                执行历史{" "}
                <span className="ml-1 tabular-nums text-foreground-subtle">
                  {historyResult?.total ?? "…"}
                </span>
              </TabsTrigger>
            </TabsList>
            {tab === "tasks" && (
              <Button
                size="sm"
                disabled={
                  pending ||
                  taskQuery.loading ||
                  Boolean(taskQuery.error) ||
                  !taskResult?.eligibleCount
                }
                onClick={() => {
                  setAnalysisRequest({
                    filter: { ...filter },
                    count: taskResult?.eligibleCount ?? 0,
                    scope: `分析当前项目／Release 全部筛选分页。项目：${snapshot.projects.find((project) => project.id === projectId)?.name ?? "未选择项目"}；Release：${aireq.view?.releases.find((release) => release.id === releaseId)?.title ?? "全部 Release"}；IR：${irId === "all" ? "全部 IR" : irId}${srSearch.trim() ? `；搜索：${srSearch.trim()}` : ""}。`,
                  });
                  setAnalysisDialogOpen(true);
                }}
                aria-label={`分析当前筛选范围的 ${taskResult?.eligibleCount ?? 0} 个 SR`}
              >
                分析 {taskResult?.eligibleCount ?? "…"} 个 SR
              </Button>
            )}
          </div>
          {tab === "tasks" && (
            <QueryFeedback
              loading={taskQuery.loading}
              error={taskQuery.error}
              onRetry={refresh}
              hasData={Boolean(taskResult)}
            />
          )}
          {tab === "tasks" && taskResult && (
            <TabsContent value="tasks" className="m-0 min-w-0 flex-none rounded-xl border border-border bg-surface">
              <AnalysisTaskTable
                items={taskResult.items}
                projects={snapshot.projects}
                onMessage={setMessage}
                taskActions={taskActions}
                openReport={openReport}
              />
              {!taskResult.total && (
                <p className="flex min-h-48 items-center justify-center px-4 py-8 text-center text-ui-base text-foreground-subtle">
                  当前范围没有正式 SR 任务。
                </p>
              )}
              <Pagination
                kind="task"
                page={taskResult.page}
                pageSize={taskPageSize}
                total={taskResult.total}
                onPage={(page) => {
                  setTaskPage(page);
                  setSelectedRunId(undefined);
                }}
                onPageSize={(size) => {
                  setTaskPageSize(size);
                  setTaskPage(1);
                  setSelectedRunId(undefined);
                }}
              />
            </TabsContent>
          )}
          {tab === "history" && (
            <TabsContent value="history" className="m-0 min-w-0 flex-none space-y-3">
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <FilterSelect
                  id="analysis-history-status"
                  label="历史状态"
                  className="w-36"
                  triggerClassName="rounded-lg bg-surface"
                  value={historyStatus}
                  onChange={(value) => {
                    setHistoryStatus(value);
                    resetHistoryPage();
                  }}
                >
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(runLabels).map(([status, label]) => (
                    <SelectItem key={status} value={status}>
                      {label}
                    </SelectItem>
                  ))}
                </FilterSelect>
                <Label htmlFor="analysis-since" className="text-ui-sm text-foreground-subtle">
                  从
                </Label>
                <Input
                  id="analysis-since"
                  aria-label="开始时间（含）"
                  className="h-9 w-48 rounded-lg bg-surface"
                  type="datetime-local"
                  value={since}
                  onChange={(event) => {
                    setSince(event.target.value);
                    resetHistoryPage();
                  }}
                />
                <Label htmlFor="analysis-until" className="text-ui-sm text-foreground-subtle">
                  至
                </Label>
                <Input
                  id="analysis-until"
                  aria-label="结束时间（含）"
                  className="h-9 w-48 rounded-lg bg-surface"
                  type="datetime-local"
                  value={until}
                  onChange={(event) => {
                    setUntil(event.target.value);
                    resetHistoryPage();
                  }}
                />
                {(historyStatus !== "all" || since || until) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setHistoryStatus("all");
                      setSince("");
                      setUntil("");
                      resetHistoryPage();
                    }}
                  >
                    清除历史筛选
                  </Button>
                )}
                {dateError && (
                  <span role="alert" className="text-ui-sm text-destructive">
                    结束时间不能早于开始时间。
                  </span>
                )}
              </div>
              <QueryFeedback
                loading={historyQuery.loading}
                error={historyQuery.error}
                onRetry={refresh}
                hasData={Boolean(historyResult)}
              />
              {historyResult && (
                <>
                  <div className="min-w-0 rounded-xl border border-border bg-surface">
                    <AnalysisHistoryTable
                      items={historyResult.items}
                      projects={snapshot.projects}
                      selectedRunId={selectedRunId}
                      openReport={openReport}
                    />
                    {!historyResult.total && (
                      <p className="flex min-h-48 items-center justify-center px-4 py-8 text-center text-ui-base text-foreground-subtle">
                        当前条件下没有执行历史。
                      </p>
                    )}
                    <Pagination
                      kind="history"
                      page={historyResult.page}
                      pageSize={historyPageSize}
                      total={historyResult.total}
                      onPage={(page) => {
                        setHistoryPage(page);
                        setSelectedRunId(undefined);
                      }}
                      onPageSize={(size) => {
                        setHistoryPageSize(size);
                        setHistoryPage(1);
                        setSelectedRunId(undefined);
                      }}
                    />
                  </div>
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </section>
      <Dialog
        open={Boolean(selectedRunId)}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(undefined);
        }}
      >
        {selectedRun ? (
          <ReportPane
            run={selectedRun}
            onMessage={setMessage}
            feedback={
              <UpdateFeedback
                error={reportQuery.error}
                pending={pending}
                message={message}
                onRetry={refresh}
              />
            }
            retryDisabledReason={
              pending
                ? "正在提交，请稍候。"
                : reportQuery.loading
                  ? "正在刷新报告，请稍候。"
                  : reportQuery.error
                    ? "报告刷新失败，请重试加载。"
                    : selectedRun.failure?.retryable === false
                      ? "此失败不可直接重试，请先按下一步处理。"
                      : retryBlocker(selectedTask)
            }
            onRetry={() => {
              if (selectedTask) retry(selectedTask);
            }}
            onRestoreFocus={() =>
              reportTrigger.current?.isConnected && reportTrigger.current.focus()
            }
          />
        ) : (
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (reportTrigger.current?.isConnected) reportTrigger.current.focus();
            }}
          >
            <DialogTitle>分析执行详情</DialogTitle>
            <DialogDescription>正在读取所选执行信息与报告。</DialogDescription>
            <QueryFeedback
              loading={reportQuery.loading}
              error={reportQuery.error}
              onRetry={refresh}
            />
          </DialogContent>
        )}
      </Dialog>
      <UpdateFeedback error={refreshError} pending={pending} message={message} onRetry={refresh} />
    </section>
  );
}
