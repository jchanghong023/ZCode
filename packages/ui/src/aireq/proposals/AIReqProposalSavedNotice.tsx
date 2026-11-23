import type { Ref } from "react";
import { Button } from "@/components/ui/button.js";
import { useAIReq } from "../AIReqContext.js";

export type SavedProposal = { projectId: string; releaseId: string; irId: string };

export function AIReqProposalSavedNotice({
  target,
  title,
  buttonRef,
  zh,
  onLocate,
}: {
  target: SavedProposal;
  title: string;
  buttonRef: Ref<HTMLButtonElement>;
  zh: boolean;
  onLocate?: () => void;
}) {
  const ai = useAIReq()!;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1 basis-48 space-y-1" role="status">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-ui-sm text-foreground-subtle">
            {zh ? "原始需求已保存" : "Original request saved"}
          </span>
          <span className="min-w-0 truncate text-ui-base font-medium" title={title}>
            {title}
          </span>
        </p>
        {onLocate && (
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "新需求未匹配当前筛选条件。"
              : "The new requirement is hidden by the current filters."}
          </p>
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {onLocate && (
          <Button variant="outline" onClick={onLocate}>
            {zh ? "清除筛选并定位" : "Clear filters and locate"}
          </Button>
        )}
        <Button
          ref={buttonRef}
          aria-label={zh ? `继续讨论 · ${title}` : `Continue discussion · ${title}`}
          onClick={() =>
            ai.select(
              { projectId: target.projectId, irId: target.irId, discussionPhase: "requirements" },
              target.releaseId,
            )
          }
        >
          {zh ? "继续讨论" : "Continue discussion"}
        </Button>
      </div>
    </div>
  );
}
