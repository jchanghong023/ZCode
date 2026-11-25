import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button.js";
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
        const { status, projectCount, count, documentCount } = await source.syncRequirementList();
        const text =
          status === "simulated"
            ? zh
              ? `已模拟全量同步到红区：${projectCount} 个项目、${count} 条 IR、${documentCount} 份需求文档。`
              : `Simulated red-zone sync: ${projectCount} projects, ${count} IRs, ${documentCount} requirements documents.`
            : zh
              ? `已全量同步到红区：${projectCount} 个项目、${count} 条 IR、${documentCount} 份需求文档。`
              : `Synced ${projectCount} projects, ${count} IRs, and ${documentCount} requirements documents to the red zone.`;
        setFeedback({ text });
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
      <div className="flex items-center gap-2">
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
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!!action}
          onClick={() => void run("sync")}
          title={
            zh
              ? `全量同步所有项目的 IR、描述和需求文档到红区。后台每 ${AIREQ_FULL_SYNC_INTERVAL_MINUTES} 分钟自动同步一次。`
              : `Sync all projects, IRs, descriptions, and requirements documents to the red zone. The server syncs automatically every ${AIREQ_FULL_SYNC_INTERVAL_MINUTES} minutes.`
          }
        >
          <Send aria-hidden="true" />
          {action === "sync" ? (zh ? "同步中…" : "Syncing…") : zh ? "全量同步" : "Sync all"}
        </Button>
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
