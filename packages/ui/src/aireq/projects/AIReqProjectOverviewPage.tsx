import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge.js";
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
import { srProgressStatus, type AIReqSelection } from "../contract.js";
import { OverviewProgress } from "./OverviewProgress.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";

export function AIReqProjectOverviewPage({ onManageProjects }: { onManageProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [onlyUnanalyzed, setOnlyUnanalyzed] = useState(false);
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
  // 仅筛选当前快照，不改写服务端顺序或另存一份需求事实。
  const visibleRequirements =
    summary?.requirements.filter((item) => !onlyUnanalyzed || item.unanalyzedCount > 0) ?? [];
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
          <div className="flex items-center gap-2">
            <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目概览" : "Project overview"}</h1>
            <ProjectPageHelp scope="project-overview" />
          </div>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant={onlyUnanalyzed ? "secondary" : "outline"}
                      size="sm"
                      aria-pressed={onlyUnanalyzed}
                      onClick={() => setOnlyUnanalyzed((current) => !current)}
                    >
                      {zh ? "仅未分析" : "Unanalyzed only"}
                    </Button>
                    <p role="status" className="text-ui-sm text-foreground-subtle">
                      {zh
                        ? `显示 ${visibleRequirements.length} / ${summary.requirements.length} 个正式 IR`
                        : `${visibleRequirements.length} of ${summary.requirements.length} formal IRs`}
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                    <table
                      className="w-full min-w-[760px] table-fixed text-left"
                      aria-label={zh ? "项目正式需求进度表" : "Project formal requirement progress"}
                    >
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[20%]" />
                        <col className="w-[16%]" />
                        <col />
                        <col className="w-24" />
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
                        {visibleRequirements.map((item) => {
                          const srs =
                            view?.srs.filter(
                              (sr) => sr.projectId === project.id && sr.irId === item.irId,
                            ) ?? [];
                          const itemRelease = releases.find((entry) => entry.id === item.releaseId);
                          // 聚合百分比不能证明验收；复用契约中按合入版本与人工验收派生的 SR 状态。
                          const acceptedCount = srs.filter(
                            (sr) => srProgressStatus(sr) === "已完成",
                          ).length;
                          const awaitingAcceptanceCount = srs.filter(
                            (sr) => srProgressStatus(sr) === "待验收",
                          ).length;
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
                                {/* SR 数原为静态文字且菜单悬停才出现；让数量直接打开原有报告菜单。 */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-ui-sm"
                                      aria-label={
                                        zh
                                          ? `查看 ${item.irId} 的 ${item.srCount} 个 SR 报告`
                                          : `View ${item.srCount} SR reports for ${item.irId}`
                                      }
                                    >
                                      {item.srCount} SR
                                      <ChevronDown aria-hidden="true" className="size-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="max-w-80">
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
                                {acceptedCount > 0 || awaitingAcceptanceCount > 0 ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {acceptedCount > 0 && (
                                      <Badge
                                        variant="secondary"
                                        className="h-auto max-w-full whitespace-normal bg-success-surface text-success-surface-foreground"
                                      >
                                        {zh
                                          ? `已验收 ${acceptedCount}/${srs.length} SR`
                                          : `Accepted ${acceptedCount}/${srs.length} SRs`}
                                      </Badge>
                                    )}
                                    {awaitingAcceptanceCount > 0 && (
                                      <Badge
                                        variant="secondary"
                                        className="h-auto max-w-full whitespace-normal bg-warning-surface text-warning-surface-foreground"
                                      >
                                        {zh
                                          ? `${awaitingAcceptanceCount} SR 待验收`
                                          : `Awaiting acceptance: ${awaitingAcceptanceCount}`}
                                      </Badge>
                                    )}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-2 py-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openReport(item.irId)}
                                  aria-label={
                                    zh ? `查看 ${item.irId} 报告` : `View ${item.irId} report`
                                  }
                                >
                                  {zh ? "IR 报告" : "IR report"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {!visibleRequirements.length && (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-foreground-subtle">
                              {onlyUnanalyzed ? (
                                <div className="flex flex-wrap items-center gap-3">
                                  <span>
                                    {zh
                                      ? "当前范围没有未分析的正式需求。"
                                      : "No unanalyzed formal requirements in this scope."}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOnlyUnanalyzed(false)}
                                  >
                                    {zh ? "显示全部" : "Show all"}
                                  </Button>
                                </div>
                              ) : zh ? (
                                "此范围暂无正式需求。提案不参与进度计算。"
                              ) : (
                                "No formal requirements in this scope. Proposals do not contribute to progress."
                              )}
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
