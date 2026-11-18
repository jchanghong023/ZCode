import { Progress } from "@/components/ui/progress.js";
import { progressLabel } from "../contract.js";

export function OverviewProgress({
  percent,
  formalCount,
  label,
  zh,
  prominent = false,
}: {
  percent: number | null;
  formalCount: number;
  label: string;
  zh: boolean;
  prominent?: boolean;
}) {
  if (percent === null)
    return (
      <span
        className={prominent ? "text-ui-sm text-foreground" : "text-ui-sm text-foreground-subtle"}
      >
        {/* null 表示没有可统计的 SR；不能与未分析的 0% 或读取失败混为一谈。 */}
        {formalCount === 0
          ? zh
            ? "暂无正式需求"
            : "No formal requirements yet"
          : zh
            ? "暂无开发单元"
            : "No development units yet"}
      </span>
    );
  if (prominent)
    return (
      <div className="space-y-2">
        <span className="block text-ui-sm text-foreground">
          {zh ? "正式开发任务进度" : "Formal task progress"}
        </span>
        {/* 进度条已提供同一百分比，避免版本按钮的辅助说明重复朗读。 */}
        <span aria-hidden="true" className="text-ui-xl font-medium tabular-nums">
          {progressLabel(percent)}
        </span>
        <Progress
          value={percent}
          aria-label={zh ? `${label}进度` : `${label} progress`}
          aria-valuetext={progressLabel(percent)}
          className="h-1.5 bg-border"
          indicatorClassName="bg-brand duration-250 ease-out motion-reduce:transition-none"
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
        indicatorClassName="bg-brand duration-250 ease-out motion-reduce:transition-none"
      />
      {/* 数值位数曾挤压进度槽，让 99% 看起来比 100% 更长；固定数字区后同列使用同一标尺。 */}
      <span className="w-12 shrink-0 text-right font-mono text-ui-sm tabular-nums">
        {progressLabel(percent)}
      </span>
    </div>
  );
}
