import { ArrowRight, FolderGit2, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Card } from "@/components/ui/card.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqRequirementCounts } from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";

export function AIReqProjectDocumentsPage({
  onConfigureProject,
}: {
  onConfigureProject(projectId: string): void;
}) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  return (
    <main
      data-aireq-themed-page
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-project-progress"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} space-y-4`}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "所有项目" : "All projects"}</h1>
          <Button
            size="lg"
            variant="outline"
            disabled={ai.pending}
            onClick={() => void ai.refreshProjects()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {ai.pending ? (zh ? "刷新中…" : "Refreshing…") : zh ? "刷新项目" : "Refresh projects"}
          </Button>
        </header>
        <section className="space-y-3" aria-label={zh ? "云龙项目" : "CloudDragon projects"}>
          {ai.view?.projects.map((project) => {
            const releases =
              ai.view?.releases.filter((item) => item.projectId === project.id) ?? [];
            const releaseReadFailed = ai.view?.releaseReadFailures?.includes(project.id);
            const counts = ai.view?.projectRequirementCounts?.[project.id];
            const showCounts = !releaseReadFailed && !ai.error;
            return (
              <Card key={project.id} className="min-w-0 gap-3 p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <FolderGit2
                    className="size-5 shrink-0 text-foreground-subtle"
                    aria-hidden="true"
                  />
                  <h2 className="min-w-0 flex-1 wrap-anywhere text-ui-lg font-semibold">
                    {project.name}
                  </h2>
                  <Button
                    variant="ghost"
                    aria-label={zh ? `配置 ${project.name}` : `Configure ${project.name}`}
                    onClick={() => onConfigureProject(project.id)}
                  >
                    {zh ? "项目配置" : "Configure"}
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={
                      zh
                        ? `查看 ${project.name} 的全部需求`
                        : `View all requirements in ${project.name}`
                    }
                    onClick={() => ai.openProject(project.id)}
                  >
                    {zh ? "查看全部需求" : "View all requirements"}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
                {releaseReadFailed && (
                  <p className="text-ui-sm text-destructive" role="status">
                    {zh
                      ? "需求统计读取失败，请刷新项目。"
                      : "Could not read requirement totals. Refresh projects to retry."}
                  </p>
                )}
                {showCounts && counts && <RequirementCounts counts={counts} zh={zh} />}
                {releases.length > 0 && (
                  <ul
                    className="divide-y divide-border border-t border-border"
                    aria-label={zh ? "版本" : "Releases"}
                  >
                    {releases.map((release) => (
                      <li
                        key={release.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 last:pb-0"
                      >
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                          <h3 className="flex min-w-0 items-center gap-2 font-medium">
                            <Tag
                              className="size-4 shrink-0 text-foreground-subtle"
                              aria-hidden="true"
                            />
                            <span className="wrap-anywhere">{release.title}</span>
                          </h3>
                          {showCounts && <RequirementCounts counts={release} zh={zh} />}
                        </div>
                        <Button
                          variant="ghost"
                          aria-label={
                            zh
                              ? `查看 ${project.name} · ${release.title} 的需求`
                              : `View requirements in ${project.name} · ${release.title}`
                          }
                          onClick={() => ai.openProject(project.id, release.id)}
                        >
                          {zh ? "查看此版本需求" : "View release requirements"}
                          <ArrowRight className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
          {ai.view && !ai.view.projects.length && !ai.pending && !ai.error && (
            <p className="text-foreground-subtle">
              {zh
                ? "暂无名称包含「开发」的云龙项目。"
                : "No CloudDragon projects have “开发” in their name."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function RequirementCounts({ counts, zh }: { counts: AIReqRequirementCounts; zh: boolean }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-ui-sm text-foreground-subtle tabular-nums">
      <span>
        {zh ? "总数" : "Total"} {counts.requirementCount}
      </span>
      <span>
        {zh ? "完成" : "Completed"} {counts.completedRequirementCount ?? "—"}
      </span>
      <span>
        {zh ? "需求已定版" : "Requirements confirmed"} {counts.confirmedRequirementCount}
      </span>
    </p>
  );
}
