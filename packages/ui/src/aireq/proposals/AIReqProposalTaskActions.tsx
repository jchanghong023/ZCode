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
import { useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import {
  fullReviewReadyBlocker,
  proposalReviewCanRetry,
  requirementsReviewCurrent,
  proposalProgressIndex,
  requirementsReviewReadyBlocker,
  type AIReqAction,
  type AIReqRequirementGroup,
  type AIReqReview,
} from "../contract.js";
import { AIReqProposalReturn } from "./AIReqProposalReturn.js";

/** 任务的显式业务动作复用原命令入口，接纳与阶段转换由 Context／服务端裁决。 */
export function AIReqProposalTaskActions({
  group,
  full = false,
  focusFallback,
}: {
  group: AIReqRequirementGroup;
  full?: boolean;
  focusFallback: RefObject<HTMLElement | null>;
}) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [approval, setApproval] = useState<{
    projectId: string;
    irId: string;
    title: string;
    review: Pick<AIReqReview, "id" | "snapshotDigest" | "round">;
  } | null>(null);
  const approvalEntry = useRef<HTMLButtonElement | null>(null);
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
  const approveBlocker = approveIssue || (confirmed ? "当前评审已确认。" : "");
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
      if (result?.status === "completed" && command.type === "acceptProposal") setApproval(null);
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
            <AIReqProposalReturn
              group={group}
              disabled={Boolean(unavailable)}
              focusFallback={focusFallback}
            />
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
    </div>
  );
}
