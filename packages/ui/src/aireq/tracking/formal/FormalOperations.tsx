import { formatUserFacingError } from "@/lib/errorMessage.js";
// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { AnalysisRunConfirmation } from "../AnalysisRunConfirmation.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../../AIReqContext.js";
import { useAIReqWorkspaceActive } from "../../shell/ModelSettingsNavigationContext.js";
import { useAIReqDataSource } from "../../data-source.js";
import { srCompletionBlocker, srProgress } from "../../contract.js";
import type {
  AIReqBranchCleanupItem,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
  AIReqTestAcceptanceInput,
} from "../../contract.js";

export function AIReqFormalTestControls({
  group,
  sr,
}: {
  group: AIReqRequirementGroup;
  sr: AIReqSystemRequirement;
}) {
  const source = useAIReqDataSource();
  const active = useAIReqWorkspaceActive();
  const aireq = useAIReq()!;
  const id = useId();
  const [request, setRequest] = useState<AIReqTestAcceptanceInput>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const blocker = !source.progress ? "测试验收服务暂不可用。" : srCompletionBlocker(sr);
  const open = (outcome: "passed" | "failed") => {
    if (!aireq.view) return;
    setReason("");
    setError("");
    setRequest({
      operationId: createUuid(),
      expectedRevision: aireq.view.revision,
      expectedCodeVersion: sr.codeMerge?.commit ?? "",
      outcome,
      reason: "",
    });
    setDialogOpen(true);
  };
  const versionChanged =
    request &&
    (request.expectedRevision !== aireq.view?.revision ||
      request.expectedCodeVersion !== sr.codeMerge?.commit);
  return (
    <section className="space-y-3" aria-label="人工测试验收">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(blocker)}
          onClick={() => open("passed")}
        >
          测试验收通过
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(blocker)}
          onClick={() => open("failed")}
        >
          测试不通过
        </Button>
      </div>
      {blocker && <p className="text-ui-sm text-foreground-subtle">{blocker}</p>}
      {sr.developmentIssues?.map((issue) => (
        <div key={issue.id} className="rounded-md border border-border p-3 text-ui-sm">
          <p className="font-medium">
            {issue.status === "open"
              ? "待开发修复"
              : issue.status === "awaiting-retest"
                ? "已处理，待人工复测"
                : "复测通过，已解决"}
            ：{issue.detail}
          </p>
          <p className="break-all text-foreground-subtle">
            失败版本 {issue.failedCodeVersion} · {issue.reportedBy} ·{" "}
            {/* 原始 ISO 曾与同页报告时区不一致；只格式化展示，机器可读值仍保留原回执。 */}
            <time dateTime={issue.reportedAt}>
              {new Date(issue.reportedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                hour12: false,
              })}
            </time>
          </p>
          {issue.fixCodeVersion && (
            <p className="break-all text-foreground-subtle">修复版本 {issue.fixCodeVersion}</p>
          )}
        </div>
      ))}
      {sr.acceptanceHistory?.length ? (
        <details className="text-ui-sm">
          <summary className="cursor-pointer">测试验收历史（实际操作者与代码版本）</summary>
          <ul className="space-y-2 pt-2">
            {sr.acceptanceHistory.map((item) => (
              <li key={item.operationId} className="break-words">
                {item.outcome === "passed" ? "通过" : "不通过"} · {item.employeeId} ·{" "}
                <time dateTime={item.at}>
                  {new Date(item.at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour12: false,
                  })}
                </time>
                <br />
                {item.reason}
                <br />
                <span className="break-all">{item.codeVersion}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {/* 关闭动画仍会渲染内容，保留本次请求避免标题和版本在退场时闪变。 */}
      <Dialog
        open={active && dialogOpen}
        onOpenChange={(value) => {
          if (active && !value && !submitting.current) setDialogOpen(false);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            if (!active) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {request?.outcome === "failed" ? "记录测试不通过" : "记录测试验收通过"}
            </DialogTitle>
            <DialogDescription>
              {sr.title} · 仅人工测试通过才达到 100%；不通过保持 99%，交开发修复。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (submitting.current || !request || !reason.trim() || versionChanged || blocker)
                return;
              // React 忙碌态提交后才渲染；同步锁防止同一验收被连续按键重复提交。
              submitting.current = true;
              setSaving(true);
              setError("");
              try {
                await source.progress!.recordTest(group.projectId, group.id, sr.id, {
                  ...request,
                  reason,
                });
                setDialogOpen(false);
              } catch (cause) {
                setError(formatUserFacingError(cause, "测试验收记录失败，输入已保留，请重试。"));
              } finally {
                submitting.current = false;
                setSaving(false);
              }
            }}
          >
            <p className="break-all text-ui-sm">
              本次已合入代码版本：{request?.expectedCodeVersion}
            </p>
            <Label htmlFor={`${id}-basis`}>
              {request?.outcome === "failed" ? "测试依据与具体问题" : "测试通过依据"}
            </Label>
            <SettingsFormTextarea
              id={`${id}-basis`}
              required
              disabled={saving}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="记录平台外实际测试结果及依据；不会运行测试"
            />
            {dialogOpen && !saving && (versionChanged || error) && (
              <p role="alert" className="text-ui-sm text-destructive">
                {versionChanged
                  ? "业务或代码版本已变化；请关闭后基于新版本重新记录，当前输入已保留。"
                  : error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={saving || Boolean(blocker) || Boolean(versionChanged) || !reason.trim()}
              >
                {saving
                  ? "记录中…"
                  : request?.outcome === "failed"
                    ? "记录不通过并交开发"
                    : "记录测试通过到 100%"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** 手动分析是正常业务意图；不提供伪造合入事实、故障注入或调度时钟。 */
export function AIReqFormalAnalysisAction({
  group,
  sr,
}: {
  group: AIReqRequirementGroup;
  sr: AIReqSystemRequirement;
}) {
  const source = useAIReqDataSource();
  const active = useAIReqWorkspaceActive();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const scheduler = source.progressScheduler;
  if (!scheduler) return null;
  const analyse = async () => {
    if (submitting.current || srProgress(sr) === 100) return;
    submitting.current = true;
    setPending(true);
    setMessage("");
    try {
      await scheduler.runNow({ projectId: group.projectId, irId: group.id, srId: sr.id });
      setConfirm(false);
      setMessage("分析请求已提交，可在分析运行中查看处理进度。");
    } catch (cause) {
      setMessage(formatUserFacingError(cause, "分析请求未提交，请稍后重试。"));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <section className="space-y-2 border-t border-border pt-5" aria-label="需求分析操作">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || srProgress(sr) === 100}
        onClick={() => {
          setMessage("");
          setConfirm(true);
        }}
      >
        分析此 SR
      </Button>
      <AnalysisRunConfirmation
        open={active && confirm}
        onOpenChange={(open) => {
          if (active && !pending) setConfirm(open);
        }}
        scope={`${group.title} · ${sr.title}`}
        count={1}
        unit="SR"
        disabled={pending}
        error={message}
        onConfirm={() => void analyse()}
      />
      <p role="status" className="break-words text-ui-sm">
        {message}
      </p>
    </section>
  );
}

export function AIReqBranchCleanup({
  group,
  rows,
}: {
  group: AIReqRequirementGroup;
  rows: AIReqSystemRequirement[];
}) {
  const source = useAIReqDataSource();
  const active = useAIReqWorkspaceActive();
  const aireq = useAIReq()!;
  const [preview, setPreview] = useState<{
    items: AIReqBranchCleanupItem[];
    expectedRevision: number;
    operationId: string;
  }>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const complete =
    rows.length > 0 &&
    rows.length === group.srIds.length &&
    rows.every((sr) => srProgress(sr) === 100);
  const changed = preview && preview.expectedRevision !== aireq.view?.revision;
  return (
    <section className="space-y-3" aria-label="IR 开发分支清理">
      <Button
        variant="outline"
        size="sm"
        disabled={!source.progress || !complete || pending}
        onClick={async () => {
          const expectedRevision = aireq.view!.revision;
          setPending(true);
          setMessage("");
          try {
            setPreview({
              items: await source.progress!.cleanupPreview(group.projectId, group.id),
              expectedRevision,
              operationId: createUuid(),
            });
            setDialogOpen(true);
          } catch (cause) {
            setMessage(formatUserFacingError(cause, "分支清理预览读取失败，请稍后重试。"));
          } finally {
            setPending(false);
          }
        }}
      >
        预览并清理本 IR 开发分支
      </Button>
      {!complete && (
        <p className="text-ui-sm text-foreground-subtle">
          全部 SR 人工测试通过达到 100% 后才可清理。
        </p>
      )}
      <ul className="space-y-1 text-ui-sm">
        {rows.map((sr) => (
          <li key={sr.id} className="break-all">
            {sr.id} · {sr.trackingBranch?.name ?? "分支缺失"} ·{" "}
            {sr.trackingBranch?.status === "deleted"
              ? "已清理"
              : sr.trackingBranch?.status === "failed"
                ? "失败"
                : "已登记"}
            {sr.trackingBranch?.error && (
              <span className="text-destructive"> · {sr.trackingBranch.error}</span>
            )}
          </li>
        ))}
      </ul>
      <p role="status" className="text-ui-sm">
        {message}
      </p>
      {/* 迟到预览保留在原 Tab；隐藏时不显示 Portal 或恢复焦点到隐藏控件。 */}
      <Dialog
        open={active && dialogOpen}
        onOpenChange={(open) => {
          if (active && !open && !pending) setDialogOpen(false);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            if (!active) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>确认清理本 IR 登记开发分支</DialogTitle>
            <DialogDescription>
              仅清理本 IR
              登记的开发分支；保留主分支、材料、报告和验收历史。已清理项不重复执行，只处理未成功项。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-auto text-ui-sm">
            {preview?.items.map((item) => (
              <li key={item.srId} className="break-all">
                {item.srId} · {item.branch || "分支缺失"} ·{" "}
                {item.status === "deleted"
                  ? "已清理，不重试"
                  : item.status === "failed"
                    ? "失败，待重试"
                    : "待清理"}
                {item.error && ` · ${item.error}`}
              </li>
            ))}
          </ul>
          {dialogOpen && !pending && changed && (
            <p role="alert" className="text-ui-sm text-destructive">
              业务版本已变化，请关闭后重新预览。
            </p>
          )}
          {/* RPC 拒绝时保留预览，并在遮罩内展示错误，供用户显式重试。 */}
          {dialogOpen && !pending && message && (
            <p role="alert" className="text-ui-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                pending ||
                Boolean(changed) ||
                !preview?.items.some((item) => item.status !== "deleted")
              }
              onClick={async () => {
                if (!preview || pending || changed) return;
                setPending(true);
                setMessage("");
                try {
                  await source.progress!.cleanupBranches(group.projectId, group.id, {
                    operationId: preview.operationId,
                    expectedRevision: preview.expectedRevision,
                    branches: preview.items.map((item) => item.branch),
                  });
                  setDialogOpen(false);
                  setMessage("清理结果已逐项记录；失败项可重新预览后重试，进度和历史保持不变。");
                } catch (cause) {
                  setMessage(formatUserFacingError(cause, "分支清理未完成，请重新预览后重试。"));
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? "清理中…" : "确认仅清理未成功项"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
