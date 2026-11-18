import { useCallback, useEffect, useRef, useState } from "react";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useOptionalAIReqDataSource } from "../data-source.js";
import { AnalysisReportContent } from "../tracking/analysis/ReportPane.js";
import { QueryFeedback, UpdateFeedback } from "../tracking/analysis/AnalysisPresentation.js";
import { useSchedulerQuery } from "../tracking/analysis/useSchedulerQuery.js";
import { useAIReqSidePane } from "./AIReqSidePaneContext.js";
import type { AIReqSidePaneTab } from "./contract.js";

export function AIReqAnalysisReportTab({
  tab,
  active,
}: {
  tab: AIReqSidePaneTab;
  active: boolean;
}) {
  const scheduler = useOptionalAIReqDataSource()?.progressScheduler;
  const sidePane = useAIReqSidePane();
  const { projectId, irId, srId } = tab.selection;
  const { releaseId, runId } = tab;
  const [enabled, setEnabled] = useState(active);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const mutation = useRef(false);
  const lifecycle = useRef<object | undefined>(undefined);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const load = useCallback(async () => {
    if (!scheduler || !runId || !projectId || !irId || !srId || !releaseId)
      throw new Error("分析报告目标不完整，请从执行列表重新打开。");
    const [run, snapshot] = await Promise.all([scheduler.readRun(runId), scheduler.read()]);
    if (!run) throw new Error("未找到此执行报告，记录可能已不可用。");
    const currentIr = snapshot.irs.find((ir) => ir.projectId === projectId && ir.id === irId);
    // 历史报告的身份不可由主区当前选择推断；缺少版本的旧记录也须同源 IR 归属确认。
    if (
      run.id !== runId ||
      run.projectId !== projectId ||
      run.irId !== irId ||
      run.srId !== srId ||
      (run.releaseId ?? currentIr?.releaseId) !== releaseId
    )
      throw new Error("执行报告与当前标签的项目、版本或需求不匹配，请重新打开。");
    const result = await scheduler.queryTasks({ projectId, releaseId, irId, srId }, 1, 25);
    const task = result.items.find(
      (item) =>
        item.projectId === projectId &&
        item.irId === irId &&
        item.srId === srId &&
        (item.releaseId ?? currentIr?.releaseId) === releaseId,
    );
    return {
      run,
      task,
      projectName: snapshot.projects.find((project) => project.id === projectId)?.name ?? "—",
      irTitle: currentIr?.title ?? "—",
      projectEnabled: Boolean(
        snapshot.projects.find((project) => project.id === projectId)?.enabled,
      ),
    };
  }, [scheduler, runId, projectId, releaseId, irId, srId]);
  const query = useSchedulerQuery(load, revision, Boolean(scheduler) && enabled);
  useEffect(() => {
    if (!active || !scheduler) return;
    setEnabled(true);
    refresh();
    return scheduler.subscribe(refresh);
  }, [active, scheduler, refresh]);
  useEffect(() => {
    const scope = {};
    lifecycle.current = scope;
    mutation.current = false;
    setPending(false);
    setMessage("");
    return () => {
      lifecycle.current = undefined;
    };
  }, [load]);
  const blocker = (value: NonNullable<typeof query.value>) =>
    value.run.status !== "failed"
      ? "当前执行无需重试。"
      : value.run.failure?.retryable === false
        ? "此失败不可直接重试，请先按下一步处理。"
        : !value.task
          ? "此 SR 已不在当前任务范围，无法重试。"
          : !value.projectEnabled
            ? "项目分析已关闭，请先开启项目分析。"
            : value.task.state === "running"
              ? "此 SR 正在分析，不会重复接纳；完成后再查看结果。"
              : value.task.state === "completed" || value.task.percent >= 100
                ? "此 SR 已完成，分析已停止。"
                : undefined;
  const retry = async () => {
    if (mutation.current || !scheduler) return;
    const scope = lifecycle.current;
    mutation.current = true;
    setPending(true);
    setMessage("");
    try {
      const current = await load();
      const reason = blocker(current);
      if (reason) throw new Error(reason);
      if (lifecycle.current !== scope) return;
      // 接纳前重新核对本 Tab 对象与实时资格；不能从主区或其他报告扩大重试范围。
      await scheduler.runNow({ projectId, releaseId, irId, srId });
      if (lifecycle.current === scope) {
        setMessage(`已请求 ${current.run.srTitle} 的单 SR 重试，未派发其他任务。`);
        refresh();
      }
    } catch (cause) {
      if (lifecycle.current === scope)
        setMessage(formatUserFacingError(cause, "分析重试未完成，请稍后重试。"));
    } finally {
      if (lifecycle.current === scope) {
        mutation.current = false;
        setPending(false);
      }
    }
  };
  if (!scheduler)
    return (
      <p role="status" className="p-4 text-ui-sm text-foreground-subtle">
        当前无法读取分析报告，请稍后重试。
      </p>
    );
  const value = query.value;
  if (!value)
    return (
      <QueryFeedback
        loading={query.loading || (active && !enabled)}
        error={query.error}
        onRetry={refresh}
      />
    );
  return (
    <div className="h-full min-h-0 min-w-0 p-4" data-testid="aireq-analysis-report-tab">
      <AnalysisReportContent
        run={value.run}
        context={{ projectName: value.projectName, irTitle: value.irTitle }}
        feedback={
          <UpdateFeedback
            error={query.error}
            pending={pending}
            message={message}
            onRetry={refresh}
          />
        }
        onMessage={setMessage}
        onOpenRequirement={() =>
          sidePane.open({
            kind: "report",
            selection: { projectId, irId, srId, formalView: "detail" },
            releaseId,
            title: value.run.srTitle,
          })
        }
        retryDisabledReason={
          pending
            ? "正在提交，请稍候。"
            : query.loading
              ? "正在刷新报告，请稍候。"
              : query.error
                ? "报告刷新失败，请重试加载。"
                : blocker(value)
        }
        onRetry={() => void retry()}
      />
    </div>
  );
}
