import { LoaderCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReq, useAIReqProposalPageActions } from "../AIReqContext.js";
import { AIREQ_FULL_SYNC_INTERVAL_MINUTES } from "../contract.js";

export function AIReqProposalListActions({ zh }: { zh: boolean }) {
  const ai = useAIReq()!;
  const { projectRefresh, redSync, syncRequirementList } = useAIReqProposalPageActions()!;
  const refreshing = projectRefresh?.status === "pending";
  const syncing = redSync?.status === "pending";
  const syncLabel = zh ? "同步到红区（所有项目）" : "Sync to red zone (all projects)";

  const refreshError =
    projectRefresh?.status === "failed"
      ? formatUserFacingError(
          projectRefresh.cause,
          zh ? "刷新项目失败，请重试。" : "Could not refresh projects. Try again.",
        )
      : undefined;
  const syncError =
    redSync?.status === "failed"
      ? formatUserFacingError(
          redSync.cause,
          zh ? "红区同步失败。" : "Could not sync to the red zone.",
        )
      : undefined;

  return (
    <div className="flex min-w-0 flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!ai.selection.projectId || ai.pending || refreshing || syncing}
          onClick={() => void ai.refreshProjects()}
          title={zh ? "刷新项目和需求" : "Refresh projects and requirements"}
        >
          <RefreshCw aria-hidden="true" />
          {refreshing ? (zh ? "刷新中…" : "Refreshing…") : zh ? "刷新项目" : "Refresh projects"}
        </Button>
        <ControlHintTooltip
          title={syncLabel}
          description={
            zh
              ? `同步 IR、描述和需求文档。后台每 ${AIREQ_FULL_SYNC_INTERVAL_MINUTES} 分钟自动同步一次。`
              : `Sync IRs, descriptions, and requirements documents. The server syncs automatically every ${AIREQ_FULL_SYNC_INTERVAL_MINUTES} minutes.`
          }
          side="bottom"
          align="end"
        >
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={syncLabel}
            aria-busy={syncing}
            disabled={refreshing || syncing}
            onClick={() => void syncRequirementList()}
          >
            {syncing ? (
              <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <Send aria-hidden="true" />
            )}
          </Button>
        </ControlHintTooltip>
      </div>
      {refreshError ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {refreshError}
        </p>
      ) : projectRefresh?.status === "succeeded" ? (
        <p role="status" className="text-ui-caption text-foreground-subtle">
          {zh ? "已更新项目和需求。" : "Projects and requirements updated."}
        </p>
      ) : null}
      {syncError && (
        <p role="alert" className="text-ui-caption text-destructive">
          {syncError}
        </p>
      )}
    </div>
  );
}
