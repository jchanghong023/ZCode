import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { useAIReqDataSource } from "../data-source.js";
import { documentSyncCommand } from "./document-sync-command.js";

export function AIReqCopyDocumentSyncButton({
  item,
  zh,
}: {
  item: AIReqRequirementGroup;
  zh: boolean;
}) {
  const { documentSync } = useAIReqDataSource();
  const { writeClipboardText } = usePlatform();
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState<"copied" | "failed">();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hasConfirmed = item.documentVersion?.confirmation || item.documentHistory.length > 0;
  const command = hasConfirmed
    ? documentSyncCommand(
        window.location.href,
        { projectId: item.projectId, irId: item.id, releaseId: item.releaseId },
        documentSync.scriptSha256,
      )
    : undefined;
  const label = zh ? "复制同步命令" : "Copy sync command";
  const unavailable = hasConfirmed
    ? zh
      ? "同步脚本暂不可用"
      : "The sync script is unavailable"
    : zh
      ? "暂无已定版文档"
      : "No confirmed documents yet";
  const feedbackLabel =
    feedback === "copied"
      ? zh
        ? "已复制"
        : "Copied"
      : zh
        ? "复制失败，请重试。"
        : "Copy failed. Try again.";
  const Icon = feedback === "copied" ? Check : Copy;
  const copy = async () => {
    if (!command) return;
    try {
      await writeClipboardText(command);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(undefined), 1600);
  };

  return (
    <>
      <Tooltip open={preview || Boolean(feedback)} onOpenChange={setPreview}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="aria-disabled:opacity-60"
            aria-disabled={!command || undefined}
            aria-label={`${label} · ${item.title}`}
            data-testid="copy-document-sync-command"
            onClick={() => void copy()}
          >
            <Icon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          align="end"
          sideOffset={4}
          className={
            command && !feedback
              ? "max-w-[min(38rem,calc(100vw-2rem))] flex-col items-start gap-1.5 py-2 text-left"
              : undefined
          }
        >
          {feedback ? (
            feedbackLabel
          ) : command ? (
            <>
              <span className="font-medium">{label}</span>
              <code
                className="block w-full min-w-0 wrap-anywhere whitespace-pre-wrap"
                data-testid="document-sync-command-preview"
              >
                {command}
              </code>
            </>
          ) : (
            unavailable
          )}
        </TooltipContent>
      </Tooltip>
      <span className="sr-only" role="status">
        {feedback ? feedbackLabel : ""}
      </span>
    </>
  );
}
