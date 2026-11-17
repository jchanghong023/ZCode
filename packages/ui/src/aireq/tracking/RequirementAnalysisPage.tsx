import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { AnalysisRunConfirmation } from "./AnalysisRunConfirmation.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { SelectItem } from "@/components/ui/select.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { ProjectPageHelp } from "../projects/ProjectPageHelp.js";
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
} from "./analysis/AnalysisPresentation.js";
import { useSchedulerQuery } from "./analysis/useSchedulerQuery.js";
import { AnalysisTaskTable, AnalysisHistoryTable } from "./analysis/AnalysisTables.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";

export function AIReqRequirementAnalysisPage({
  onOpenAnalysisSettings,
}: {
  onOpenModelSettings(): void;
  onOpenAnalysisSettings(): void;
}) {
  const source = useOptionalAIReqDataSource();
  const { locale } = useZCodeIntl();
  const aireq = useAIReq()!;
  return (
    <main
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background"
      aria-label={locale === "zh-CN" ? "进度分析" : "Progress analysis"}
    >
      {/* 滚动条属于全宽页面，限宽内容列不再承担纵向滚动。 */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
        <div className={cn(AIREQ_PAGE_CONTENT_CLASSNAME, "min-w-0 space-y-4")}>
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>
            {locale === "zh-CN" ? "进度分析" : "Progress analysis"}
          </h1>
          {source?.progressScheduler ? (
            <ConnectedProgressAnalysis
              key={`${aireq.selection.projectId ?? ""}:${aireq.releaseId}:${aireq.selection.irId ?? ""}:${aireq.selection.srId ?? ""}`}
              scheduler={source.progressScheduler}
              onOpenAnalysisSettings={onOpenAnalysisSettings}
            />
          ) : (
            <p role="status" className="text-ui-base text-foreground-subtle">
              分析运行暂不可用，请稍后重试。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
function ConnectedProgressAnalysis({
  scheduler,
  onOpenAnalysisSettings,
}: {
  scheduler: AIReqProgressScheduler;
  onOpenAnalysisSettings(): void;
}) {
  const [revision, setRevision] = useState(0);
  const aireq = useAIReq()!;
  const projectId = aireq.selection.projectId ?? "";
  const releaseId = aireq.releaseId;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const loadSnapshot = useCallback(() => scheduler.read(), [scheduler]);
  const snapshotQuery = useSchedulerQuery(loadSnapshot, revision);
  const snapshot = snapshotQuery.value;
  // 修复：待办直达时保留目标 IR/SR，并以 SR 编号精确筛选，不能让相似名称指向其他任务。
  const [irId, setIrId] = useState(() => aireq.selection.irId ?? "all");
  const [srSearch, setSrSearch] = useState(() => aireq.selection.srId ?? "");
  const [targetSrId, setTargetSrId] = useState(() => aireq.selection.srId ?? "");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [tab, setTab] = useState("tasks");
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(25);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const sidePane = useAIReqSidePane();
  const selectedRunId =
    sidePane.activeTab?.kind === "analysis" ? sidePane.activeTab.runId : undefined;
  const [message, setMessage] = useState("");
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
        setMessage(formatUserFacingError(cause, "分析操作未完成，请稍后重试。"));
    } finally {
      if (lifecycle.current === scope) {
        mutation.current = false;
        setPending(false);
      }
    }
  };
  const irs =
    snapshot?.irs.filter((ir) => ir.projectId === projectId && ir.releaseId === releaseId) ?? [];
  const dateError = Boolean(since && until && since > until);
  const filter: AIReqAnalysisFilter = useMemo(
    () => ({
      projectId: projectId || "__no_project__",
      releaseId: releaseId || undefined,
      irId: irId === "all" ? undefined : irId,
      srId: targetSrId || undefined,
      srSearch,
    }),
    [projectId, releaseId, irId, targetSrId, srSearch],
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
  const openReport = (id: string) => {
    const target =
      historyResult?.items.find((run) => run.id === id) ??
      taskResult?.items.find((task) => task.lastRunId === id);
    const release =
      target?.releaseId ??
      snapshot?.irs.find((ir) => ir.projectId === target?.projectId && ir.id === target?.irId)
        ?.releaseId;
    if (!target || !release) {
      setMessage("执行报告的项目或版本归属不可用，请刷新后重试。");
      return;
    }
    sidePane.open({
      kind: "analysis",
      selection: { projectId: target.projectId, irId: target.irId, srId: target.srId },
      releaseId: release,
      title: target.srTitle,
      runId: id,
    });
  };
  const openRequirement = (target: {
    projectId: string;
    releaseId?: string;
    irId: string;
    srId: string;
  }) => {
    const release =
      target.releaseId ??
      snapshot?.irs.find((ir) => ir.projectId === target.projectId && ir.id === target.irId)
        ?.releaseId;
    if (!release) {
      setMessage("需求的版本归属不可用，请刷新后重试。");
      return;
    }
    const title =
      taskResult?.items.find(
        (task) =>
          task.projectId === target.projectId &&
          task.irId === target.irId &&
          task.srId === target.srId,
      )?.srTitle ?? target.srId;
    sidePane.open({
      kind: "report",
      selection: {
        projectId: target.projectId,
        irId: target.irId,
        srId: target.srId,
        formalView: "detail",
      },
      releaseId: release,
      title,
    });
  };
  const taskActions = (task: AIReqAnalysisTask, onOpenReport: () => void) =>
    task.error || task.state === "failed" ? (
      <div className="flex items-center justify-end gap-1">
        {task.lastRunId && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`查看 ${task.srId} 失败原因`}
            onClick={onOpenReport}
          >
            原因
          </Button>
        )}
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
    }
    if (historyResult && historyResult.page !== historyPage) {
      setHistoryPage(historyResult.page);
    }
  }, [taskResult, taskPage, historyResult, historyPage]);
  const resetAnalysisPages = () => {
    setTaskPage(1);
    setHistoryPage(1);
  };
  const resetHistoryPage = () => {
    setHistoryPage(1);
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
  const currentProject = snapshot.projects.find((project) => project.id === projectId);
  return (
    <section className="min-w-0 space-y-6" data-testid="aireq-requirement-analysis">
      {/* 页面标题由外层持有，调度状态与辅助操作在下一行集中呈现。 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-sm">
          <span className="text-foreground-subtle">
            {!currentProject?.enabled
              ? "当前项目分析已关闭"
              : snapshot.enabled
                ? `自动分析 · 每 ${snapshot.intervalMinutes} 分钟`
                : "自动分析已暂停"}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-foreground-subtle focus-visible:border-remote-foreground-muted"
              >
                <Clock3 className="size-3.5" aria-hidden="true" />
                调度详情
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3 p-4">
              <h3 className="text-ui-base font-medium">调度详情</h3>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-ui-sm">
                <dt className="text-foreground-subtle">下次检查</dt>
                <dd className="text-right tabular-nums">{time(snapshot.nextCheckAt)}</dd>
                <dt className="text-foreground-subtle">项目运行中</dt>
                <dd className="text-right tabular-nums">{currentProject?.runningCount ?? 0}</dd>
              </dl>
            </PopoverContent>
          </Popover>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ProjectPageHelp scope="analysis-runs" />
          <Button variant="ghost" size="sm" onClick={onOpenAnalysisSettings}>
            <Settings2 aria-hidden="true" className="size-3.5" />
            分析设置
          </Button>
        </div>
      </div>
      {/* 退场动画期间保留提交快照，避免范围和数量闪为空值。 */}
      <AnalysisRunConfirmation
        open={analysisDialogOpen}
        onOpenChange={(open) => {
          if (!pending && !open) setAnalysisDialogOpen(false);
        }}
        scope={analysisRequest?.scope ?? ""}
        count={analysisRequest?.count ?? 0}
        unit="SR"
        disabled={pending}
        error={message}
        onConfirm={() => {
          if (!analysisRequest) return;
          const requestedFilter = analysisRequest.filter;
          setMessage("");
          void mutate(async () => {
            await scheduler.runNow(requestedFilter);
            setAnalysisDialogOpen(false);
          }, "已提交全部筛选结果的分析任务；运行中的 SR 不会重复提交。");
        }}
      />
      {/* 列表按内容自然撑高，纵向滚动统一交给页面，表格只负责横向滚动。 */}
      <section aria-label="分析任务与执行历史" className="min-w-0">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
          }}
          className="min-w-0 gap-3"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <TabsList aria-label="分析运行列表">
              <TabsTrigger value="tasks" aria-label="分析任务">
                分析任务{" "}
                <span className="ml-1 tabular-nums text-foreground-subtle">
                  {taskResult?.total ?? "…"}
                </span>
              </TabsTrigger>
              <TabsTrigger value="history" aria-label="执行历史">
                执行历史{" "}
                {historyResult && (
                  <span className="ml-1 tabular-nums text-foreground-subtle">
                    {historyResult.total}
                  </span>
                )}
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
                  setMessage("");
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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Label htmlFor="analysis-sr-search" className="sr-only">
                搜索开发单元（任务与历史）
              </Label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
              />
              <Input
                id="analysis-sr-search"
                className="h-9 rounded-lg bg-surface pl-9"
                placeholder="搜索开发单元名称"
                value={srSearch}
                onChange={(event) => {
                  setTargetSrId("");
                  setSrSearch(event.target.value);
                  resetAnalysisPages();
                }}
              />
            </div>
            <FilterSelect
              id="analysis-ir"
              label="筛选需求"
              className="w-60 max-w-full"
              triggerClassName="rounded-lg bg-surface"
              value={irId}
              onChange={(value) => {
                setTargetSrId("");
                setIrId(value);
                resetAnalysisPages();
              }}
            >
              <SelectItem value="all">全部需求</SelectItem>
              {irs.map((ir) => (
                <SelectItem key={`${ir.projectId}-${ir.id}`} value={ir.id}>
                  {ir.title} · {ir.id}
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
                  setTargetSrId("");
                  resetAnalysisPages();
                }}
              >
                清除筛选
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
            <TabsContent
              value="tasks"
              // 分析任务与历史沿用外观卡片底色；不再以半透明 surface 合成不同的正文背景。
              className="m-0 min-w-0 flex-none rounded-xl border border-card-border bg-card text-foreground"
            >
              <AnalysisTaskTable
                items={taskResult.items}
                projects={snapshot.projects}
                onMessage={setMessage}
                taskActions={taskActions}
                openReport={openReport}
                openRequirement={openRequirement}
                initialTaskId={
                  targetSrId
                    ? taskResult.items.find(
                        (task) => task.irId === irId && task.srId === targetSrId,
                      )?.id
                    : undefined
                }
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
                }}
                onPageSize={(size) => {
                  setTaskPageSize(size);
                  setTaskPage(1);
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
                  <div className="min-w-0 rounded-xl border border-card-border bg-card text-foreground">
                    <AnalysisHistoryTable
                      items={historyResult.items}
                      projects={snapshot.projects}
                      selectedRunId={selectedRunId}
                      openReport={openReport}
                      openRequirement={openRequirement}
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
                      }}
                      onPageSize={(size) => {
                        setHistoryPageSize(size);
                        setHistoryPage(1);
                      }}
                    />
                  </div>
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </section>
      <UpdateFeedback error={refreshError} pending={pending} message={message} onRetry={refresh} />
    </section>
  );
}
