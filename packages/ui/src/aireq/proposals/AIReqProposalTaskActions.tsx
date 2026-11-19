import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog.js";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import {
  fullReviewReadyBlocker,
  proposalReviewCanRetry,
  requirementsReviewCurrent,
  proposalProgressIndex,
  requirementsReviewReadyBlocker,
  proposalVersion,
  type AIReqAction,
  type AIReqRequirementGroup,
  type AIReqReview,
} from "../contract.js";

/** 任务的显式业务动作复用原命令入口，接纳与阶段转换由 Context／服务端裁决。 */
export function AIReqProposalTaskActions({
  group,
  full = false,
  reviewed,
  focusFallback,
}: {
  group: AIReqRequirementGroup;
  full?: boolean;
  reviewed: boolean;
  focusFallback: RefObject<HTMLElement | null>;
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const hintId = useId();
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnVersion, setReturnVersion] = useState<{ version: string; revision: number }>();
  const returnTrigger = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [approval, setApproval] = useState<{
    projectId: string;
    irId: string;
    title: string;
    review: Pick<AIReqReview, "id" | "snapshotDigest" | "round" | "inputFiles">;
  } | null>(null);
  const approvalEntry = useRef<HTMLButtonElement | null>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const { setDraftNavigationGuard } = ai;
  const guardOwner = `proposal-review-return:${group.projectId}:${group.id}:${full}`;
  const phase = proposalProgressIndex(group, {});
  const review = full ? group.review : group.originalReview;
  const currentStage = full ? phase === 2 : phase <= 1;
  const confirmed = Boolean(
    !full &&
    review?.passed &&
    review.humanDecision?.reviewId === review.id &&
    review.humanDecision.snapshotDigest === review.snapshotDigest &&
    requirementsReviewCurrent(group),
  );
  const currentVersion = proposalVersion(group);
  const returnChanged = Boolean(returnVersion && returnVersion.version !== currentVersion);
  useEffect(() => {
    if ((!reason.trim() && !busy) || !currentStage || group.status === "requirements-pr") return;
    setDraftNavigationGuard((next) => {
      if (inFlight.current) return;
      pendingNavigation.current = next;
      setDiscardOpen(true);
    }, guardOwner);
    return () => setDraftNavigationGuard(null, guardOwner);
  }, [reason, busy, guardOwner, currentStage, group.status, setDraftNavigationGuard]);
  const running = ai.view?.running.some(
    (item) => item.projectId === group.projectId && item.irId === group.id,
  );
  const unavailable =
    busy ||
    ai.pending ||
    running ||
    !source.capabilities.proposalDiscussion ||
    !currentStage ||
    group.status === "requirements-pr";
  const canRetry = proposalReviewCanRetry(group, full);
  const approveIssue = full ? fullReviewReadyBlocker(group) : requirementsReviewReadyBlocker(group);
  const approveReady = Boolean(review && !approveIssue);
  const evidenceIssue = !full && review && !reviewed ? "请先展开评审报告并阅读，再确认。" : "";
  const approveBlocker = approveIssue || evidenceIssue || (confirmed ? "当前评审已确认。" : "");
  // 弹窗确认的是打开时读过的版本；协作者重审后的新投影不能静默替换确认对象。
  const approvalChanged = Boolean(
    approval &&
    (approval.projectId !== group.projectId ||
      approval.irId !== group.id ||
      !requirementsReviewCurrent(group) ||
      approval.review.id !== review?.id ||
      approval.review.snapshotDigest !== review?.snapshotDigest),
  );
  const hint = canRetry
    ? `${full ? "方案审查" : "需求评审"}未产出完整报告，可重试当前材料。`
    : running
      ? "正在评审当前材料，完成后可查看意见并人工确认。"
      : approveBlocker;
  const target = { projectId: group.projectId, irId: group.id };
  const run = async (command: AIReqAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await ai.command(command);
      if (result?.status === "completed") {
        if (command.type === "returnProposal") {
          setReturnOpen(false);
          setReason("");
        }
        if (command.type === "acceptProposal") setApproval(null);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3" data-testid="proposal-task-actions">
      {!confirmed && (currentStage || !full) && group.status !== "requirements-pr" && (
        <div className="flex flex-wrap items-center gap-3">
          {!full && (
            <Button
              aria-haspopup="dialog"
              variant={approveReady ? "default" : "outline"}
              disabled={Boolean(
                approveBlocker || !currentStage || !source.capabilities.proposalDiscussion,
              )}
              aria-disabled={Boolean(unavailable || approveBlocker)}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              aria-describedby={hint ? hintId : undefined}
              onClick={(event) => {
                if (!review || unavailable || approveBlocker) return;
                approvalEntry.current = event.currentTarget;
                setApproval({
                  ...target,
                  title: group.title,
                  review: {
                    id: review.id,
                    snapshotDigest: review.snapshotDigest,
                    round: review.round,
                    inputFiles: review.inputFiles,
                  },
                });
              }}
            >
              确认业务需求
            </Button>
          )}
          {canRetry && (
            <Button
              disabled={busy || ai.pending || !source.capabilities.proposalDiscussion}
              aria-describedby={hint ? hintId : undefined}
              onClick={() =>
                void run({ type: full ? "runFullReview" : "runRequirementsReview", ...target })
              }
            >
              {busy ? "正在重试…" : full ? "重试方案审查" : "重试需求评审"}
            </Button>
          )}
          {!full && review && requirementsReviewCurrent(group) && (
            <Button
              ref={returnTrigger}
              variant="ghost"
              disabled={Boolean(unavailable)}
              onClick={() => {
                if (ai.view)
                  setReturnVersion({ version: currentVersion, revision: ai.view.revision });
                setReturnOpen(true);
              }}
            >
              退回业务补充
            </Button>
          )}
        </div>
      )}
      {!confirmed && hint && (!full || canRetry) && (
        <p id={hintId} role="status" className="text-ui-sm text-foreground-subtle">
          {hint}
        </p>
      )}
      <AlertDialog
        open={approval !== null}
        onOpenChange={(open) => {
          if (!open && !inFlight.current) setApproval(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (inFlight.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const entry = approvalEntry.current;
            const fallback = focusFallback.current;
            approvalEntry.current = null;
            // 退场动画与焦点陷阱清理结束后，只回到实际打开弹窗的同一节点。
            requestAnimationFrame(() => {
              if (approvalEntry.current || document.activeElement !== document.body) return;
              const target = entry?.isConnected && !entry.disabled ? entry : fallback;
              if (target?.isConnected && !target.closest("[hidden], [inert]"))
                target.focus({ preventScroll: true });
            });
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>确认业务需求？</AlertDialogTitle>
            <AlertDialogDescription>
              本次确认「{approval?.title}」第 {approval?.review.round ?? 1}{" "}
              轮需求评审。确认后进入方案设计；如需变更，须修改材料并重新评审。
            </AlertDialogDescription>
            {approval?.review.inputFiles?.map((file) => (
              <p key={file.path} className="break-all font-mono text-ui-sm text-foreground-subtle">
                {file.path}
              </p>
            ))}
            {approvalChanged && (
              <p role="status" className="text-ui-sm text-destructive">
                评审对象或材料版本已变化，请关闭并重新阅读评审后再确认。
              </p>
            )}
            {!approvalChanged && unavailable && !busy && (
              <p role="status" className="text-ui-sm text-foreground-subtle">
                当前暂不能确认，请查看最新评审状态。
              </p>
            )}
            {ai.error && (
              <p role="alert" className="text-ui-sm text-destructive">
                {ai.error}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(unavailable || approveBlocker || approvalChanged || !approval)}
              onClick={(event) => {
                event.preventDefault();
                if (!approval || approvalChanged || unavailable || approveBlocker) return;
                void run({
                  type: "acceptProposal",
                  projectId: approval.projectId,
                  irId: approval.irId,
                  reviewId: approval.review.id,
                  snapshotDigest: approval.review.snapshotDigest,
                });
              }}
            >
              {busy ? "正在确认…" : "确认业务需求"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={returnOpen}
        onOpenChange={(open) => {
          if (!busy) setReturnOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const entry = returnTrigger.current;
            (entry && !entry.disabled ? entry : focusFallback.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>退回业务补充</DialogTitle>
            <DialogDescription>
              说明需要补充的内容。退回后旧评审与确认记录仅供追溯，补充材料并通过校验后，请再次提交评审。取消会保留未提交内容。
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={reasonId} className="text-ui-sm font-medium text-foreground">
            退回原因
          </label>
          <SettingsFormTextarea
            id={reasonId}
            aria-label="退回原因"
            className="min-h-32"
            value={reason}
            readOnly={busy}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
          />
          {returnChanged && (
            <p role="status" className="text-ui-sm text-destructive">
              材料版本已变化，请取消后重新阅读当前材料，再打开退回窗口。
            </p>
          )}
          {ai.error && (
            <p role="alert" className="text-ui-sm text-destructive">
              {ai.error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReturnOpen(false)}>
              取消
            </Button>
            <Button
              disabled={Boolean(unavailable || returnChanged || !returnVersion || !reason.trim())}
              onClick={() =>
                void run({
                  type: "returnProposal",
                  ...target,
                  expectedRevision: returnVersion?.revision,
                  reason: reason.trim(),
                })
              }
            >
              确认退回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (busy) return;
            event.preventDefault();
            pendingNavigation.current = null;
            setDiscardOpen(false);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未提交的退回原因？</AlertDialogTitle>
            <AlertDialogDescription>
              继续填写会保留内容，放弃后离开当前任务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingNavigation.current = null;
              }}
            >
              继续填写
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingNavigation.current;
                pendingNavigation.current = null;
                setReason("");
                setReturnOpen(false);
                setDraftNavigationGuard(null, guardOwner);
                next?.();
              }}
            >
              放弃并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
