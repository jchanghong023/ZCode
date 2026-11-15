import { CheckCircle2, CircleDashed, CircleDot, ClipboardCheck, GitMerge } from "lucide-react";
import { Badge } from "@/components/ui/badge.js";
import { Progress } from "@/components/ui/progress.js";
import { progressLabel, type AIReqProgressStatus } from "../../contract.js";

// 复用主题语义色；待合入／待验收表示等待人工处理，不表示异常或失败。
const progressAppearance = {
  待开发: {
    badge: "bg-tag text-foreground",
    indicator: "bg-foreground-subtle",
    icon: CircleDashed,
  },
  开发中: {
    badge: "bg-progress-surface text-progress-surface-foreground",
    indicator: "bg-progress-surface-foreground",
    icon: CircleDot,
  },
  待合入: {
    badge: "bg-warning-surface text-warning-surface-foreground",
    indicator: "bg-warning",
    icon: GitMerge,
  },
  待验收: {
    badge: "bg-warning-surface text-warning-surface-foreground",
    indicator: "bg-warning",
    icon: ClipboardCheck,
  },
  已完成: {
    badge: "bg-success-surface text-success-surface-foreground",
    indicator: "bg-success",
    icon: CheckCircle2,
  },
} satisfies Record<
  AIReqProgressStatus,
  { badge: string; indicator: string; icon: typeof CircleDot }
>;

export function ProgressStatusBadge({ status }: { status: AIReqProgressStatus }) {
  const appearance = progressAppearance[status];
  const Icon = appearance.icon;
  return (
    <Badge
      variant="secondary"
      className={`gap-1 whitespace-nowrap ${appearance.badge}`}
      data-progress-status={status}
    >
      <Icon aria-hidden="true" />
      {status}
    </Badge>
  );
}

export function ProgressValue({
  value,
  label,
  status,
  source,
  showStatus = true,
}: {
  value: number;
  label: string;
  status: AIReqProgressStatus;
  source?: string;
  showStatus?: boolean;
}) {
  const indicator = (
    <Progress
      value={value}
      aria-label={`${label}进度`}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${status} · ${progressLabel(value)}`}
      className="h-1 min-w-12 flex-1"
      indicatorClassName={progressAppearance[status].indicator}
    />
  );
  const percent = (
    <span className="shrink-0 text-right text-ui-sm">
      <span className="font-mono tabular-nums">{progressLabel(value)}</span>
      {source && <span className="ml-2 text-ui-xs text-foreground-subtle">{source}</span>}
    </span>
  );
  return showStatus ? (
    <div className="min-w-28 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <ProgressStatusBadge status={status} />
        {percent}
      </div>
      {indicator}
    </div>
  ) : (
    <div className="flex min-w-28 items-center gap-2">
      {indicator}
      {percent}
    </div>
  );
}
