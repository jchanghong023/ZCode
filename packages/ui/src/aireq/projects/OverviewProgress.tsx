import { Progress } from "@/components/ui/progress.js";
import { progressLabel } from "../contract.js";

export function OverviewProgress({
  percent,
  label,
  zh,
  prominent = false,
}: {
  percent: number | null;
  label: string;
  zh: boolean;
  prominent?: boolean;
}) {
  if (percent === null)
    return (
      <span className="text-ui-sm text-foreground-subtle">
        {zh ? "暂无正式需求" : "No formal requirements"}
      </span>
    );
  if (prominent)
    return (
      <div className="space-y-2">
        <span className="text-ui-xl font-medium tabular-nums">{progressLabel(percent)}</span>
        <Progress
          value={percent}
          aria-label={zh ? `${label}进度` : `${label} progress`}
          aria-valuetext={progressLabel(percent)}
          className="h-1.5 bg-border"
          indicatorClassName="bg-brand"
        />
      </div>
    );
  return (
    <div className="flex min-w-28 items-center gap-2">
      <Progress
        value={percent}
        aria-label={zh ? `${label}进度` : `${label} progress`}
        aria-valuetext={progressLabel(percent)}
        className="h-1.5 min-w-12 flex-1 bg-border"
        indicatorClassName="bg-brand"
      />
      <span className="shrink-0 font-mono text-ui-sm tabular-nums">{progressLabel(percent)}</span>
    </div>
  );
}
