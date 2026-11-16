import { FolderGit2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Progress } from "@/components/ui/progress.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { useAIReq } from "../AIReqContext.js";
import { progressLabel, type AIReqSelection } from "../contract.js";

export function AIReqProjectProgressPage({ onManageProjects }: { onManageProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const view = ai.view;
  const project = view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const release = releases.find((item) => item.id === ai.releaseId);
  const projection = view?.projectProgress?.find((item) => item.projectId === project?.id);
  // 修复：全项目行只读 total；详情才消费唯一 Release，不能借用其他项目或旧范围的汇总。
  const summary = ai.selectionReady && projection
    ? ai.releaseId
      ? release && projection.releases.find((item) => item.releaseId === release.id)
      : projection.total
    : undefined;
  const unavailable = ai.pending
    ? zh ? "正在读取进度…" : "Loading progress…"
    : zh ? "进度数据不可用，请重试。" : "Progress data is unavailable. Retry the read.";
  const openReport = (irId: string, srId?: string) => {
    if (!project) return;
    const target: AIReqSelection = { projectId: project.id, irId, srId, formalView: "detail" };
    // select 已经过统一未保存门禁，并把正式详情记录为同页报告的历史选择。
    ai.select(target);
  };
  return (
    <main className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges]" data-testid="aireq-project-progress">
      <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} min-w-0 space-y-6`}>
        <header className="space-y-2">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "项目进度" : "Project progress"}</h1>
          <p className="text-ui-sm text-foreground-subtle">{zh ? "查看各项目进度，了解当前项目的需求状况。" : "Review progress across projects and explore the current project."}</p>
          <details className="text-ui-sm text-foreground-subtle">
            <summary className="w-fit cursor-pointer hover:text-foreground">{zh ? "进度如何计算" : "How progress is calculated"}</summary>
            <p className="mt-2">{zh ? "各项目总览包含全部 Release；当前项目详情与正式需求、提案及进度分析共用范围。进度按全部正式 SR 等权平均，提案不计入；未分析按 0 并标注，合入为 99%，人工验收通过才为 100%。" : "Project totals include all Releases. Details share their scope with formal requirements, proposals and progress analysis. Progress averages formal SRs, excluding proposals. Unanalyzed SRs count as zero; merge means 99%, and human test acceptance means 100%."}</p>
          </details>
          {ai.pending && view && <p role="status" className="text-ui-sm text-foreground-subtle">{zh ? "正在更新；已有数值为上次读取结果。" : "Updating; existing values are the last read snapshot."}</p>}
          {ai.error && view && <p className="text-ui-sm text-foreground-subtle">{zh ? "读取或操作失败，已有数值仅代表上次成功读取；请使用上方重试入口。" : "A read or operation failed. Existing values reflect the last successful read; use Retry above."}</p>}
        </header>
        <section className="space-y-3" aria-label={zh ? "全部项目总览" : "All project totals"}>
          <h2 className="text-ui-lg font-medium">{zh ? "全部项目" : "All projects"}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view?.projects.map((item) => {
              const total = view.projectProgress?.find((entry) => entry.projectId === item.id)?.total;
              const selected = project?.id === item.id;
              return <Card key={item.id} className={`gap-0 py-0 transition-colors hover:border-border-hover ${selected ? "border-foreground-subtle bg-card-selected" : ""}`}>
                <button type="button" className="flex h-full w-full cursor-pointer flex-col gap-3 rounded-xl border-2 border-transparent p-4 text-left hover:bg-surface-hover focus-visible:border-foreground" onClick={() => ai.navigate(() => ai.switchProject(item.id))} aria-pressed={selected}>
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-medium"><FolderGit2 className="size-4 shrink-0 text-foreground-subtle" /><span className="break-words">{item.name}</span></span>
                    {selected && <Badge variant="secondary" className="shrink-0">{zh ? "当前项目" : "Current"}</Badge>}
                  </span>
                  {total ? <>
                    <span className="w-full space-y-1"><span className="block text-ui-sm text-foreground">{zh ? "项目总进度 · 全部 Release" : "Total progress · All Releases"}</span><OverviewProgress percent={total.percent} label={item.name} zh={zh} /></span>
                    <span className="text-ui-sm text-foreground tabular-nums">{zh ? `提案 ${total.proposalCount} · 正式 IR ${total.formalCount}` : `${total.proposalCount} proposals · ${total.formalCount} formal IRs`}</span>
                  </> : <span className="text-ui-sm text-foreground-subtle">{unavailable}</span>}
                </button>
              </Card>;
            })}
          </div>
          {!view?.projects.length && <div className="rounded-xl border border-border bg-surface px-4 py-6 text-foreground-subtle">
            {view ? zh ? "尚无项目。" : "No projects yet." : unavailable}
            {view && <Button variant="outline" className="ml-3" onClick={onManageProjects}>{zh ? "项目设置" : "Project settings"}</Button>}
          </div>}
          {view?.projects.length && !view.projectProgress && !ai.pending ? <Button variant="outline" onClick={() => void ai.refresh()}>{zh ? "重新读取进度" : "Reload progress"}</Button> : null}
        </section>
        <section className="space-y-4" aria-label={zh ? "当前项目详情" : "Current project details"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-ui-lg font-medium">{project ? zh ? `${project.name} · 正式需求进度` : `${project.name} · Formal requirement progress` : zh ? "当前项目详情" : "Current project details"}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={ai.releaseId || "all"} onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id === "all" ? "" : id))} disabled={!project || !releases.length}>
                <SelectTrigger className="h-9 w-44 rounded-lg bg-surface" aria-label={zh ? "项目进度 Release" : "Progress Release"}><SelectValue placeholder={zh ? "选择 Release" : "Select Release"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{zh ? "全部 Release" : "All Releases"}</SelectItem>
                  {releases.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!project ? <div className="flex flex-wrap items-center gap-3 text-foreground-subtle">
            <p>{zh ? "请选择项目，或在设置中添加名称、远程仓库和默认分支。" : "Choose a project, or add a name, remote repository and default branch in settings."}</p>
            <Button variant="outline" onClick={onManageProjects}>{zh ? "项目设置" : "Project settings"}</Button>
          </div> : <>
            {!releases.length && <div className="flex flex-wrap items-center gap-3 text-foreground-subtle">
              <p>{zh ? "当前项目尚无 Release，请在设置中添加。" : "This project has no Releases. Add one in settings."}</p>
              <Button variant="outline" onClick={onManageProjects}>{zh ? "管理 Release" : "Manage Releases"}</Button>
            </div>}
            {!summary ? <div role="status" className="space-y-3 text-foreground-subtle">
              <p>{unavailable}</p>
              {!ai.pending && <Button variant="outline" onClick={() => void ai.refresh()}>{zh ? "重试" : "Retry"}</Button>}
            </div> : <>
              <div className="grid gap-4 rounded-xl border border-card-border bg-card p-4 md:grid-cols-5">
                <div className="space-y-2 md:col-span-2">
                  <div className="text-ui-sm text-foreground">{zh ? "范围进度" : "Scope progress"} · {release?.title ?? (zh ? "全部 Release" : "All Releases")}</div>
                  <OverviewProgress percent={summary.percent} label={project.name} zh={zh} prominent />
                </div>
                <div><div className="text-ui-sm text-foreground">{zh ? "正式 IR" : "Formal IRs"}</div><div className="mt-1 text-ui-xl font-medium tabular-nums">{summary.formalCount}</div><div className="text-ui-sm text-foreground-subtle">{zh ? `提案 ${summary.proposalCount}` : `${summary.proposalCount} proposals`}</div></div>
                <div><div className="text-ui-sm text-foreground">SR</div><div className="mt-1 text-ui-xl font-medium tabular-nums">{summary.srCount}</div></div>
                <div><div className="text-ui-sm text-foreground">{zh ? "未分析" : "Unanalyzed"}</div><div className="mt-1 text-ui-xl font-medium tabular-nums">{summary.unanalyzedCount}</div><div className="text-ui-sm text-foreground-subtle">{zh ? "按 0 计" : "Counted as zero"}</div></div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full min-w-[680px] table-fixed text-left" aria-label={zh ? "项目正式需求进度表" : "Project formal requirement progress"}>
                  <colgroup>
                    <col className="w-[32%]" />
                    <col className="w-[20%]" />
                    <col className="w-[16%]" />
                    <col />
                    <col className="w-14" />
                  </colgroup>
                  <thead className="text-ui-sm text-foreground-subtle"><tr>{(zh ? ["正式需求原文／编号", "Release", "SR 数／未分析", "IR 进度", "操作"] : ["Original request / IR", "Release", "SRs / Unanalyzed", "IR progress", "Actions"]).map((label, index) => <th key={label} className={`border-b border-border py-3 font-medium ${index === 4 ? "px-2 text-right" : "px-4"}`}>{label}</th>)}</tr></thead>
                  <tbody>
                    {summary.requirements.map((item) => {
                      const srs = view?.srs.filter((sr) => sr.projectId === project.id && sr.irId === item.irId) ?? [];
                      const itemRelease = releases.find((entry) => entry.id === item.releaseId);
                      // 修复：悬停底色叠加后辅助色对比不足，编号与未分析提示改用现有前景色。
                      return <tr key={item.irId} className="group/row border-b border-border/50 last:border-0 hover:bg-surface-hover">
                        <td className="px-4 py-3">
                          <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal break-words px-0 text-left" onClick={() => openReport(item.irId)}>{item.originalText}</Button>
                          <span className="block text-ui-sm text-foreground-subtle group-hover/row:text-foreground">{item.irId}</span>
                        </td>
                        <td className="px-4 py-3 text-ui-sm">{itemRelease?.title ?? item.releaseId}</td>
                        <td className="px-4 py-3 text-ui-sm">
                          <span>{item.srCount} SR</span>
                          {item.unanalyzedCount > 0 && <span className="block text-foreground-subtle group-hover/row:text-foreground">{zh ? `${item.unanalyzedCount} 未分析（按 0 计）` : `${item.unanalyzedCount} unanalyzed (zero)`}</span>}
                        </td>
                        <td className="px-4 py-3"><OverviewProgress percent={item.percent} label={item.irId} zh={zh} /></td>
                        <td className="px-2 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="pointer-events-none size-8 rounded-lg opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                                aria-label={zh ? `${item.irId} 的报告操作` : `Report actions for ${item.irId}`}
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
                                <DropdownMenuItem key={sr.id} onSelect={() => openReport(item.irId, sr.id)} aria-label={zh ? `查看 ${sr.id} 报告` : `View ${sr.id} report`}>
                                  <span className="min-w-0 whitespace-normal break-words">
                                    <span className="block">{sr.title}</span>
                                    <span className="block text-ui-sm text-foreground-subtle">{sr.id}</span>
                                  </span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>;
                    })}
                    {!summary.requirements.length && <tr><td colSpan={5} className="px-4 py-6 text-foreground-subtle">{zh ? "此范围暂无正式需求。提案不参与进度计算。" : "No formal requirements in this scope. Proposals do not contribute to progress."}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>}
          </>}
        </section>
      </div>
    </main>
  );
}

function OverviewProgress({ percent, label, zh, prominent = false }: { percent: number | null; label: string; zh: boolean; prominent?: boolean }) {
  if (percent === null) return <span className="text-ui-sm text-foreground-subtle">{zh ? "暂无正式需求" : "No formal requirements"}</span>;
  if (prominent) return <div className="space-y-2">
    <span className="text-ui-xl font-medium tabular-nums">{progressLabel(percent)}</span>
    <Progress value={percent} aria-label={zh ? `${label}进度` : `${label} progress`} aria-valuetext={progressLabel(percent)} className="h-1.5 bg-border" indicatorClassName="bg-brand" />
  </div>;
  return <div className="flex min-w-28 items-center gap-2">
    <Progress value={percent} aria-label={zh ? `${label}进度` : `${label} progress`} aria-valuetext={progressLabel(percent)} className="h-1.5 min-w-12 flex-1 bg-border" indicatorClassName="bg-brand" />
    <span className="shrink-0 font-mono text-ui-sm tabular-nums">{progressLabel(percent)}</span>
  </div>;
}
