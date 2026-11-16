import { FolderGit2, ArrowRight, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import { OverviewProgress } from "./OverviewProgress.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";
export { AIReqProjectOverviewPage } from "./AIReqProjectOverviewPage.js";
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
                  className={`relative gap-0 py-0 transition-colors hover:border-border-hover ${selected ? "border-foreground-subtle bg-card-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="flex w-full flex-1 cursor-pointer flex-col gap-3 rounded-xl border-2 border-transparent p-4 text-left hover:bg-surface-hover focus-visible:border-foreground"
                    onClick={() => ai.openProject(item.id)}
                    aria-label={zh ? "进入" + item.name : "Open " + item.name}
                  >
                    <span className="flex w-full items-start justify-between gap-2 pr-9">
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
                  <ControlHintTooltip title={zh ? "配置此项目" : "Configure project"}>
                    <Button
                      variant="ghost"
                      size="icon-md"
                      className="absolute top-2 right-2"
                      aria-label={zh ? `配置项目 ${item.name}` : `Configure project ${item.name}`}
                      onClick={() => onConfigureProject(item.id)}
                    >
                      <Settings2 className="size-4" aria-hidden="true" />
                    </Button>
                  </ControlHintTooltip>
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
                <span className="ml-2">
                  {zh ? "请使用上方“添加项目”。" : "Use Add project above to get started."}
                </span>
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
