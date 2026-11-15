import { MessageResponse, type MessageResponseProps } from "@/components/ai-elements/message.js";
import { cn } from "@/components/lib/utils.js";

/** 材料只读，沿用当前 Markdown 排版与主题，不引入旧主题。 */
export function AIReqMarkdownDocument({ className, ...props }: MessageResponseProps) {
  return (
    <MessageResponse
      {...props}
      showExportActions={false}
      className={cn("min-w-0 break-words text-ui-base", className)}
    />
  );
}
