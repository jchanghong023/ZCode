import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useAIReq } from "../AIReqContext.js";
import {
  proposalReturnBlocker,
  proposalVersion,
  type AIReqProposalReturnTarget,
  type AIReqRequirementGroup,
} from "../contract.js";

/** 评审与交付复用绑定版本的退回弹窗，服务端提交后才进入讨论。 */
export function AIReqProposalReturn({
  group,
  target,
  label = "退回修改",
  disabled = false,
  focusFallback,
}: {
  group: AIReqRequirementGroup;
  target: AIReqProposalReturnTarget;
  label?: string;
  disabled?: boolean;
  focusFallback?: RefObject<HTMLElement | null>;
}) {
  const ai = useAIReq()!;
  const { setDraftNavigationGuard } = ai;
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnVersion, setReturnVersion] = useState<{ version: string; revision: number }>();
  const returnTrigger = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const guardOwner = `proposal-return:${group.projectId}:${group.id}:${target}`;
  const currentVersion = proposalVersion(group);
  const returnChanged = Boolean(returnVersion && returnVersion.version !== currentVersion);
  const unavailable = busy || disabled || ai.pending || Boolean(proposalReturnBlocker(group, target));

  useEffect(() => {
    if (!reason.trim() && !busy) return;
    setDraftNavigationGuard((next) => {
      if (inFlight.current) return;
      pendingNavigation.current = next;
      setDiscardOpen(true);
    }, guardOwner);
    return () => setDraftNavigationGuard(null, guardOwner);
  }, [reason, busy, guardOwner, setDraftNavigationGuard]);

  const submitReturn = async () => {
    const opinion = reason.trim();
    if (unavailable || returnChanged || !returnVersion || !opinion || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await ai.command({
        type: "returnProposal",
        projectId: group.projectId,
        irId: group.id,
        expectedRevision: returnVersion.revision,
        target,
        reason: opinion,
      });
      if (result?.receipt.status === "completed") {
        setReturnOpen(false);
        setReason("");
        // 退回已提交，解除本弹窗的未保存保护，再进入同一 IR 的对应讨论。
        setDraftNavigationGuard(null, guardOwner);
        ai.openProposalTask(target);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        ref={returnTrigger}
        variant="outline"
        aria-haspopup="dialog"
        disabled={unavailable || !ai.view}
        onClick={() => {
          if (!ai.view) return;
          setReturnVersion({ version: currentVersion, revision: ai.view.revision });
          setReturnOpen(true);
        }}
      >
        {label}
      </Button>
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
            (entry && !entry.disabled ? entry : focusFallback?.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {target === "solution"
                ? "退回后进入方案设计。业务需求确认保留，当前方案审查、三方确认和交付候选转为历史。"
                : "退回后进入需求澄清。当前需求评审、方案审查及相应确认转为历史。"}
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
            required
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
              disabled={unavailable || returnChanged || !returnVersion || !reason.trim()}
              onClick={() => void submitReturn()}
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
    </>
  );
}
