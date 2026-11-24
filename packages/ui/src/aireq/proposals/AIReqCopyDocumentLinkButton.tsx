import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { documentLinkCommand } from "./document-link-command.js";

export function AIReqCopyDocumentLinkButton({
  workDirectory,
  title,
  zh,
}: {
  workDirectory: string | undefined;
  title: string;
  zh: boolean;
}) {
  const { writeClipboardText } = usePlatform();
  const descriptionId = useId();
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState<"copied" | "failed">();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const command = documentLinkCommand(workDirectory);
  const label = zh ? "复制软链接命令" : "Copy symlink command";
  const description = command
    ? zh
      ? "在开发仓库根目录执行一次，即可查看项目的最新需求文档。"
      : "Run once from your repository root to view the latest project documents."
    : zh
      ? "请先在项目配置中设置工作目录。"
      : "Set the working directory in Project settings first.";
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
            aria-label={`${label} · ${title}`}
            data-testid="copy-document-link-command"
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
                data-testid="document-link-command-preview"
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
