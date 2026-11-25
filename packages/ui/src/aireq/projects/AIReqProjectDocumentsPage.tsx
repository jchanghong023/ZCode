import { ArrowRight, FolderGit2, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Card } from "@/components/ui/card.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
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
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-project-progress"
    >
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} min-w-0 space-y-6`}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "所有项目" : "All projects"}</h1>
          <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
            <RefreshCw className="size-4" />
            {zh ? "刷新项目" : "Refresh projects"}
          </Button>
        </header>
        <section className="space-y-3" aria-label={zh ? "云龙项目" : "CloudDragon projects"}>
          {ai.view?.projects.map((project) => {
            const releases =
              ai.view?.releases.filter((item) => item.projectId === project.id) ?? [];
            const releaseReadFailed = ai.view?.releaseReadFailures?.includes(project.id);
            return (
              <Card key={project.id} className="min-w-0 gap-4 p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <FolderGit2
                    className="size-5 shrink-0 text-foreground-subtle"
                    aria-hidden="true"
                  />
                  <h2 className="min-w-0 flex-1 wrap-anywhere text-ui-base font-medium">
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
                    variant="outline"
                    aria-label={
                      zh
                        ? `查看 ${project.name} 的全部需求`
                        : `View all requirements in ${project.name}`
                    }
                    onClick={() => ai.openProject(project.id)}
                  >
                    {zh ? "全部需求" : "All requirements"}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
                {releaseReadFailed && (
                  <p className="text-ui-sm text-destructive" role="status">
                    {zh
                      ? "Release 读取失败，请刷新项目。"
                      : "Could not refresh releases. Refresh projects to retry."}
                  </p>
                )}
                {releases.length > 0 && (
                  <div className="grid min-w-0 grid-cols-1 gap-3 @min-[48rem]/conversation:grid-cols-2">
                    {releases.map((release) => (
                      <article
                        key={release.id}
                        className="flex min-w-0 flex-col gap-3 rounded-lg border border-card-border p-3"
                      >
                        <h3 className="flex min-w-0 items-center gap-2 font-medium">
                          <Tag
                            className="size-4 shrink-0 text-foreground-subtle"
                            aria-hidden="true"
                          />
                          <span className="wrap-anywhere">{release.title}</span>
                        </h3>
                        <p className="flex flex-wrap gap-x-4 gap-y-1 text-ui-sm text-foreground-subtle">
                          <span>
                            {zh ? "已定版" : "Confirmed"} {release.confirmedRequirementCount}
                          </span>
                          <span>
                            {zh ? "未定版" : "Unconfirmed"}{" "}
                            {release.requirementCount - release.confirmedRequirementCount}
                          </span>
                        </p>
                        <Button
                          className="self-start"
                          size="sm"
                          variant="outline"
                          aria-label={
                            zh
                              ? `进入 ${project.name} · ${release.title}`
                              : `Open ${project.name} · ${release.title}`
                          }
                          onClick={() => ai.openProject(project.id, release.id)}
                        >
                          {zh ? "进入工作区" : "Enter workspace"}
                          <ArrowRight className="size-4" />
                        </Button>
                      </article>
                    ))}
                  </div>
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
