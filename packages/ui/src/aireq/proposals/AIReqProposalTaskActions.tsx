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
import { useEffect, useId, useRef, useState } from "react";
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
  hasCurrentProposalSolution,
  proposalProgressIndex,
  requirementsReviewReadyBlocker,
  requirementsReviewStartBlocker,
  type AIReqAction,
  type AIReqRequirementGroup,
  type AIReqReview,
} from "../contract.js";

/** 任务的显式业务动作复用原命令入口，接纳与阶段转换由 Context／服务端裁决。 */
export function AIReqProposalTaskActions({
  group,
  full = false,
  discussion = false,
  reviewed = true,
}: {
  group: AIReqRequirementGroup;
  full?: boolean;
  discussion?: boolean;
  /** 审查页在综合报告展开前禁止确认；其他入口保持默认已读。 */
  reviewed?: boolean;
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const hintId = useId();
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [approval, setApproval] = useState<{
    projectId: string;
    irId: string;
    full: boolean;
    review: Pick<AIReqReview, "id" | "snapshotDigest" | "round">;
  } | null>(null);
  const approveTrigger = useRef<HTMLButtonElement>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const { setDraftNavigationGuard } = ai;
  const guardOwner = `proposal-review-return:${group.projectId}:${group.id}:${full}`;
  const phase = proposalProgressIndex(group, {});
  const review = full ? group.review : group.originalReview;
  const currentStage = full ? phase === 2 : phase <= 1;
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
  const startIssue = full
    ? hasCurrentProposalSolution(group)
      ? undefined
      : "请先完善方案、任务与测试材料。"
    : requirementsReviewStartBlocker(group);
  const approveIssue = full ? fullReviewReadyBlocker(group) : requirementsReviewReadyBlocker(group);
  const approveReady = Boolean(review && !approveIssue);
  const evidenceIssue =
    review && !reviewed ? `请先展开${full ? "综合报告" : "评审报告"}并阅读，再确认。` : "";
  const approveBlocker = approveIssue || evidenceIssue;
  // 弹窗确认的是打开时读过的版本；协作者重审后的新投影不能静默替换确认对象。
  const approvalChanged = Boolean(
    approval &&
    (approval.projectId !== group.projectId ||
      approval.irId !== group.id ||
      approval.full !== full ||
      approval.review.id !== review?.id ||
      approval.review.snapshotDigest !== review?.snapshotDigest),
  );
  const hint = running
    ? "正在评审当前材料，完成后可查看意见并人工确认。"
    : discussion || !review
      ? startIssue
      : approveBlocker;
  const target = { projectId: group.projectId, irId: group.id };
  const run = async (command: AIReqAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await ai.command(command);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  if (!currentStage || group.status === "requirements-pr") return null;
  return (
    <div className="space-y-3" data-testid="proposal-task-actions">
      <div className="flex flex-wrap items-center gap-3">
        {!discussion && review && (
          <Button
            ref={approveTrigger}
            variant={approveReady ? "default" : "outline"}
            disabled={Boolean(unavailable || approveBlocker)}
            aria-describedby={hint ? hintId : undefined}
            title={approveBlocker}
            // 修复原因：人工放行／需求通过是不可逆业务决定，原先单击即执行，
            // 比丢弃草稿（有确认弹窗）更轻；按 proposals spec 增加确认弹窗，取消为默认焦点。
            onClick={() =>
              setApproval({
                ...target,
                full,
                review: {
                  id: review.id,
                  snapshotDigest: review.snapshotDigest,
                  round: review.round,
                },
              })
            }
          >
            {full ? "确认完整方案" : "确认业务需求"}
          </Button>
        )}
        <Button
          variant={discussion || !approveReady ? "default" : "outline"}
          disabled={Boolean(unavailable || startIssue)}
          aria-describedby={hint ? hintId : undefined}
          title={startIssue}
          onClick={() =>
            void run({ type: full ? "runFullReview" : "runRequirementsReview", ...target })
          }
        >
          {busy
            ? "处理中…"
            : review
              ? full
                ? "重新审查方案"
                : "重新评审需求"
              : full
                ? "发起方案审查"
                : "发起需求评审"}
        </Button>
        {!discussion && review && (
          <Button
            variant="ghost"
            disabled={Boolean(unavailable)}
            onClick={() => setReturnOpen(true)}
          >
            退回业务补充
          </Button>
        )}
      </div>
      {hint && (
        <p id={hintId} role="status" className="text-ui-sm text-foreground-subtle">
          {hint}
        </p>
      )}
      <AlertDialog
        open={approval !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setApproval(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            // AlertDialog 默认不因 Esc 关闭；人工放行仍需保留明确取消出口。
            if (busy) return;
            event.preventDefault();
            setApproval(null);
          }}
          onCloseAutoFocus={(event) => {
            // 入口通过受控状态打开而非 Radix Trigger；关闭后显式恢复实际入口焦点。
            event.preventDefault();
            approveTrigger.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{full ? "确认完整方案？" : "确认业务需求？"}</AlertDialogTitle>
            <AlertDialogDescription>
              {full
                ? "将人工放行当前版本的完整审查，随后进入业务、开发、测试三方确认。确认后如需变更，须退回或更新材料并重新审查。"
                : "将人工通过当前版本的原始评审，随后进入方案完善。确认后如需变更，须退回或更新材料并重新评审。"}
              {approval?.review.round ? `本次确认对象为第 ${approval.review.round} 轮评审。` : ""}
              {approvalChanged
                ? "评审对象或材料版本已变化，请关闭弹窗并重新阅读评审后再确认。"
                : unavailable || approveBlocker
                  ? "当前暂不能确认，请关闭弹窗查看最新评审状态。"
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(unavailable || approveBlocker || approvalChanged || !approval)}
              onClick={() => {
                if (!approval || approvalChanged || unavailable || approveBlocker) return;
                setApproval(null);
                // 命令联合按 type 判别，三元 type 无法收窄；分支构造各自字面量命令。
                void run(
                  approval.full
                    ? {
                        type: "approveFullReview",
                        projectId: approval.projectId,
                        irId: approval.irId,
                        reviewId: approval.review.id,
                        snapshotDigest: approval.review.snapshotDigest,
                      }
                    : {
                        type: "acceptProposal",
                        projectId: approval.projectId,
                        irId: approval.irId,
                        reviewId: approval.review.id,
                        snapshotDigest: approval.review.snapshotDigest,
                      },
                );
              }}
            >
              {full ? "确认完整方案" : "确认业务需求"}
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
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>退回业务补充</DialogTitle>
            <DialogDescription>
              说明需要补充的内容。退回后旧评审与确认记录仅供追溯，需补充并重新
              {full ? "审查" : "评审"}。取消会保留未提交内容。
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
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
          />
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
              disabled={busy || !reason.trim()}
              onClick={() => void run({ type: "returnProposal", ...target, reason: reason.trim() })}
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
