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
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-6"}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目" : "Projects"}</h1>
            <p className="text-ui-sm text-foreground-subtle">
              {zh
                ? "查看全部项目，进入项目空间处理需求与进度。"
                : "Explore all projects and open a project space to work with requirements and progress."}
            </p>
            <details className="max-w-3xl text-ui-sm text-foreground-subtle">
              <summary className="w-fit cursor-pointer hover:text-foreground">
                {zh ? "进度如何计算" : "How progress is calculated"}
              </summary>
              <p className="mt-2">
                {zh
                  ? "进度按项目全部 Release 的正式 SR 等权平均，提案不计入；未分析按 0 并标注，代码合入为 99%，人工验收通过才为 100%。"
                  : "Progress averages formal SRs across all project Releases, excluding proposals. Unanalyzed SRs count as zero; code merge means 99%, and human test acceptance means 100%."}
              </p>
            </details>
            {ai.error && view && (
              <p className="text-ui-sm text-foreground-subtle">
                {zh
                  ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
                  : "Values reflect the last successful read; use Retry above."}
              </p>
            )}
          </div>
          <div className="relative shrink-0">
            <Button variant="outline" onClick={onManageProjects}>
              <Settings2 className="size-4" />
              {zh ? "项目配置" : "Project settings"}
            </Button>
            {/* 修复：后台读取的可见反馈脱离文档流，不再推移已有项目卡片。 */}
            <p
              role="status"
              className="absolute top-full right-0 mt-1 whitespace-nowrap text-ui-xs text-foreground-subtle"
            >
              {ai.pending && view ? (zh ? "正在更新…" : "Updating…") : ""}
            </p>
          </div>
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
                    className="flex w-full flex-1 cursor-pointer flex-col gap-3 rounded-xl border-2 border-transparent p-4 text-left hover:bg-surface-hover focus-visible:border-foreground"
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
                      <span className="w-full space-y-1">
                        <span className="block text-ui-sm text-foreground">
                          {zh ? "项目总进度 · 全部 Release" : "Total progress · All Releases"}
                        </span>
                        <OverviewProgress percent={total.percent} label={item.name} zh={zh} />
                      </span>
                    ) : (
                      <span className="text-ui-sm text-foreground-subtle">{unavailable}</span>
                    )}
                    <span className="flex items-center gap-1 text-ui-sm text-foreground-subtle">
                      {zh ? "进入项目" : "Open project"}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </button>
                  {total && (
                    // 修复：全项目计数独立可聚焦；沿用 Context 原子切项目并清空 Release，避免范围错配及多条历史。
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 px-4 py-3">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-ui-sm tabular-nums"
                        aria-label={
                          zh
                            ? `查看${item.name}的全部提案（${total.proposalCount}）`
                            : `View all proposals in ${item.name} (${total.proposalCount})`
                        }
                        onClick={() => ai.openProject(item.id, "proposals")}
                      >
                        {zh ? `提案 ${total.proposalCount}` : `${total.proposalCount} proposals`}
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-ui-sm tabular-nums"
                        aria-label={
                          zh
                            ? `查看${item.name}的全部正式需求（${total.formalCount}）`
                            : `View all formal requirements in ${item.name} (${total.formalCount})`
                        }
                        onClick={() => ai.openProject(item.id, "formal")}
                      >
                        {zh ? `正式 IR ${total.formalCount}` : `${total.formalCount} formal IRs`}
                      </Button>
                    </div>
                  )}
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
