import { useState } from "react";
import { ChevronDown, ChevronRight, FolderGit2, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqProjectProgress } from "../contract.js";
import { OverviewProgress } from "./OverviewProgress.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";

export { AIReqProjectOverviewPage } from "./AIReqProjectOverviewPage.js";

const VISIBLE_RELEASES = 4;
// 首列含两侧 p-4 和边框，后续每列只增加一张 w-72 卡片与一个 gap-3。
const FIRST_COLUMN = "calc(18rem + 2rem + 2px)";
const COLUMN_STEP = "calc(18rem + 0.75rem)";
type ReleaseSummary = AIReqProjectProgress["releases"][number];

function sortReleases(releases: ReleaseSummary[]): ReleaseSummary[] {
  return [...releases].sort((a, b) => {
    const first = Date.parse(a.createdAt);
    const second = Date.parse(b.createdAt);
    if (Number.isFinite(first) && Number.isFinite(second) && first !== second)
      return second - first;
    if (Number.isFinite(first) !== Number.isFinite(second)) return Number.isFinite(first) ? -1 : 1;
    return a.releaseId.localeCompare(b.releaseId);
  });
}

export function AIReqProjectProgressPage({
  onAddProject,
  onConfigureProject,
}: {
  onAddProject(): void;
  onConfigureProject(projectId: string): void;
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const view = ai.view;
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const toggleProject = (projectId: string) => {
    setExpandedProjects((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };
  const unavailable = ai.pending
    ? zh
      ? "正在读取项目进度…"
      : "Loading project progress…"
    : zh
      ? "项目进度不可用，请重试。"
      : "Project progress is unavailable. Retry the read.";
  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges] [&_button:focus-visible]:border-remote-foreground-muted"
      data-testid="aireq-project-progress"
    >
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-6"}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目总览" : "Projects"}</h1>
              <ProjectPageHelp scope="all-projects" />
            </div>
            <p className="text-ui-sm text-remote-foreground-muted">
              {zh
                ? "按项目查看各版本的需求与进展，选择版本查看详情。"
                : "Review requirements and progress by project and release, then select a release for details."}
            </p>
            {ai.error && view && (
              <p className="text-ui-sm text-remote-foreground-muted">
                {zh
                  ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
                  : "Values reflect the last successful read; use Retry above."}
              </p>
            )}
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <div className="relative shrink-0">
              <Button
                variant="outline"
                onClick={onAddProject}
                disabled={!source.projects?.saveRepository}
              >
                <Plus className="size-4" />
                {zh ? "添加项目" : "Add project"}
              </Button>
              <p
                role="status"
                className="absolute top-full right-0 mt-1 whitespace-nowrap text-ui-sm text-remote-foreground-muted"
              >
                {ai.pending && view ? (zh ? "正在更新…" : "Updating…") : ""}
              </p>
            </div>
          </div>
        </header>
        <section className="space-y-4" aria-label={zh ? "全部项目总览" : "All projects"}>
          {view?.projects.map((project) => {
            const summary = view.projectProgress?.find((entry) => entry.projectId === project.id);
            const releases = summary ? sortReleases(summary.releases) : undefined;
            const expanded = expandedProjects.has(project.id);
            const visible = expanded ? releases : releases?.slice(0, VISIBLE_RELEASES);
            const visibleCount = visible?.length ?? 0;
            const regionId = `project-releases-${encodeURIComponent(project.id)}`;
            return (
              <Card
                key={project.id}
                className="w-full gap-0 py-0"
                // 换行时整列以外的余宽曾留在项目框内；按可容纳的完整列数收边。
                style={{
                  width: `min(100%, calc(${FIRST_COLUMN} + round(down, max(0px, 100% - ${FIRST_COLUMN}), ${COLUMN_STEP})))`,
                  maxWidth: `calc(${FIRST_COLUMN} + ${Math.max(0, visibleCount - 1)} * ${COLUMN_STEP})`,
                }}
                data-testid="project-release-group"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 border-b border-border px-4 py-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="flex min-w-0 max-w-full items-center gap-2">
                      <h2 className="min-w-0">
                        <Button
                          variant="ghost"
                          className="h-auto min-h-7 max-w-full justify-start gap-2 px-0 text-left font-semibold"
                          onClick={() => ai.openProject(project.id)}
                          aria-label={
                            zh
                              ? `进入${project.name}的全部版本概览`
                              : `Open the all-releases overview for ${project.name}`
                          }
                        >
                          <FolderGit2
                            className="size-4 shrink-0 text-foreground-subtle"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 wrap-anywhere whitespace-normal">
                            {project.name}
                          </span>
                          <ChevronRight
                            className="size-3.5 text-remote-foreground-muted"
                            aria-hidden="true"
                          />
                        </Button>
                      </h2>
                      {ai.selection.projectId === project.id && (
                        <Badge variant="secondary">{zh ? "当前项目" : "Current"}</Badge>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="mr-1 text-ui-sm text-remote-foreground-muted">
                        {releases
                          ? zh
                            ? `全部 ${releases.length} 个版本`
                            : `All ${releases.length} releases`
                          : zh
                            ? "全部版本"
                            : "All releases"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ui-caption"
                        onClick={() => ai.openProject(project.id, "proposals")}
                        aria-label={
                          zh
                            ? `进入${project.name}全部版本的需求共创`
                            : `Open co-creation across all releases in ${project.name}`
                        }
                      >
                        {zh ? "需求共创" : "Co-creation"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ui-caption"
                        onClick={() => ai.openProject(project.id, "formal")}
                        aria-label={
                          zh
                            ? `进入${project.name}全部版本的开发任务`
                            : `Open development tasks across all releases in ${project.name}`
                        }
                      >
                        {zh ? "开发任务" : "Development tasks"}
                      </Button>
                    </div>
                  </div>
                  <ControlHintTooltip
                    title={zh ? `配置项目 ${project.name}` : `Configure project ${project.name}`}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-remote-foreground-muted"
                      aria-label={
                        zh ? `配置项目 ${project.name}` : `Configure project ${project.name}`
                      }
                      onClick={() => onConfigureProject(project.id)}
                    >
                      <Settings2 className="size-4" aria-hidden="true" />
                    </Button>
                  </ControlHintTooltip>
                </div>
                {!releases ? (
                  <p role="status" className="px-4 py-5 text-ui-sm text-remote-foreground-muted">
                    {unavailable}
                  </p>
                ) : releases.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-5 text-ui-sm text-remote-foreground-muted">
                    <span>{zh ? "暂无版本" : "No releases yet"}</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => onConfigureProject(project.id)}
                    >
                      {zh ? "配置项目" : "Configure project"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    <div id={regionId} className="flex min-w-0 flex-wrap gap-3">
                      {visible?.map((release, index) => (
                        <button
                          key={release.releaseId}
                          type="button"
                          className={
                            "group/release flex min-h-36 w-72 min-w-0 max-w-full flex-col gap-3 rounded-lg border border-card-border bg-surface p-4 text-left transition-colors duration-150 ease-out hover:border-border-hover hover:bg-surface-hover focus-visible:bg-surface-hover motion-reduce:duration-100" +
                            (index >= VISIBLE_RELEASES
                              ? " motion-safe:animate-in motion-safe:fade-in-0 motion-safe:[animation-duration:200ms]"
                              : "")
                          }
                          aria-label={
                            zh
                              ? `进入${project.name}的 ${release.title}`
                              : `Open ${release.title} in ${project.name}`
                          }
                          aria-describedby={`${regionId}-details-${encodeURIComponent(release.releaseId)}`}
                          onClick={() =>
                            ai.openProject(project.id, "projectOverview", release.releaseId)
                          }
                        >
                          <span className="flex w-full items-start justify-between gap-2 font-medium">
                            <span className="min-w-0 wrap-anywhere">{release.title}</span>
                            <ChevronRight
                              aria-hidden="true"
                              className="mt-1 size-3.5 shrink-0 text-remote-foreground-muted opacity-0 group-hover/release:opacity-100 group-focus-visible/release:opacity-100"
                            />
                          </span>
                          <div
                            id={`${regionId}-details-${encodeURIComponent(release.releaseId)}`}
                            className="flex w-full flex-1 flex-col justify-end gap-3"
                          >
                            <div className="my-auto">
                              <OverviewProgress
                                percent={release.percent}
                                formalCount={release.formalCount}
                                label={`${project.name} · ${release.title}`}
                                zh={zh}
                                prominent
                              />
                            </div>
                            <span className="flex flex-wrap gap-x-3 gap-y-1 text-ui-sm text-remote-foreground-muted tabular-nums">
                              <span className="whitespace-nowrap">
                                {zh ? "正式需求" : "Formal"}{" "}
                                <strong className="font-medium text-foreground">
                                  {release.formalCount}
                                </strong>
                              </span>
                              <span className="whitespace-nowrap">
                                {zh ? "提案" : "Proposals"}{" "}
                                <strong className="font-medium text-foreground">
                                  {release.proposalCount}
                                </strong>
                              </span>
                              {release.unanalyzedCount > 0 && (
                                <span className="whitespace-nowrap">
                                  {zh ? "未分析 SR" : "Unanalyzed SRs"}{" "}
                                  <strong className="font-medium text-foreground">
                                    {release.unanalyzedCount}
                                  </strong>
                                </span>
                              )}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {releases.length > VISIBLE_RELEASES && (
                      <div className="flex justify-center border-t border-border pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-expanded={expanded}
                          aria-controls={regionId}
                          onClick={() => toggleProject(project.id)}
                        >
                          {expanded
                            ? zh
                              ? "收起"
                              : "Show less"
                            : zh
                              ? `查看全部 ${releases.length} 个版本`
                              : `View all ${releases.length} releases`}
                          <span
                            aria-hidden="true"
                            className={
                              "transition-transform duration-180 ease-out motion-reduce:transition-none" +
                              (expanded ? " rotate-180" : "")
                            }
                          >
                            <ChevronDown className="size-3.5" />
                          </span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {!view?.projects.length && (
            <div className="rounded-xl border border-border bg-surface px-4 py-6 text-remote-foreground-muted">
              {view
                ? zh
                  ? "尚无项目。请使用上方“添加项目”。"
                  : "No projects yet. Use Add project above."
                : unavailable}
            </div>
          )}
          {view?.projects.length && !view.projectProgress && !ai.pending ? (
            <Button variant="outline" onClick={() => void ai.refresh()}>
              {zh ? "重新读取进度" : "Reload progress"}
            </Button>
          ) : null}
        </section>
      </div>
    </main>
  );
}
