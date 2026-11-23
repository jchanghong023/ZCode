import { useEffect, useId, useRef, useState } from "react";
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
  const descriptionId = useId();
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState<"copied" | "failed">();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const confirmedVersion = item.documentVersion?.confirmation
    ? item.documentVersion
    : item.documentHistory.at(-1);
  const command = confirmedVersion
    ? documentSyncCommand(
        window.location.href,
        { projectId: item.projectId, irId: item.id, releaseId: item.releaseId },
        documentSync.scriptSha256,
      )
    : undefined;
  const label = zh ? "复制同步命令" : "Copy sync command";
  const description =
    command && confirmedVersion
      ? zh
        ? `当前可同步 V${confirmedVersion.number}，执行时取最新已定版。`
        : `V${confirmedVersion.number} is available now. Running the command fetches the latest confirmed version.`
      : confirmedVersion
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
        {/* 按钮关联常驻说明，避免 Radix 在打开预览时把整条命令读作按钮说明。 */}
        <TooltipTrigger asChild aria-describedby={descriptionId}>
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
          aria-label={description}
          onEscapeKeyDown={() => setFeedback(undefined)}
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
              <span className="font-medium">{description}</span>
              <code
                className="block w-full min-w-0 font-mono wrap-anywhere whitespace-pre-wrap"
                data-testid="document-sync-command-preview"
              >
                {command}
              </code>
            </>
          ) : (
            description
          )}
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} hidden>
        {description}
      </span>
      <span className="sr-only" role="status">
        {feedback ? feedbackLabel : ""}
      </span>
    </>
  );
}
