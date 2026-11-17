// ============================================================
// 命令输出的尾巴
// ============================================================
// 收起的 Terminal 卡下面展示调用方提供的正文最后三行。

import { memo, useMemo } from "react";
import type { V4ConversationWorkflowRunNodeResultResult } from "@zcode/shared/zcode-protocol-v4";
import { cn } from "@/components/lib/utils.js";
import { peekLinesOf } from "@/app-shell/workflowWorkspaceLogbook.js";

export const WorkspacePeek = memo(function WorkspacePeek({
  result,
}: {
  result: V4ConversationWorkflowRunNodeResultResult | null;
}) {
  const lines = useMemo(
    () => (result?.result === undefined ? [] : peekLinesOf(result.result)),
    [result],
  );

  return (
    <div
      className={cn(
        lines.length === 0
          ? "h-0 overflow-hidden"
          : "wf-ws-peek mt-1 overflow-hidden whitespace-pre rounded-[7px] bg-panel px-2.5 py-[7px] font-mono text-ui-sm leading-[17px] text-foreground-subtle",
      )}
      data-testid="workflow-workspace-peek"
      data-ws-body
    >
      {lines.map((line, index) => (
        <span className={cn("block", line.error && "text-destructive")} key={index}>
          {line.text}
        </span>
      ))}
    </div>
  );
});
