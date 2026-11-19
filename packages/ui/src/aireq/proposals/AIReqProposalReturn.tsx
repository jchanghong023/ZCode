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
import { proposalReturnBlocker, proposalVersion, type AIReqRequirementGroup } from "../contract.js";

/** 方案设计和需求评审复用同一个有原因、绑定版本的退回操作。 */
export function AIReqProposalReturn({
  group,
  fromSolution = false,
  disabled = false,
  focusFallback,
}: {
  group: AIReqRequirementGroup;
  fromSolution?: boolean;
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
  const guardOwner = `proposal-return:${group.projectId}:${group.id}:${fromSolution}`;
  const currentVersion = proposalVersion(group);
  const returnChanged = Boolean(returnVersion && returnVersion.version !== currentVersion);
  const unavailable = busy || disabled || ai.pending || Boolean(proposalReturnBlocker(group));
  const label = fromSolution ? "退回业务澄清" : "退回业务补充";

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
        reason: opinion,
      });
      if (result?.status === "completed") {
        setReturnOpen(false);
        setReason("");
        // 退回已提交，解除本弹窗的未保存保护，再进入同一 IR 的新澄清会话。
        setDraftNavigationGuard(null, guardOwner);
        if (fromSolution) ai.openProposalTask("requirements");
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
        variant={fromSolution ? "outline" : "ghost"}
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
              {fromSolution
                ? "请写明需要业务澄清的问题。退回会使当前确认和审查失效，材料与历史文件仍保留。"
                : "说明需要补充的内容。退回后旧评审与确认记录仅供追溯，补充材料并通过校验后，请再次提交评审。取消会保留未提交内容。"}
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
