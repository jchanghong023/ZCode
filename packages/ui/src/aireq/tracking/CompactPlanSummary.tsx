import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";

/** 窄分栏的名称列摘要：负责人一行可见，完整人员与计划经展开详情行呈现。 */
export function CompactPlanSummary({
  planKey,
  expanded,
  onToggle,
  developer,
  tester,
  label,
}: {
  planKey: string;
  expanded: boolean;
  onToggle: () => void;
  developer: string;
  tester: string;
  label: string;
}) {
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1 text-ui-sm text-foreground-subtle @min-[640px]/conversation:hidden">
      <span className="min-w-0 truncate" title={`开发：${developer} · 测试：${tester}`}>
        开发：{developer} · 测试：{tester}
      </span>
      <Button
        size="icon-xs"
        variant="ghost"
        className="shrink-0 text-foreground-subtle hover:text-foreground focus-visible:border-remote-foreground-muted"
        aria-label={`${expanded ? "收起" : "展开"}${label}的负责人及计划`}
        aria-expanded={expanded}
        aria-controls={`formal-plan-${planKey}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </Button>
    </div>
  );
}
