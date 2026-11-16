import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqSelection } from "../contract.js";
import { OverviewProgress } from "./OverviewProgress.js";

export function AIReqProjectOverviewPage({ onManageProjects }: { onManageProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const view = ai.view;
  const project = view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.releaseId);
  const projection = view?.projectProgress?.find((item) => item.projectId === project?.id);
  // 修复：全项目行只读 total；详情才消费唯一 Release，不能借用其他项目或旧范围的汇总。
  const summary =
    ai.selectionReady && projection
      ? ai.releaseId
        ? release && projection.releases.find((item) => item.releaseId === release.id)
        : projection.total
      : undefined;
  const unavailable = ai.pending
    ? zh
      ? "正在读取进度…"
      : "Loading progress…"
    : zh
      ? "进度数据不可用，请重试。"
      : "Progress data is unavailable. Retry the read.";
  const openReport = (irId: string, srId?: string) => {
    if (!project) return;
    const target: AIReqSelection = { projectId: project.id, irId, srId, formalView: "detail" };
    // select 已经过统一未保存门禁，并把正式详情记录为同页报告的历史选择。
    ai.select(target);
  };

  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-project-overview"
    >
      {/* 后台重读曾反复撑高标题区；状态移出内容流，保留读屏提示和原有详情位置。 */}
      <p role="status" className="sr-only">
        {ai.pending && view
          ? zh
            ? "正在更新；已有数值为上次读取结果。"
            : "Updating; existing values are the last read snapshot."
          : ""}
      </p>
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-6 pt-6"}>
        <header className="space-y-2">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目概览" : "Project overview"}</h1>
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "查看当前范围的需求进度，进入 IR 或 SR 阅读报告。"
              : "Review requirement progress in this scope and open IR or SR reports."}
          </p>
          <details className="text-ui-sm text-foreground-subtle">
            <summary className="w-fit cursor-pointer hover:text-foreground">
              {zh ? "进度如何计算" : "How progress is calculated"}
            </summary>
            <p className="mt-2">
              {zh
                ? "进度按范围内正式 SR 等权平均，提案不计入；未分析按 0 并标注，代码合入为 99%，人工验收通过才为 100%。"
                : "Progress averages formal SRs in scope, excluding proposals. Unanalyzed SRs count as zero; code merge means 99%, and human test acceptance means 100%."}
            </p>
          </details>
          {ai.error && view && (
            <p className="text-ui-sm text-foreground-subtle">
              {zh
                ? "已有数值仅代表上次成功读取；请使用上方重试入口。"
                : "Values reflect the last successful read; use Retry above."}
            </p>
          )}
        </header>
        <section className="space-y-4" aria-label={zh ? "当前项目详情" : "Current project details"}>
          {!project ? (
            <div className="flex flex-wrap items-center gap-3 text-foreground-subtle">
              <p>
                {zh
                  ? "请选择项目，或在设置中添加名称、远程仓库和默认分支。"
                  : "Choose a project, or add a name, remote repository and default branch in settings."}
              </p>
              <Button variant="outline" onClick={onManageProjects}>
                {zh ? "项目设置" : "Project settings"}
              </Button>
            </div>
          ) : (
            <>
              {!releases.length && (
                <div className="flex flex-wrap items-center gap-3 text-foreground-subtle">
                  <p>
                    {zh
                      ? "当前项目尚无 Release，请在设置中添加。"
                      : "This project has no Releases. Add one in settings."}
                  </p>
                  <Button variant="outline" onClick={onManageProjects}>
                    {zh ? "管理 Release" : "Manage Releases"}
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
                  <div className="grid gap-4 rounded-xl border border-card-border bg-card p-4 md:grid-cols-6">
                    <div className="space-y-2 md:col-span-2">
                      <div className="text-ui-sm text-foreground">
                        {zh ? "范围进度" : "Scope progress"} ·{" "}
                        {release?.title ?? (zh ? "全部 Release" : "All Releases")}
                      </div>
                      <OverviewProgress
                        percent={summary.percent}
                        label={project.name}
                        zh={zh}
                        prominent
                      />
                    </div>
                    <div>
                      <div className="text-ui-sm text-foreground">
                        {zh ? "正式 IR" : "Formal IRs"}
                      </div>
                      <div className="mt-1 text-ui-xl font-medium tabular-nums">
                        {summary.formalCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-ui-sm text-foreground">{zh ? "提案" : "Proposals"}</div>
                      <div className="mt-1 text-ui-xl font-medium tabular-nums">
                        {summary.proposalCount}
                      </div>
                      {/* 修复：提案入口只在需求子页时，从全项目总览处理提案需额外切换视图。 */}
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-ui-sm"
                        onClick={() => ai.navigate(() => ai.setMainView("proposals"))}
                      >
                        {zh ? "查看提案" : "View proposals"}
                      </Button>
                    </div>
                    <div>
                      <div className="text-ui-sm text-foreground">SR</div>
                      <div className="mt-1 text-ui-xl font-medium tabular-nums">
                        {summary.srCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-ui-sm text-foreground">
                        {zh ? "未分析" : "Unanalyzed"}
                      </div>
                      <div className="mt-1 text-ui-xl font-medium tabular-nums">
                        {summary.unanalyzedCount}
                      </div>
                      <div className="text-ui-sm text-foreground-subtle">
                        {zh ? "按 0 计" : "Counted as zero"}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                    <table
                      className="w-full min-w-[680px] table-fixed text-left"
                      aria-label={zh ? "项目正式需求进度表" : "Project formal requirement progress"}
                    >
                      <colgroup>
                        <col className="w-[32%]" />
                        <col className="w-[20%]" />
                        <col className="w-[16%]" />
                        <col />
                        <col className="w-14" />
                      </colgroup>
                      <thead className="text-ui-sm text-foreground-subtle">
                        <tr>
                          {(zh
                            ? ["正式需求原文／编号", "Release", "SR 数／未分析", "IR 进度", "操作"]
                            : [
                                "Original request / IR",
                                "Release",
                                "SRs / Unanalyzed",
                                "IR progress",
                                "Actions",
                              ]
                          ).map((label, index) => (
                            <th
                              key={label}
                              className={`border-b border-border py-3 font-medium ${index === 4 ? "px-2 text-right" : "px-4"}`}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summary.requirements.map((item) => {
                          const srs =
                            view?.srs.filter(
                              (sr) => sr.projectId === project.id && sr.irId === item.irId,
                            ) ?? [];
                          const itemRelease = releases.find((entry) => entry.id === item.releaseId);
                          // 修复：悬停底色叠加后辅助色对比不足，编号与未分析提示改用现有前景色。
                          return (
                            <tr
                              key={item.irId}
                              className="group/row border-b border-border/50 last:border-0 hover:bg-surface-hover"
                            >
                              <td className="px-4 py-3">
                                <Button
                                  variant="ghost"
                                  className="h-auto w-full justify-start whitespace-normal break-words px-0 text-left"
                                  onClick={() => openReport(item.irId)}
                                >
                                  {item.originalText}
                                </Button>
                                <span className="block text-ui-sm text-foreground-subtle group-hover/row:text-foreground">
                                  {item.irId}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-ui-sm">
                                {itemRelease?.title ?? item.releaseId}
                              </td>
                              <td className="px-4 py-3 text-ui-sm">
                                <span>{item.srCount} SR</span>
                                {item.unanalyzedCount > 0 && (
                                  <span className="block text-foreground-subtle group-hover/row:text-foreground">
                                    {zh
                                      ? `${item.unanalyzedCount} 未分析（按 0 计）`
                                      : `${item.unanalyzedCount} unanalyzed (zero)`}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <OverviewProgress
                                  percent={item.percent}
                                  label={item.irId}
                                  zh={zh}
                                />
                              </td>
                              <td className="px-2 py-3 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="pointer-events-none size-8 rounded-lg opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                                      aria-label={
                                        zh
                                          ? `${item.irId} 的报告操作`
                                          : `Report actions for ${item.irId}`
                                      }
                                    >
                                      <MoreHorizontal aria-hidden="true" className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="max-w-80">
                                    <DropdownMenuItem onSelect={() => openReport(item.irId)}>
                                      {zh ? "查看 IR 报告" : "View IR report"}
                                    </DropdownMenuItem>
                                    {srs.length > 0 && <DropdownMenuSeparator />}
                                    {srs.map((sr) => (
                                      <DropdownMenuItem
                                        key={sr.id}
                                        onSelect={() => openReport(item.irId, sr.id)}
                                        aria-label={
                                          zh ? `查看 ${sr.id} 报告` : `View ${sr.id} report`
                                        }
                                      >
                                        <span className="min-w-0 whitespace-normal break-words">
                                          <span className="block">{sr.title}</span>
                                          <span className="block text-ui-sm text-foreground-subtle">
                                            {sr.id}
                                          </span>
                                        </span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })}
                        {!summary.requirements.length && (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-foreground-subtle">
                              {zh
                                ? "此范围暂无正式需求。提案不参与进度计算。"
                                : "No formal requirements in this scope. Proposals do not contribute to progress."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
