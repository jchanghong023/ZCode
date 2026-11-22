import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";
import {
  fullReviewCurrent,
  proposalReviewSubmitBlocker,
  requirementsReviewCurrent,
  type AIReqRequirementGroup,
} from "../contract.js";

export function AIReqProposalReviewSubmit({
  proposal,
  kind,
}: {
  proposal: AIReqRequirementGroup;
  kind: "original" | "full";
}) {
  const ai = useAIReq()!;
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const reasonId = useId();
  const full = kind === "full";
  const name = full ? "方案审查" : "需求评审";
  const current = full ? fullReviewCurrent(proposal) : requirementsReviewCurrent(proposal);
  const blocker = proposalReviewSubmitBlocker(proposal, kind);
  const snapshotDigest = proposal.snapshot?.digest;
  const reason = blocker ?? (!snapshotDigest ? "等待当前材料校验完成后提交。" : undefined);
  const checkMessage =
    reason ?? `材料格式检查通过 · ${full ? proposal.files.length : 1} 份材料，请核对内容`;

  if (current) {
    return (
      <Button
        variant="outline"
        onClick={() => ai.openProposalTask(full ? "solutionReview" : "requirementsReview")}
      >
        {`查看${name}`}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        aria-describedby={reason ? reasonId : undefined}
        disabled={!snapshotDigest || Boolean(blocker) || pending || ai.pending}
        onClick={async () => {
          if (!snapshotDigest || blocker || submitting.current) return;
          submitting.current = true;
          setPending(true);
          try {
            await ai.command({
              type: "submitProposalReview",
              projectId: proposal.projectId,
              irId: proposal.id,
              kind,
              snapshotDigest,
            });
          } finally {
            submitting.current = false;
            setPending(false);
          }
        }}
      >
        {pending ? "正在提交…" : `提交${name}`}
      </Button>
      <p
        id={reasonId}
        role="status"
        className="max-w-xs break-words text-ui-sm text-foreground-subtle"
      >
        {checkMessage}
      </p>
    </div>
  );
}
