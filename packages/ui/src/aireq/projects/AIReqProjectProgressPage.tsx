import { useState } from "react";
import { ChevronDown, ChevronUp, FolderGit2, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqProjectProgress } from "../contract.js";
import { OverviewProgress } from "./OverviewProgress.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";

export { AIReqProjectOverviewPage } from "./AIReqProjectOverviewPage.js";

const VISIBLE_RELEASES = 4;
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
      ? "正在读取 Release…"
      : "Loading Releases…"
    : zh
      ? "Release 数据不可用，请重试。"
      : "Release data is unavailable. Retry the read.";
  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-project-progress"
    >
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-6"}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目" : "Projects"}</h1>
              <ProjectPageHelp scope="all-projects" />
            </div>
            {ai.error && view && (
              <p className="text-ui-sm text-foreground-subtle">
                {zh
                  ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
                  : "Values reflect the last successful read; use Retry above."}
              </p>
            )}
          </div>
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
              className="absolute top-full right-0 mt-1 whitespace-nowrap text-ui-xs text-foreground-subtle"
            >
              {ai.pending && view ? (zh ? "正在更新…" : "Updating…") : ""}
            </p>
          </div>
        </header>
        <section className="space-y-4" aria-label={zh ? "全部项目总览" : "All projects"}>
          {view?.projects.map((project) => {
            const summary = view.projectProgress?.find((entry) => entry.projectId === project.id);
            const releases = summary ? sortReleases(summary.releases) : undefined;
            const expanded = expandedProjects.has(project.id);
            const visible = expanded ? releases : releases?.slice(0, VISIBLE_RELEASES);
            const regionId = `project-releases-${encodeURIComponent(project.id)}`;
            return (
              <Card key={project.id} className="gap-0 py-0" data-testid="project-release-group">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                  <Button
                    variant="ghost"
                    className="min-w-0 max-w-full justify-start gap-2 px-0 font-medium"
                    onClick={() => ai.openProject(project.id)}
                    aria-label={zh ? `进入${project.name}` : `Open ${project.name}`}
                  >
                    <FolderGit2
                      className="size-4 shrink-0 text-foreground-subtle"
                      aria-hidden="true"
                    />
                    <span className="truncate">{project.name}</span>
                  </Button>
                  {ai.selection.projectId === project.id && (
                    <Badge variant="secondary">{zh ? "当前项目" : "Current"}</Badge>
                  )}
                  {releases && (
                    <span className="text-ui-sm text-foreground-subtle">
                      {zh ? `${releases.length} 个 Release` : `${releases.length} releases`}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    className="ml-auto shrink-0 text-foreground-subtle"
                    aria-label={
                      zh ? `配置项目 ${project.name}` : `Configure project ${project.name}`
                    }
                    onClick={() => onConfigureProject(project.id)}
                  >
                    <Settings2 className="size-4" aria-hidden="true" />
                    {zh ? "项目配置" : "Project settings"}
                  </Button>
                </div>
                {!releases ? (
                  <p role="status" className="px-4 py-5 text-ui-sm text-foreground-subtle">
                    {unavailable}
                  </p>
                ) : releases.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-5 text-ui-sm text-foreground-subtle">
                    <span>{zh ? "暂无 Release" : "No releases yet"}</span>
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
                    <div
                      id={regionId}
                      className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                    >
                      {visible?.map((release) => (
                        <button
                          key={release.releaseId}
                          type="button"
                          className="flex min-w-0 flex-col gap-3 rounded-xl border border-card-border bg-surface p-4 text-left transition-colors hover:border-border-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          aria-label={
                            zh
                              ? `进入${project.name}的 ${release.title}`
                              : `Open ${release.title} in ${project.name}`
                          }
                          onClick={() =>
                            ai.openProject(project.id, "projectOverview", release.releaseId)
                          }
                        >
                          <span className="min-w-0 w-full break-words font-medium">
                            {release.title}
                          </span>
                          <div className="w-full">
                            <OverviewProgress
                              percent={release.percent}
                              label={`${project.name} · ${release.title}`}
                              zh={zh}
                            />
                          </div>
                          <span className="text-ui-sm text-foreground-subtle tabular-nums">
                            {zh
                              ? `正式需求 ${release.formalCount} · 提案 ${release.proposalCount}`
                              : `Formal ${release.formalCount} · Proposals ${release.proposalCount}`}
                          </span>
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
                              ? `查看全部 ${releases.length} 个 Release`
                              : `View all ${releases.length} releases`}
                          {expanded ? (
                            <ChevronUp className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-3.5" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {!view?.projects.length && (
            <div className="rounded-xl border border-border bg-surface px-4 py-6 text-foreground-subtle">
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
