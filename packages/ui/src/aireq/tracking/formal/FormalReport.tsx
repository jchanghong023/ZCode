import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  irProgress,
  irProgressStatus,
  irSrs,
  srProgress,
  srProgressStatus,
} from "../../contract.js";
import { useAIReq } from "../../AIReqContext.js";
import { AIReqPlanningSummary } from "../RequirementPlanning.js";
import { ProgressStatusBadge, ProgressValue } from "./ProgressDisplay.js";
import { BranchCopy } from "../BranchCopy.js";
import { AIReqBranchCleanup, AIReqFormalSimulationControls, AIReqFormalTestControls } from "./FormalOperations.js";

// 报告继续读取同一上下文投影；确认表单只持有未保存输入，不复制正式需求状态。
function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="text-ui-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

export function AIReqFormalReport() {
  const aireq = useAIReq()!;
  const [copyMessage, setCopyMessage] = useState("");
  const view = aireq.view;
  const group = view?.groups.find(
    (item) =>
      item.projectId === aireq.selection.projectId &&
      item.id === aireq.selection.irId &&
      (!aireq.releaseId || item.releaseId === aireq.releaseId),
  );
  if (!view || !group)
    return (
      <p role="status" className="p-6">
        所选正式需求不可用，请在表格重新选择。
      </p>
    );
  const all = irSrs(view, group);
  const selected = aireq.selection.srId
    ? all.find((sr) => sr.id === aireq.selection.srId)
    : undefined;
  if (aireq.selection.srId && !selected)
    return (
      <p role="alert" className="p-6">
        所选 SR 不属于当前 IR。
      </p>
    );
  const rows = selected ? [selected] : all;
  const title = selected?.title ?? group.title;
  const percent = selected ? srProgress(selected) : irProgress(all);
  const status = selected ? srProgressStatus(selected) : irProgressStatus(all);
  const project = view.projects.find((item) => item.id === group.projectId);
  const analysedAt = rows
    .map((sr) => sr.progress?.analysedAt ?? "")
    .sort()
    .at(-1);
  const issues = rows.flatMap((sr) =>
    (sr.progress?.issues ?? []).map((issue) => ({ ...issue, sr })),
  );
  const evidence = (kind: "implemented" | "remaining") =>
    rows.flatMap((sr) =>
      (sr.progress?.[kind] ?? []).map((text) => (
        <li key={`${sr.id}:${text}`} className="leading-6">
          {!selected && <span className="font-medium">{sr.title}： </span>}
          {text}
        </li>
      )),
    );
  const manual = selected?.testAcceptance?.outcome === "passed" ? selected.testAcceptance : undefined;
  const hasAnalysis = rows.some((sr) => sr.progress);
  const progressSource = manual
    ? "人工确认"
    : selected
      ? selected.codeMerge ? "代码合入事实" : hasAnalysis ? "AI 模拟分析" : "尚未分析"
      : undefined;
  return (
    <main className="h-full min-h-0 overflow-auto bg-background" data-testid="aireq-formal-report">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 md:px-6 md:py-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selected ? "SR" : "IR"}</Badge>
            <span className="font-mono text-ui-xs text-foreground-subtle">
              {selected?.id ?? group.id}
            </span>
            <ProgressStatusBadge status={status} />
            <Badge variant="outline">{hasAnalysis ? "进度分析报告" : "尚未分析"}</Badge>
          </div>
          <h1 className="text-ui-lg font-semibold">{title}</h1>
          <ProgressValue
            value={percent}
            label={title}
            status={status}
            source={progressSource}
            showStatus={false}
          />
          <p className="text-ui-sm text-foreground-subtle">
            {selected
              ? manual
                ? "完成状态来自人工确认；下方保留此前 AI 分析及代码证据。"
                : selected.codeMerge ? "代码已合入，有效进度固定 99%；原始 AI 评分仅作证据。"
                  : hasAnalysis ? "模拟进度分析根据需求、验收标准与代码证据估计，不执行开发任务。"
                    : "尚未分析；0% 为新需求的初始进度，不代表已有代码分析结论。"
              : `${all.length} 个 SR 的进度算术平均值；全部 SR 完成后 IR 才完成。`}
          </p>
          {manual && (
            <p className="break-words text-ui-sm" data-testid="manual-progress-source">
              {progressSource}：{manual.employeeId} · {manual.reason} ·{" "}
              {new Date(manual.at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                hour12: false,
              })}
            </p>
          )}
        </header>
        {rows.map((sr) => sr.lastAnalysisFailure && (
          <p key={sr.id} role="alert" className="text-ui-sm text-destructive">
            {sr.title}：最近分析失败，保留上次成功进度与报告 · {sr.lastAnalysisFailure.message}
          </p>
        ))}
        {selected && (
          <>
            <AIReqFormalTestControls key={`test:${selected.id}`} group={group} sr={selected} />
            <AIReqFormalSimulationControls key={`simulation:${selected.id}`} group={group} sr={selected} />
            {selected.progress && <p className="text-ui-sm text-foreground-subtle">
              原始 AI 模拟评分：{selected.progress.aiPercent ?? Math.min(99, selected.progress.percent)}% · 有效业务进度：{percent}%
              {selected.progress.stale ? " · 报告已过期，等待当前版本分析" : ""}
            </p>}
          </>
        )}
        {!selected && <>
          <AIReqBranchCleanup key={group.id} group={group} rows={all} />
          <Button type="button" variant="link" className="h-auto p-0 text-ui-sm whitespace-normal" onClick={() => aireq.startProposalDraft(group.id)}>
            新增关联 IR（新业务范围，不修改当前正式需求）
          </Button>
        </>}
        <ReportSection title={manual ? "此前 AI 报告的问题与不确定项" : "值得关注的问题与不确定项"}>
          {issues.length ? (
            <ul className="space-y-4">
              {issues.map((issue, index) => (
                <li key={`${issue.sr.id}:${index}`} className="space-y-1">
                  <p className="text-ui-sm font-medium">
                    {issue.title}
                    {!selected && ` · ${issue.sr.title}`}
                  </p>
                  <p className="text-ui-sm leading-6 text-foreground-subtle">{issue.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">
              {hasAnalysis ? "当前报告未发现需关注的遗留问题。" : "尚未分析，暂无问题判断。"}
            </p>
          )}
        </ReportSection>
        <ReportSection title="已实现内容">
          {rows.some((sr) => sr.progress?.implemented.length) ? (
            <ul className="list-disc space-y-2 pl-5 text-ui-sm">{evidence("implemented")}</ul>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">尚无已实现内容的代码证据。</p>
          )}
        </ReportSection>
        <ReportSection title="尚未实现或待补充证据">
          {rows.some((sr) => sr.progress?.remaining.length) ? (
            <ul className="list-disc space-y-2 pl-5 text-ui-sm">{evidence("remaining")}</ul>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">
              {hasAnalysis
                ? "当前报告没有列出未实现项；仍须核对合入事实及完成条件。"
                : "尚未分析，暂无实现情况与代码版本结论。"}
            </p>
          )}
        </ReportSection>
        <ReportSection title="人员与计划时间">
          <AIReqPlanningSummary group={group} rows={rows} editable />
        </ReportSection>
        <ReportSection title={manual ? "此前 AI 报告的代码活动与合入依据" : "代码活动与合入依据"}>
          <ul className="space-y-5">
            {rows.map((sr) => (
              <li key={sr.id} className="space-y-2 text-ui-sm">
                <p className="font-medium">{sr.title}</p>
                {sr.trackingBranch?.name?.trim() ? (
                  <div className="space-y-1" data-testid="sr-tracking-branch">
                    <p className="break-all text-ui-sm text-foreground-subtle">
                      平台模拟开发分支：
                    </p>
                    {/* 复制控件已显示分支名；不可复制时仍保留历史名称。 */}
                    {sr.trackingBranch.status !== "deleted" && (sr.trackingBranch.status !== "failed" || Boolean(sr.trackingBranch.pushedAt)) ? (
                      <BranchCopy branch={sr.trackingBranch.name} onMessage={setCopyMessage} />
                    ) : (
                      <p className="break-all text-ui-sm text-foreground-subtle">{sr.trackingBranch.name}</p>
                    )}
                    {sr.trackingBranch.status === "deleted" && <p>已清理（模拟）；分支名仅为历史登记。</p>}
                    {sr.trackingBranch.error && <p role="alert" className="text-destructive">{sr.trackingBranch.error}</p>}
                    {sr.trackingBranch.status === "failed" && !sr.trackingBranch.pushedAt && <Button
                      size="sm" variant="outline" disabled={aireq.pending}
                      onClick={() => void aireq.command({ type: "retrySrBranch", projectId: group.projectId, irId: group.id, srId: sr.id })}
                    >重试创建开发分支（模拟）</Button>}
                    <p className="break-all text-ui-sm text-foreground-subtle">
                      基点：{sr.trackingBranch.baseCommit}
                    </p>
                  </div>
                ) : (
                  <p role="alert" className="text-ui-sm text-destructive">
                    开发分支缺失：正式 SR 必须已有平台分配的开发分支，当前映射缺失属于数据异常。
                  </p>
                )}
                {sr.codeMerge && <p className="break-all text-ui-sm">已核实代码合入（模拟）：{sr.codeMerge.commit} → {sr.codeMerge.branch}</p>}
                <p className="text-ui-sm text-foreground-subtle">
                  最近分析：
                  {sr.progress?.analysedAt
                    ? new Date(sr.progress.analysedAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        hour12: false,
                      })
                    : "尚未分析"}
                </p>
                {sr.progress ? (
                  <>
                    <p className="break-all font-mono text-ui-sm text-foreground-subtle">
                      {sr.progress.branch} → {project?.defaultBranch} ·{" "}
                      {sr.codeMerge ? "已合入（模拟）" : "尚未确认合入，最高 99%"}
                    </p>
                    <p className="break-all text-ui-sm text-foreground-subtle">
                      分析版本：{sr.progress.codeVersion} · 默认分支版本：
                      {sr.progress.defaultVersion} ·{" "}
                      {sr.progress.certain ? "实现判断确定" : "判断仍有不确定项"}
                    </p>
                    {sr.progress.activity.length ? (
                      sr.progress.activity.map((activity) => (
                        <p key={activity.commit} className="break-all text-ui-sm">
                          {activity.message}
                          <span className="ml-2 font-mono text-ui-xs text-foreground-subtle">
                            {activity.commit}
                          </span>
                        </p>
                      ))
                    ) : (
                      <p className="text-foreground-subtle">尚无独立开发提交。</p>
                    )}
                  </>
                ) : (
                  <p className="text-foreground-subtle">
                    尚未分析，暂无代码活动、分析版本或合入判断。
                  </p>
                )}
              </li>
            ))}
          </ul>
        </ReportSection>
        <p
          role="status"
          aria-live="polite"
          className="break-words text-ui-sm text-foreground-subtle"
        >
          {copyMessage}
        </p>
        <div className="space-y-1 text-ui-sm text-foreground-subtle">
          <p>
            最近分析 ·{" "}
            {analysedAt
              ? new Date(analysedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  hour12: false,
                })
              : "尚未分析"}
          </p>
          <p className="break-all">
            仓库：{project?.repositoryUrl ?? "尚未配置"} · 默认分支：{project?.defaultBranch}
          </p>
          <p>未合入由 AI 估计 0%～99%；合入固定 99%，仅人工测试通过可到 100%。全部结果为服务端内存模拟。</p>
        </div>
      </div>
    </main>
  );
}
