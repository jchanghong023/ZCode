import { useState } from "react";
import { ChevronDown, FolderGit2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqProjectProgress } from "../contract.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";
import { OverviewProgress } from "./OverviewProgress.js";

export { AIReqProjectOverviewPage } from "./AIReqProjectOverviewPage.js";

const VISIBLE_RELEASES = 2;
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
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-8"}>
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目总览" : "Projects"}</h1>
              <ProjectPageHelp scope="all-projects" />
            </div>
            {ai.error && view && (
              <p className="text-ui-sm text-foreground-subtle">
                {zh
                  ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
                  : "Values reflect the last successful read; use Retry above."}
              </p>
            )}
            <p className="text-ui-sm text-foreground-subtle">
              {zh
                ? "全部项目；从版本卡片进入对应需求列表。"
                : "All projects; open a release card to enter its requirements."}
            </p>
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
                className="absolute top-full right-0 mt-1 whitespace-nowrap text-ui-sm text-foreground-subtle"
              >
                {ai.pending && view ? (zh ? "正在更新…" : "Updating…") : ""}
              </p>
            </div>
          </div>
        </header>
        <section className="space-y-6" aria-label={zh ? "全部项目总览" : "All projects"}>
          {view?.projects.map((project) => {
            const summary = view.projectProgress?.find((entry) => entry.projectId === project.id);
            const releases = summary ? sortReleases(summary.releases) : undefined;
            const expanded = expandedProjects.has(project.id);
            const visible = expanded ? releases : releases?.slice(0, VISIBLE_RELEASES);
            const regionId = `project-releases-${encodeURIComponent(project.id)}`;
            return (
              <Card
                key={project.id}
                className="w-full gap-0 py-0"
                // 固定卡宽和版本数量曾把正文截短；分组铺满阅读列，内部网格按面板宽度分栏。
                data-testid="project-release-group"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderGit2
                      className="size-4 shrink-0 text-foreground-subtle"
                      aria-hidden="true"
                    />
                    <h2 className="min-w-0 wrap-anywhere font-semibold">{project.name}</h2>
                    {ai.selection.projectId === project.id && (
                      <Badge variant="secondary" className="text-ui-sm">
                        {zh ? "当前项目" : "Current"}
                      </Badge>
                    )}
                  </div>
                  <span className="text-ui-sm text-foreground-subtle">
                    {releases
                      ? !expanded && releases.length > VISIBLE_RELEASES
                        ? zh
                          ? `最近 ${VISIBLE_RELEASES} 个 · 共 ${releases.length} 个版本`
                          : `Latest ${VISIBLE_RELEASES} · ${releases.length} releases`
                        : zh
                          ? `${releases.length} 个版本`
                          : `${releases.length} releases`
                      : zh
                        ? "正在读取…"
                        : "Loading…"}
                  </span>
                </div>
                {!releases ? (
                  <p role="status" className="px-4 py-5 text-ui-sm text-foreground-subtle">
                    {unavailable}
                  </p>
                ) : releases.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-5 text-ui-sm text-foreground-subtle">
                    <span>{zh ? "暂无版本" : "No releases yet"}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onConfigureProject(project.id)}
                    >
                      {zh ? "配置项目" : "Configure project"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    <div
                      id={regionId}
                      className="grid min-w-0 grid-cols-1 gap-3 @min-[48rem]/conversation:grid-cols-2"
                    >
                      {visible?.map((release, index) => (
                        // Release 与外观设置行共用卡片底色，避免半透明 surface 在父卡片上再次叠色。
                        <article
                          key={release.releaseId}
                          className={
                            "flex min-h-36 min-w-0 flex-col gap-3 rounded-lg border border-card-border bg-card p-4" +
                            (index >= VISIBLE_RELEASES
                              ? " motion-safe:animate-in motion-safe:fade-in-0 motion-safe:[animation-duration:200ms]"
                              : "")
                          }
                          aria-label={`${project.name} · ${release.title}`}
                        >
                          <h3 className="min-w-0 wrap-anywhere font-medium">{release.title}</h3>
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
                            {/* 修复原因：内层版本卡抬升底色上 12px foreground-subtle 实测 4.28:1（<4.5）；统计标签升为主文字。 */}
                            <span className="flex flex-wrap gap-x-3 gap-y-1 text-ui-sm text-foreground tabular-nums">
                              {release.formalCount > 0 && (
                                <span className="whitespace-nowrap">
                                  {zh ? "正式需求" : "Formal"}{" "}
                                  <strong className="font-medium text-foreground">
                                    {release.formalCount}
                                  </strong>
                                </span>
                              )}
                              <span className="whitespace-nowrap">
                                {zh ? "提案" : "Proposals"}{" "}
                                <strong className="font-medium text-foreground">
                                  {release.proposalCount}
                                </strong>
                              </span>
                              {release.unanalyzedCount > 0 && (
                                <span className="whitespace-nowrap">
                                  {zh ? "未分析开发任务" : "Unanalyzed tasks"}{" "}
                                  <strong className="font-medium text-foreground">
                                    {release.unanalyzedCount}
                                  </strong>
                                </span>
                              )}
                            </span>
                            <Button
                              variant="link"
                              size="sm"
                              className="w-fit p-0"
                              onClick={() =>
                                ai.openFromProjectOverview(
                                  "proposals",
                                  { projectId: project.id },
                                  release.releaseId,
                                )
                              }
                            >
                              {zh ? "查看该版本提案" : "View proposals"}
                            </Button>
                          </div>
                        </article>
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
            <div className="rounded-xl border border-card-border bg-card px-4 py-6 text-foreground-subtle">
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
