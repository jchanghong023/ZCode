import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Label } from "@/components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import {
  irProgress,
  irProgressStatus,
  irSrs,
  srCompletionBlocker,
  srProgress,
  srProgressStatus,
  type AIReqRequirementGroup,
  type AIReqSystemRequirement,
} from "../../contract.js";
import { useAIReq } from "../../AIReqContext.js";
import { useAIReqDataSource } from "../../data-source.js";
import { getEmployeeId } from "../../identity.js";
import { AssignOwner, AIReqPlanningSummary } from "../RequirementPlanning.js";
import { ProgressStatusBadge, ProgressValue } from "./ProgressDisplay.js";

// 报告继续读取同一上下文投影；确认表单只持有未保存输入，不复制正式需求状态。
function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="text-ui-base font-medium">{title}</h2>
      {children}
    </section>
  );
}
function ConfirmProgress({
  group,
  sr,
}: {
  group: AIReqRequirementGroup;
  sr: AIReqSystemRequirement;
}) {
  const source = useAIReqDataSource();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit =
    Boolean(source.progress) &&
    (getEmployeeId() === "j00808874" || getEmployeeId() === group.ownerEmployeeId);
  const blocker = !canEdit
    ? "仅正式管理员或当前 IR 负责人可人工确认完成。"
    : srCompletionBlocker(sr);
  return (
    <>
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(blocker)}
          aria-describedby={blocker ? `${id}-completion-reason` : undefined}
          onClick={() => {
            setReason("");
            setError("");
            setOpen(true);
          }}
        >
          人工确认完成
        </Button>
        {blocker && (
          <p id={`${id}-completion-reason`} className="text-ui-sm leading-5 text-foreground-subtle">
            {blocker}
          </p>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认完成</DialogTitle>
            <DialogDescription>
              {sr.title} · 仅将 AI 已分析到 99% 且已合入的进度确认为 100%。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving || blocker || !reason.trim()) return;
              setSaving(true);
              setError("");
              try {
                await source.progress!.updateSr(group.projectId, group.id, sr.id, 100, reason);
                setOpen(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`${id}-reason`}>完成确认依据</Label>
              <SettingsFormTextarea
                id={`${id}-reason`}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="说明完成标准已满足的依据"
              />
            </div>
            {error && (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button disabled={saving || Boolean(blocker) || !reason.trim()} type="submit">
                {saving ? "确认中…" : "确认到 100%"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AIReqFormalReport() {
  const aireq = useAIReq()!;
  const view = aireq.view;
  const group = view?.groups.find(
    (item) =>
      item.projectId === aireq.selection.projectId &&
      item.id === aireq.selection.irId &&
      item.releaseId === aireq.releaseId,
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
  const manual = selected?.progress?.manual;
  const hasAnalysis = rows.some((sr) => sr.progress);
  const progressSource = manual
    ? "人工确认"
    : selected
      ? hasAnalysis
        ? "AI 分析"
        : "尚未分析"
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
          <div className="flex flex-wrap items-center gap-2 text-ui-sm">
            <span className="text-foreground-subtle">需求负责人</span>
            <AssignOwner group={group} />
          </div>
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
                : hasAnalysis
                  ? "进度分析 Agent 根据需求、验收标准与代码证据判断。"
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
        {selected && <ConfirmProgress key={selected.id} group={group} sr={selected} />}
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
                {sr.trackingBranch && (
                  <p
                    className="break-all text-ui-xs text-foreground-subtle"
                    data-testid="sr-tracking-branch"
                  >
                    平台模拟开发分支：{sr.trackingBranch.name} · 基点：
                    {sr.trackingBranch.baseCommit}
                  </p>
                )}
                {sr.progress ? (
                  <>
                    <p className="break-all font-mono text-ui-xs text-foreground-subtle">
                      {sr.progress.branch} → {project?.defaultBranch} ·{" "}
                      {sr.progress.merged ? "已合入" : "尚未确认合入，最高 99%"}
                    </p>
                    <p className="break-all text-ui-xs text-foreground-subtle">
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
          <p>0%～99% 由 AI 分析，人工只能在 99% 且已合入后确认到 100%。</p>
        </div>
      </div>
    </main>
  );
}
