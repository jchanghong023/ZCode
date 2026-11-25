import { useState } from "react";
import { LoaderCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_FULL_SYNC_INTERVAL_MINUTES } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";

export function AIReqProposalListActions({ zh }: { zh: boolean }) {
  const ai = useAIReq()!;
  const source = useAIReqDataSource();
  const { projectId } = ai.selection;
  const [action, setAction] = useState<"refresh" | "sync">();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const syncLabel = zh ? "同步到红区（所有项目）" : "Sync to red zone (all projects)";

  async function run(next: "refresh" | "sync") {
    if (action || (next === "refresh" && !projectId)) return;
    setAction(next);
    setFeedback(undefined);
    try {
      if (next === "refresh") {
        await ai.refreshProjects(true);
        setFeedback({
          text: zh ? "已更新项目和需求。" : "Projects and requirements updated.",
        });
      } else {
        await source.syncRequirementList();
      }
    } catch (cause) {
      if (next === "sync")
        setFeedback({
          text: formatUserFacingError(
            cause,
            zh ? "红区同步失败。" : "Could not sync to the red zone.",
          ),
          error: true,
        });
    } finally {
      setAction(undefined);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!projectId || ai.pending || !!action}
          onClick={() => void run("refresh")}
          title={zh ? "从云龙刷新需求" : "Refresh from CloudDragon"}
        >
          <RefreshCw aria-hidden="true" />
          {action === "refresh"
            ? zh
              ? "刷新中…"
              : "Refreshing…"
            : zh
              ? "刷新项目"
              : "Refresh projects"}
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
            aria-busy={action === "sync"}
            disabled={!!action}
            onClick={() => void run("sync")}
          >
            {action === "sync" ? (
              <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <Send aria-hidden="true" />
            )}
          </Button>
        </ControlHintTooltip>
      </div>
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={
            feedback.error
              ? "text-ui-caption text-destructive"
              : "text-ui-caption text-foreground-subtle"
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
