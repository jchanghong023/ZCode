import { CircleCheckIcon, CircleXIcon, LoaderCircle } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import type { StepRunStatus } from "@/components/workflow-graph/types.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { RosterCounts } from "./roster-model.js";

/**
 * 阶段名册的两件小零件：计数行与量条。
 */
const COUNT_ORDER: readonly StepRunStatus[] = ["done", "running", "failed", "pending"];

function useCountLabels(counts: RosterCounts): Record<StepRunStatus, string> {
  const { intl } = useZCodeIntl();
  const label = (status: StepRunStatus) =>
    intl.formatMessage(
      { id: `chat.toolCall.workflow.timeline.roster.${status}` },
      { count: counts[status] },
    );
  return {
    done: label("done"),
    failed: label("failed"),
    pending: label("pending"),
    running: label("running"),
  };
}

/** 计数行：`✓ n · ◌ n · ✕ n · ○ n`，为零的项缺席；每项的 title 是整句。 */
export function RosterTally({ className, counts }: { counts: RosterCounts; className?: string }) {
  const labels = useCountLabels(counts);
  return (
    <div
      className={cn(
        "flex h-3.5 items-center gap-2.5 font-mono text-ui-xs leading-none tabular-nums",
        className,
      )}
      data-testid="workflow-roster-tally"
    >
      {COUNT_ORDER.filter((status) => counts[status] > 0).map((status) => (
        <span
          className={cn(
            "flex items-center gap-[3px]",
            status === "done" && "text-success",
            status === "running" && "text-warning",
            status === "failed" && "text-destructive",
            status === "pending" && "text-foreground-subtlest",
          )}
          data-roster-count={status}
          key={status}
          title={labels[status]}
        >
          {status === "done" ? (
            <CircleCheckIcon aria-hidden className="size-2.5" />
          ) : status === "running" ? (
            <LoaderCircle
              aria-hidden
              className="size-2.5 animate-spin motion-reduce:animate-none"
            />
          ) : status === "failed" ? (
            <CircleXIcon aria-hidden className="size-2.5" />
          ) : (
            <span aria-hidden className="size-2 rounded-full border-[1.5px] border-current" />
          )}
          <span className="font-medium">{counts[status]}</span>
        </span>
      ))}
    </div>
  );
}

