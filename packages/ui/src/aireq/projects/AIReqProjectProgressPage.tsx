import { FolderGit2, ArrowRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import { OverviewProgress } from "./OverviewProgress.js";
export { AIReqProjectOverviewPage } from "./AIReqProjectOverviewPage.js";
export function AIReqProjectProgressPage({ onManageProjects }: { onManageProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const view = ai.view;
  const project = view?.projects.find((item) => item.id === ai.selection.projectId);
  const unavailable = ai.pending
    ? zh
      ? "正在读取进度…"
      : "Loading progress…"
    : zh
      ? "进度数据不可用，请重试。"
      : "Progress data is unavailable. Retry the read.";
  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-project-progress"
    >
      {/* 后台重读曾反复撑高标题区；状态移出内容流，保留读屏提示和原有卡片位置。 */}
      <p role="status" className="sr-only">
        {ai.pending && view
          ? zh
            ? "正在更新；已有数值为上次读取结果。"
            : "Updating; existing values are the last read snapshot."
          : ""}
      </p>
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-6"}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目" : "Projects"}</h1>
            <p className="text-ui-sm text-foreground-subtle">
              {zh
                ? "查看全部项目，进入项目空间处理需求与进度。"
                : "Explore all projects and open a project space to work with requirements and progress."}
            </p>
            {ai.error && view && (
              <p className="text-ui-sm text-foreground-subtle">
                {zh
                  ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
                  : "Values reflect the last successful read; use Retry above."}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={onManageProjects}>
            <Settings2 className="size-4" />
            {zh ? "项目配置" : "Project settings"}
          </Button>
        </header>
        <section className="space-y-3" aria-label={zh ? "全部项目总览" : "All project totals"}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view?.projects.map((item) => {
              const total = view.projectProgress?.find(
                (entry) => entry.projectId === item.id,
              )?.total;
              const selected = project?.id === item.id;
              return (
                <Card
                  key={item.id}
                  className={`gap-0 py-0 transition-colors hover:border-border-hover ${selected ? "border-foreground-subtle bg-card-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="flex h-full w-full cursor-pointer flex-col gap-3 rounded-xl border-2 border-transparent p-4 text-left hover:bg-surface-hover focus-visible:border-foreground"
                    onClick={() => ai.openProject(item.id)}
                    aria-label={zh ? "进入" + item.name : "Open " + item.name}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <FolderGit2 className="size-4 shrink-0 text-foreground-subtle" />
                        <span className="break-words">{item.name}</span>
                      </span>
                      {selected && (
                        <Badge variant="secondary" className="shrink-0">
                          {zh ? "当前项目" : "Current"}
                        </Badge>
                      )}
                    </span>
                    {total ? (
                      <>
                        <span className="w-full space-y-1">
                          <span className="block text-ui-sm text-foreground">
                            {zh ? "项目总进度 · 全部 Release" : "Total progress · All Releases"}
                          </span>
                          <OverviewProgress percent={total.percent} label={item.name} zh={zh} />
                        </span>
                        <span className="text-ui-sm text-foreground tabular-nums">
                          {zh
                            ? `提案 ${total.proposalCount} · 正式 IR ${total.formalCount}`
                            : `${total.proposalCount} proposals · ${total.formalCount} formal IRs`}
                        </span>
                      </>
                    ) : (
                      <span className="text-ui-sm text-foreground-subtle">{unavailable}</span>
                    )}
                    <span className="flex items-center gap-1 text-ui-sm text-foreground-subtle">
                      {zh ? "进入项目" : "Open project"}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </button>
                </Card>
              );
            })}
          </div>
          {!view?.projects.length && (
            <div className="rounded-xl border border-border bg-surface px-4 py-6 text-foreground-subtle">
              {view ? (zh ? "尚无项目。" : "No projects yet.") : unavailable}
              {view && (
                <Button variant="outline" className="ml-3" onClick={onManageProjects}>
                  {zh ? "项目设置" : "Project settings"}
                </Button>
              )}
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
