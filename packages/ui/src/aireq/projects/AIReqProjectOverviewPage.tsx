import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { srProgressStatus } from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";

export function AIReqProjectOverviewPage({ onReturnProjects }: { onReturnProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const view = ai.view;
  const project = view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.releaseId);
  const projection = view?.projectProgress?.find((item) => item.projectId === project?.id);
  const summary =
    ai.selectionReady && projection
      ? ai.releaseId
        ? release && projection.releases.find((item) => item.releaseId === release.id)
        : projection.total
      : undefined;

  // SR 只统计同一快照内所选项目及 Release 的正式需求，不能混入提案或其他项目。
  const formalIds = new Set(summary?.requirements.map((item) => item.irId) ?? []);
  const tasks = { pending: 0, active: 0, completed: 0 };
  if (summary && project && view) {
    for (const sr of view.srs) {
      if (sr.projectId !== project.id || !formalIds.has(sr.irId)) continue;
      const status = srProgressStatus(sr);
      if (status === "待开发") tasks.pending++;
      else if (status === "已完成") tasks.completed++;
      else tasks.active++;
    }
  }
  const taskTotal = tasks.pending + tasks.active + tasks.completed;
  const taskStates = [
    {
      label: zh ? "进行中" : "In progress",
      count: tasks.active,
      color: "bg-progress-surface-foreground",
    },
    { label: zh ? "待处理" : "Pending", count: tasks.pending, color: "bg-warning" },
    { label: zh ? "已完成" : "Completed", count: tasks.completed, color: "bg-success" },
  ];
  const unavailable = ai.pending
    ? zh
      ? "正在读取项目概览…"
      : "Loading project overview…"
    : zh
      ? "项目概览数据不可用，请重试。"
      : "Project overview data is unavailable. Retry the read.";

  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-project-overview"
      aria-label={zh ? "项目概览" : "Project overview"}
    >
      <p role="status" className="sr-only">
        {ai.pending && view
          ? zh
            ? "正在更新；已有数值为上次读取结果。"
            : "Updating; existing values are the last read snapshot."
          : ""}
      </p>
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-5 pt-5"}>
        {ai.error && view && (
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
              : "Values reflect the last successful read; use Retry above."}
          </p>
        )}
        {!ai.selectionReady ? (
          <div role="status" className="space-y-3 text-foreground-subtle">
            <p>{unavailable}</p>
            {!ai.pending && (
              <Button variant="outline" onClick={() => void ai.refresh()}>
                {zh ? "重试" : "Retry"}
              </Button>
            )}
          </div>
        ) : !project ? (
          <div className="flex flex-wrap items-center gap-3 text-foreground-subtle">
            <p>
              {zh
                ? "请选择项目，或返回项目列表添加项目。"
                : "Choose a project, or return to the project list to add one."}
            </p>
            <Button variant="outline" onClick={onReturnProjects}>
              {zh ? "返回项目列表" : "Back to projects"}
            </Button>
          </div>
        ) : (
          <>
            {!releases.length && (
              <div className="flex flex-wrap items-center gap-3 text-foreground-subtle">
                <p>
                  {zh
                    ? "当前项目尚无 Release，请返回项目列表配置。"
                    : "This project has no Releases. Return to the project list to configure it."}
                </p>
                <Button variant="outline" onClick={onReturnProjects}>
                  {zh ? "返回项目列表" : "Back to projects"}
                </Button>
              </div>
            )}
            {!summary ? (
              <div role="status" className="space-y-3 text-foreground-subtle">
                <p>{unavailable}</p>
                {!ai.pending && (
                  <Button variant="outline" onClick={() => void ai.refresh()}>
                    {zh ? "重试" : "Retry"}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <section
                  aria-labelledby="overview-requirements-heading"
                  className="space-y-5 border-b border-border pb-6"
                >
                  <h2 id="overview-requirements-heading" className="text-ui-xl font-semibold">
                    {zh ? "需求概览" : "Requirements overview"}
                  </h2>
                  <dl className="grid grid-cols-3 divide-x divide-border">
                    {[
                      {
                        label: zh ? "正式需求" : "Formal requirements",
                        count: summary.formalCount,
                        target: "formal" as const,
                      },
                      {
                        label: zh ? "需求提案" : "Proposals",
                        count: summary.proposalCount,
                        target: "proposals" as const,
                      },
                    ].map((item) => (
                      <div key={item.target} className="min-w-0 space-y-2 px-4 first:pl-0">
                        <dt className="text-ui-sm text-foreground-subtle">{item.label}</dt>
                        <dd>
                          <Button
                            variant="link"
                            className="h-auto gap-1 p-0 text-ui-page-title font-semibold tabular-nums"
                            aria-label={
                              zh
                                ? `查看${item.label}：${item.count}`
                                : `View ${item.label}: ${item.count}`
                            }
                            onClick={() => ai.navigate(() => ai.setMainView(item.target))}
                          >
                            {item.count}
                            <ChevronRight
                              className="size-4 text-foreground-subtle"
                              aria-hidden="true"
                            />
                          </Button>
                        </dd>
                      </div>
                    ))}
                    <div className="min-w-0 space-y-2 px-4">
                      <dt className="text-ui-sm text-foreground-subtle">
                        {zh ? "想法池 · 全部项目" : "Ideas · All projects"}
                      </dt>
                      <dd className="flex min-h-9 items-center text-ui-sm text-foreground-subtle">
                        <Button
                          variant="link"
                          className="h-auto p-0 text-ui-page-title font-semibold tabular-nums"
                          // 数字本身不表达动作与全局范围，读屏名称需和相邻正式需求入口一样完整。
                          aria-label={
                            zh
                              ? `查看想法池（全部项目）：${ai.view?.ideas.length ?? 0}`
                              : `View ideas (all projects): ${ai.view?.ideas.length ?? 0}`
                          }
                          onClick={() => ai.navigate(() => ai.setMainView("ideas"))}
                        >
                          {ai.view?.ideas.length}
                        </Button>
                      </dd>
                    </div>
                  </dl>
                </section>
                <section aria-labelledby="overview-tasks-heading" className="space-y-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 id="overview-tasks-heading" className="text-ui-xl font-semibold">
                      {zh ? "任务概览" : "Tasks overview"}
                    </h2>
                    <p className="text-ui-sm text-foreground-subtle">
                      {zh
                        ? "按正式需求的开发单元（SR）统计"
                        : "Development units (SR) in formal requirements"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-12 gap-y-5">
                    <dl className="grid min-w-0 flex-1 grid-cols-4 divide-x divide-border">
                      {[{ label: zh ? "总任务" : "Total", count: taskTotal }, ...taskStates].map(
                        (item) => (
                          <div key={item.label} className="min-w-0 space-y-2 px-4 first:pl-0">
                            <dt className="text-ui-sm text-foreground-subtle">{item.label}</dt>
                            <dd className="text-ui-page-title font-semibold tabular-nums">
                              {item.count}
                            </dd>
                          </div>
                        ),
                      )}
                    </dl>
                    <div
                      className="min-w-64 flex-1 space-y-3"
                      aria-label={zh ? "任务状态分布" : "Task status distribution"}
                    >
                      <div
                        className="flex h-2 overflow-hidden rounded-full bg-surface-hover"
                        aria-hidden="true"
                      >
                        {taskTotal > 0 &&
                          taskStates.map((item) => (
                            <div
                              key={item.label}
                              className={item.color}
                              style={{ width: `${(item.count / taskTotal) * 100}%` }}
                            />
                          ))}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ui-sm text-foreground-subtle">
                        {taskStates.map((item) => (
                          <span key={item.label} className="inline-flex items-center gap-1.5">
                            <span
                              className={`size-2 rounded-sm ${item.color}`}
                              aria-hidden="true"
                            />
                            {item.label} {item.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
