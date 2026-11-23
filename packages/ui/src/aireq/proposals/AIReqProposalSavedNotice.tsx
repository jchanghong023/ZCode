import type { Ref } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import { proposalTaskSelection } from "./proposalTasks.js";

export type SavedProposal = { projectId: string; releaseId: string; irId: string };

export function AIReqProposalSavedNotice({
  target,
  buttonRef,
  zh,
}: {
  target?: SavedProposal;
  buttonRef: Ref<HTMLButtonElement>;
  zh: boolean;
}) {
  const ai = useAIReq()!;
  if (
    !target ||
    target.projectId !== ai.selection.projectId ||
    target.releaseId !== ai.releaseId ||
    !ai.view?.requirements.some((item) => !item.merge && item.projectId === target.projectId && item.id === target.irId)
  )
    return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-ui-sm font-medium" role="status">
        {zh ? "原始需求已保存" : "Original request saved"}
      </p>
      <Button
        ref={buttonRef}
        onClick={() =>
          ai.select(proposalTaskSelection(target, "requirements"), target.releaseId, "requirements")
        }
      >
        {zh ? "开始需求澄清" : "Start clarification"}
      </Button>
    </div>
  );
}
