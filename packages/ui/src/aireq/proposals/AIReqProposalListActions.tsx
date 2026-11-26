import { useId } from "react";
import { ChevronDown, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReq, useAIReqProposalPageActions } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import { AIREQ_FULL_SYNC_INTERVAL_MINUTES } from "../contract.js";

export function AIReqProposalListActions({ zh }: { zh: boolean }) {
  const ai = useAIReq()!;
  const { capabilities } = useAIReqDataSource();
  const { projectRefresh, redSync, syncRequirementList } = useAIReqProposalPageActions()!;
  const refreshing = projectRefresh?.status === "pending";
  const syncing = redSync?.status === "pending";
  const syncDescriptionId = useId();
  const syncLabel = zh ? "同步全部项目到红区" : "Sync to red zone (all projects)";

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
        {capabilities.canSendToRedZone && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="lg" aria-busy={syncing}>
                {syncing && (
                  <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
                )}
                {zh ? "项目交接" : "Project handoff"}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem
                aria-describedby={syncDescriptionId}
                disabled={refreshing || syncing}
                onSelect={() => void syncRequirementList()}
              >
                <Send aria-hidden="true" />
                {syncLabel}
              </DropdownMenuItem>
              <DropdownMenuLabel
                id={syncDescriptionId}
                className="whitespace-normal text-ui-caption font-normal text-foreground-subtle"
              >
                {zh
                  ? `交接全部项目的 IR、描述和需求文档，每 ${AIREQ_FULL_SYNC_INTERVAL_MINUTES} 分钟自动同步一次。`
                  : `IRs, descriptions and requirements documents from all projects sync automatically every ${AIREQ_FULL_SYNC_INTERVAL_MINUTES} minutes.`}
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
      {redSync?.status === "succeeded" && (
        <p role="status" className="text-ui-caption text-foreground-subtle">
          {zh
            ? `已提交交接：${redSync.receipt.projectCount} 个项目，${redSync.receipt.count} 条需求，${redSync.receipt.documentCount} 份文档。`
            : `Handoff submitted: ${redSync.receipt.projectCount} projects, ${redSync.receipt.count} requirements, ${redSync.receipt.documentCount} documents.`}
        </p>
      )}
      {syncError && (
        <p role="alert" className="text-ui-caption text-destructive">
          {syncError}
        </p>
      )}
    </div>
  );
}
