import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Progress } from "@/components/ui/progress.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIReqReleaseOverview } from "./AIReqReleaseOverview.js";
import type { useRecentReleaseOverview } from "./useRecentReleaseOverview.js";

export function AIReqProjectDocumentsPage({
  overview,
}: {
  overview: ReturnType<typeof useRecentReleaseOverview>;
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const projectId = ai.selection.projectId;
  const view = ai.view;
  const projects = view?.projects;
  const project = projects?.find((p) => p.id === projectId);
  const { recent, release, now, selectRelease } = overview;
  const counts = projectId && view?.projectRequirementCounts?.[projectId];
  const unassigned =
    counts && view
      ? counts.requirementCount -
        view.releases.reduce(
          (sum, r) => sum + (r.projectId === projectId ? r.requirementCount : 0),
          0,
        )
      : 0;
  const failed = !!projectId && view?.releaseReadFailures?.includes(projectId);
  const date = (stamp: number) =>
    new Date(stamp).toLocaleDateString(locale, {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
    });
  return (
    <main
      data-aireq-themed-page="projects"
      data-testid="aireq-project-progress"
      className="@container/home h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base"
    >
      <div className="space-y-5 pb-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <ScopedPageTitle />
          <Button
            size="lg"
            variant="outline"
            disabled={ai.pending}
            onClick={() => void ai.refreshProjects()}
          >
            <RefreshCw aria-hidden="true" />
            {ai.pending ? (zh ? "刷新中…" : "Refreshing…") : zh ? "刷新项目" : "Refresh projects"}
          </Button>
        </header>
        {project && (
          <div className="grid items-start gap-5 @min-[900px]/home:grid-cols-12">
            <section
              aria-label={zh ? "近期版本" : "Recent releases"}
              className="min-w-0 rounded-xl border border-card-border bg-card p-3 @min-[900px]/home:col-span-3"
            >
              <div className="mb-3 px-2 pt-1">
                <h2 className="text-ui-lg font-semibold">
                  {zh ? "近期 Release" : "Recent releases"}
                </h2>
                <p className="mt-1 text-ui-caption text-foreground-subtle">
                  {zh ? "最近 12 个月 · 按最近新增 IR 排序" : "Last 12 months · Latest IR first"}
                </p>
              </div>
              {failed ? (
                <p role="status" className="text-destructive">
                  {zh
                    ? "需求统计读取失败，请刷新项目。"
                    : "Could not read requirements. Refresh projects to retry."}
                </p>
              ) : !ai.selectionReady ? (
                <p role="status" className="text-foreground-subtle">
                  {ai.error
                    ? zh
                      ? "项目需求读取失败。"
                      : "Could not load project requirements."
                    : zh
                      ? "正在读取需求…"
                      : "Loading requirements…"}
                </p>
              ) : recent.length ? (
                <ul className="space-y-1">
                  {recent.map((r) => {
                    const complete =
                      r.requirementCount > 0 && r.completedRequirementCount === r.requirementCount;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          aria-pressed={r.id === release?.id}
                          data-aireq-release-choice=""
                          className="group/release grid w-full min-w-0 gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-input-border-focused aria-pressed:border-brand/55 aria-pressed:bg-selected/55"
                          onClick={() => selectRelease({ projectId: project.id, releaseId: r.id })}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 wrap-anywhere font-medium group-aria-pressed/release:font-semibold">
                              {r.title}
                            </span>
                            <span className="shrink-0 text-ui-caption tabular-nums text-foreground-subtle">
                              {date(r.updatedAt)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5 text-ui-caption tabular-nums text-foreground-subtle">
                            <span>
                              {complete
                                ? zh
                                  ? "全部完成"
                                  : "All complete"
                                : zh
                                  ? "已完成"
                                  : "Completed"}{" "}
                              {r.completedRequirementCount} / {r.requirementCount}
                            </span>
                            {complete && (
                              <Check
                                className="size-3.5 text-success-surface-foreground"
                                aria-hidden="true"
                              />
                            )}
                            <Progress
                              aria-hidden="true"
                              className="ml-auto w-16 max-w-[34%] shrink-0 bg-border/60"
                              indicatorClassName={complete ? "bg-success" : "bg-brand/75"}
                              value={
                                r.requirementCount
                                  ? (100 * r.completedRequirementCount) / r.requirementCount
                                  : 0
                              }
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-2 text-foreground-subtle">
                  {zh
                    ? "最近 12 个月没有新增 IR 的版本。"
                    : "No releases with new IRs in the last 12 months."}
                </p>
              )}
              <div className="mt-3 -mx-1 flex flex-wrap items-center justify-between gap-x-0 border-t border-border/65 pt-2">
                <Button
                  variant="link"
                  size="lg"
                  className="gap-1 px-1 font-medium"
                  aria-label={
                    zh
                      ? `查看 ${project.name} 的全部需求`
                      : `View all requirements in ${project.name}`
                  }
                  onClick={() => ai.openProject(project.id)}
                >
                  {zh ? "项目全部需求" : "All IRs"}
                </Button>
                {!failed && ai.selectionReady && unassigned > 0 && (
                  <Button
                    variant="ghost"
                    size="lg"
                    className="gap-1.5 px-1 font-medium text-foreground-subtle"
                    onClick={() =>
                      ai.openProject(project.id, undefined, {
                        query: "",
                        filters: { release: [""] },
                      })
                    }
                  >
                    {zh ? "未分配版本" : "Unassigned"}
                    <span className="rounded bg-background px-1.5 text-ui-caption tabular-nums text-foreground-subtle">
                      {unassigned}
                    </span>
                  </Button>
                )}
              </div>
            </section>
            {!failed && ai.selectionReady && release && (
              <AIReqReleaseOverview
                key={JSON.stringify([project.id, release.id])}
                release={release}
                requirements={view!.requirements.filter(
                  (ir) => ir.projectId === project.id && ir.releaseId === release.id,
                )}
                now={now}
                zh={zh}
              />
            )}
          </div>
        )}
        {view && !projects?.length && !ai.pending && !ai.error && (
          <p className="text-foreground-subtle">
            {zh
              ? "暂无名称包含「开发」的云龙项目。"
              : "No CloudDragon projects have “开发” in their name."}
          </p>
        )}
      </div>
    </main>
  );
}
