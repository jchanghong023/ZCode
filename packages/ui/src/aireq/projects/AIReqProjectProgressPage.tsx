import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
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
          <p className="text-ui-sm text-foreground-subtle">
            {zh ? "各项目总览始终包含全部 Release；当前项目详情与正式需求、提案及进度分析共用范围。" : "Project totals always include every Release. Details share the current project and Release with formal requirements, proposals and progress analysis."}
          </p>
          <p className="text-ui-sm text-foreground-subtle">
            {zh ? "进度按全部正式 SR 等权平均，提案不计入；未分析按 0 并标注，合入为 99%，人工验收通过才为 100%。" : "Progress averages all formal SRs directly, excluding proposals. Unanalyzed SRs count as zero and are marked; merge means 99%, and human test acceptance means 100%."}
          </p>
          {ai.pending && view && <p role="status" className="text-ui-sm text-foreground-subtle">{zh ? "正在更新；已有数值为上次读取结果。" : "Updating; existing values are the last read snapshot."}</p>}
          {ai.error && view && <p className="text-ui-sm text-foreground-subtle">{zh ? "读取或操作失败，已有数值仅代表上次成功读取；请使用上方重试入口。" : "A read or operation failed. Existing values reflect the last successful read; use Retry above."}</p>}
        </header>
        <section className="space-y-3" aria-label={zh ? "全部项目总览" : "All project totals"}>
          <h2 className="text-ui-lg font-medium">{zh ? "全部项目" : "All projects"}</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[540px] text-left">
              <thead className="text-ui-sm text-foreground-subtle">
                <tr>{(zh ? ["项目", "提案数", "正式 IR 数", "项目总进度"] : ["Project", "Proposals", "Formal IRs", "Total progress"]).map((label) => <th key={label} className="border-b border-border px-4 py-3 font-medium">{label}</th>)}</tr>
              </thead>
              <tbody>
                {view?.projects.map((item) => {
                  const total = view.projectProgress?.find((entry) => entry.projectId === item.id)?.total;
                  return <tr key={item.id} className={`border-b border-border/50 last:border-0 hover:bg-surface-hover ${project?.id === item.id ? "bg-selected" : ""}`}>
                    <td className="px-4 py-3">
                      <Button variant="ghost" className="h-auto max-w-full justify-start gap-2 whitespace-normal text-left" onClick={() => ai.navigate(() => ai.switchProject(item.id))} aria-pressed={project?.id === item.id}>
                        <FolderGit2 className="size-4 shrink-0 text-foreground-subtle" />
                        <span className="break-words">{item.name}</span>
                      </Button>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{total ? total.proposalCount : <span className="text-ui-sm text-foreground-subtle">{unavailable}</span>}</td>
                    <td className="px-4 py-3 tabular-nums">{total ? total.formalCount : "—"}</td>
                    <td className="px-4 py-3">{total ? <OverviewProgress percent={total.percent} label={item.name} zh={zh} /> : "—"}</td>
                  </tr>;
                })}
                {!view?.projects.length && <tr><td colSpan={4} className="px-4 py-6 text-foreground-subtle">
                  {view ? zh ? "尚无项目。" : "No projects yet." : unavailable}
                  {view && <Button variant="outline" className="ml-3" onClick={onManageProjects}>{zh ? "项目设置" : "Project settings"}</Button>}
                </td></tr>}
              </tbody>
            </table>
          </div>
          {view?.projects.length && !view.projectProgress && !ai.pending ? <Button variant="outline" onClick={() => void ai.refresh()}>{zh ? "重新读取进度" : "Reload progress"}</Button> : null}
        </section>
        <section className="space-y-4" aria-label={zh ? "当前项目详情" : "Current project details"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-ui-lg font-medium">{project ? zh ? `${project.name} · 正式需求进度` : `${project.name} · Formal requirement progress` : zh ? "当前项目详情" : "Current project details"}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={project?.id ?? ""} onValueChange={(id) => ai.navigate(() => ai.switchProject(id))} disabled={!view?.projects.length}>
                <SelectTrigger className="h-9 w-40 rounded-lg bg-surface" aria-label={zh ? "项目进度项目" : "Progress project"}><SelectValue placeholder={zh ? "选择项目" : "Select project"} /></SelectTrigger>
                <SelectContent>{view?.projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
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
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-ui-sm">
                <span>{release?.title ?? (zh ? "全部 Release" : "All Releases")}</span>
                <span>{zh ? `提案 ${summary.proposalCount} · 正式 IR ${summary.formalCount} · SR ${summary.srCount}` : `${summary.proposalCount} proposals · ${summary.formalCount} formal IRs · ${summary.srCount} SRs`}</span>
                <span className="text-foreground-subtle">{zh ? `未分析 ${summary.unanalyzedCount}（按 0 计）` : `${summary.unanalyzedCount} unanalyzed (counted as zero)`}</span>
                <OverviewProgress percent={summary.percent} label={project.name} zh={zh} />
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="text-ui-sm text-foreground-subtle"><tr>{(zh ? ["正式需求原文／编号", "Release", "SR 数／未分析", "IR 进度", "同页报告"] : ["Original request / IR", "Release", "SRs / Unanalyzed", "IR progress", "Same-page report"]).map((label) => <th key={label} className="border-b border-border px-4 py-3 font-medium">{label}</th>)}</tr></thead>
                  <tbody>
                    {summary.requirements.map((item) => {
                      const srs = view?.srs.filter((sr) => sr.projectId === project.id && sr.irId === item.irId) ?? [];
                      const itemRelease = releases.find((entry) => entry.id === item.releaseId);
                      return <tr key={item.irId} className="border-b border-border/50 last:border-0 hover:bg-surface-hover">
                        <td className="max-w-80 px-4 py-3">
                          <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal break-words px-0 text-left" onClick={() => openReport(item.irId)}>{item.originalText}</Button>
                          <span className="block text-ui-sm text-foreground-subtle">{item.irId}</span>
                        </td>
                        <td className="px-4 py-3 text-ui-sm">{itemRelease?.title ?? item.releaseId}</td>
                        <td className="px-4 py-3 text-ui-sm">
                          <span>{item.srCount} SR</span>
                          {item.unanalyzedCount > 0 && <span className="block text-foreground-subtle">{zh ? `${item.unanalyzedCount} 未分析（按 0 计）` : `${item.unanalyzedCount} unanalyzed (zero)`}</span>}
                        </td>
                        <td className="px-4 py-3"><OverviewProgress percent={item.percent} label={item.irId} zh={zh} /></td>
                        <td className="px-4 py-3"><div className="flex max-w-56 flex-wrap gap-1">
                          <Button variant="outline" size="sm" onClick={() => openReport(item.irId)} aria-label={zh ? `查看 ${item.irId} 报告` : `View ${item.irId} report`}>IR</Button>
                          {srs.map((sr) => <Button key={sr.id} variant="ghost" size="sm" title={sr.title} onClick={() => openReport(item.irId, sr.id)} aria-label={zh ? `查看 ${sr.id} 报告` : `View ${sr.id} report`}>{sr.id}</Button>)}
                        </div></td>
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

function OverviewProgress({ percent, label, zh }: { percent: number | null; label: string; zh: boolean }) {
  if (percent === null) return <span className="text-ui-sm text-foreground-subtle">{zh ? "暂无正式需求" : "No formal requirements"}</span>;
  return <div className="flex min-w-28 items-center gap-2">
    <Progress value={percent} aria-label={zh ? `${label}进度` : `${label} progress`} aria-valuetext={progressLabel(percent)} className="h-1 min-w-12 flex-1" />
    <span className="shrink-0 font-mono text-ui-sm tabular-nums">{progressLabel(percent)}</span>
  </div>;
}
