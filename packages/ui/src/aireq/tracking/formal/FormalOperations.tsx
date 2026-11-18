import { formatUserFacingError } from "@/lib/errorMessage.js";
// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import { useSchedulerQuery } from "../analysis/useSchedulerQuery.js";
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
  const [request, setRequest] = useState<Omit<AIReqTestAcceptanceInput, "reason">>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const blocker = !source.progress ? "测试验收服务暂不可用。" : srCompletionBlocker(sr);
  const open = () => {
    if (!aireq.view || !sr.codeMerge || blocker) return;
    setReason("");
    setError("");
    setRequest({
      operationId: createUuid(),
      expectedRevision: aireq.view.revision,
      expectedCodeVersion: sr.codeMerge.commit,
    });
    setDialogOpen(true);
  };
  const versionChanged =
    request &&
    (request.expectedRevision !== aireq.view?.revision ||
      request.expectedCodeVersion !== sr.codeMerge?.commit);
  return (
    <section className="space-y-3" aria-label="人工测试验收">
      {blocker ? (
        srProgress(sr) !== 100 && <p className="text-ui-sm text-foreground-subtle">{blocker}</p>
      ) : (
        <Button size="sm" variant="outline" onClick={open}>
          验收通过
        </Button>
      )}
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
            <DialogTitle>记录验收通过</DialogTitle>
            <DialogDescription>
              {sr.title} · 提交验收依据后，此 SR 将标记为已完成，进度为 100%。
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
            <p className="break-all text-ui-sm">首次合入版本：{request?.expectedCodeVersion}</p>
            <Label htmlFor={`${id}-basis`}>验收依据</Label>
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
                  ? "业务版本已变化；请关闭后重新打开验收表单，核对首次合入版本。"
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
                {saving ? "记录中…" : "确认验收通过"}
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
  const { projectId, releaseId, id: irId } = group;
  const { id: srId } = sr;
  const [revision, setRevision] = useState(0);
  const scope = useMemo(
    () => ({ projectId, releaseId, irId, srId }),
    [projectId, releaseId, irId, srId],
  );
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const load = useCallback(() => scheduler!.queryTasks(scope, 1, 25), [scheduler, scope]);
  const query = useSchedulerQuery(load, revision, active && Boolean(scheduler) && !sr.codeMerge);
  useEffect(() => {
    if (!active || !scheduler || sr.codeMerge) return;
    return scheduler.subscribe(refresh);
  }, [active, scheduler, sr.codeMerge, refresh]);
  if (!scheduler || sr.codeMerge) return null;
  const unavailable = query.loading || Boolean(query.error) || !query.value?.eligibleCount;
  const eligibilityMessage =
    query.error || (!query.loading && unavailable ? "当前 SR 暂不可发起分析。" : "");
  const analyse = async () => {
    if (submitting.current || unavailable) return;
    submitting.current = true;
    setPending(true);
    setMessage("");
    try {
      if (!(await load()).eligibleCount) {
        setConfirm(false);
        setMessage("当前 SR 已不可发起分析，请查看分析设置或执行记录。");
        refresh();
        return;
      }
      await scheduler.runNow(scope);
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
        disabled={pending || unavailable}
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
        blocked={unavailable}
        error={message || eligibilityMessage}
        onConfirm={() => void analyse()}
      />
      <p role="status" className="break-words text-ui-sm">
        {message || eligibilityMessage}
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
              登记的开发分支；保留主分支、材料、报告和验收记录。已清理项不重复执行，只处理未成功项。
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
