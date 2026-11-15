import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import type { BranchCopyProps } from "./contract.js";

export function BranchCopy({ branch, onMessage, compact = false }: BranchCopyProps) {
  const [copiedBranch, setCopiedBranch] = useState<string>();
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  if (!branch?.trim())
    return (
      <span role="alert" className="text-ui-sm text-destructive">
        开发分支缺失
      </span>
    );
  const copied = copiedBranch === branch;
  // 表格内部滚动时，sr-only 状态必须定位在自身容器内，避免绝对定位越过滚动裁剪撑高页面。
  return (
    <span
      className="relative block min-w-0"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ControlHintTooltip
        title={branch}
        description={copied ? "已复制完整分支名" : "复制平台映射的完整分支名"}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          title={branch}
          className={`h-8 w-full min-w-0 justify-start gap-1 px-0 text-ui-sm ${compact ? "" : "font-mono"}`}
          aria-label={`复制分支 ${branch}`}
          onClick={async (event) => {
            event.stopPropagation();
            setPending(true);
            try {
              await navigator.clipboard.writeText(branch);
              setCopiedBranch(branch);
              const message = `已复制分支：${branch}`;
              setFeedback(message);
              onMessage(message);
            } catch (cause) {
              setCopiedBranch(undefined);
              const message = `复制分支失败：${cause instanceof Error ? cause.message : String(cause)}`;
              setFeedback(message);
              onMessage(message);
            } finally {
              setPending(false);
            }
          }}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {compact ? (copied ? "已复制" : "复制分支") : branch}
          </span>
          {copied ? (
            <Check aria-hidden="true" className="size-3 shrink-0" />
          ) : (
            <Copy aria-hidden="true" className="size-3 shrink-0" />
          )}
        </Button>
      </ControlHintTooltip>
      <span className="sr-only" role="status" aria-live="polite">
        {feedback}
      </span>
    </span>
  );
}
