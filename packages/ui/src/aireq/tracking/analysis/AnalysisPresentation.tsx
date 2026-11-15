import type { ReactNode } from "react";
import {
  LoaderCircle,
  TriangleAlert,
  CheckCircle2,
  CircleDashed,
  PauseCircle,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import { Badge } from "@/components/ui/badge.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import type {
  AIReqAnalysisRun,
  AIReqAnalysisRunSummary,
  AIReqAnalysisTask,
} from "../../contract.js";

export const taskLabels: Record<AIReqAnalysisTask["state"], string> = {
  waiting: "待分析",
  running: "分析中",
  failed: "失败",
  completed: "已完成",
  paused: "已暂停",
};
export const runLabels: Record<AIReqAnalysisRun["status"], string> = {
  running: "分析中",
  succeeded: "成功",
  failed: "失败",
  skipped: "无变化，已跳过",
};
export const cellClass = "px-3 py-2.5 text-left align-middle";
export const tableClass = "w-full table-fixed text-ui-base";
export const headClass = "sticky top-0 z-10 bg-background text-foreground-subtle";
export function time(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}
export function shortTime(value?: string) {
  return value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
}
export function duration(run: AIReqAnalysisRunSummary) {
  return run.endedAt
    ? `${Math.max(0, Math.round((Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000))} 秒`
    : "执行中";
}
export function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
  disabled,
  className = "w-44",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
export function RowLabel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <ControlHintTooltip title={title}>
        <span
          tabIndex={0}
          className="line-clamp-2 whitespace-normal break-words rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
        >
          {title}
        </span>
      </ControlHintTooltip>
      <ControlHintTooltip title={subtitle}>
        <span
          tabIndex={0}
          className="mt-0.5 block truncate rounded-sm text-ui-sm text-foreground-subtle outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
        >
          {subtitle}
        </span>
      </ControlHintTooltip>
    </div>
  );
}
export function Status({ value, children }: { value: string; children: ReactNode }) {
  // 关键状态文字使用不透明前景色，避免辅助灰字在中性底色上对比度不足。
  const appearance =
    value === "failed"
      ? { icon: TriangleAlert, color: "bg-destructive-surface text-destructive-surface-foreground" }
      : value === "running"
        ? { icon: LoaderCircle, color: "bg-progress-surface text-progress-surface-foreground" }
        : value === "completed" || value === "succeeded"
          ? { icon: CheckCircle2, color: "bg-success-surface text-success-surface-foreground" }
          : value === "paused"
            ? { icon: PauseCircle, color: "bg-tag text-foreground" }
            : value === "skipped"
              ? { icon: SkipForward, color: "bg-tag text-foreground" }
              : { icon: CircleDashed, color: "bg-tag text-foreground" };
  const Icon = appearance.icon;
  return (
    <Badge
      variant="secondary"
      className={`gap-1 whitespace-nowrap font-normal ${appearance.color}`}
    >
      <Icon aria-hidden="true" className={`size-3 ${value === "running" ? "animate-spin" : ""}`} />
      {children}
    </Badge>
  );
}
export function Pagination({
  kind,
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  kind: "task" | "history";
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const label = kind === "task" ? "任务" : "历史";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div
      data-testid={`analysis-${kind}-pagination`}
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-ui-sm"
    >
      <p aria-live="polite" className="tabular-nums text-foreground-subtle">
        共 {total} 条{pages > 1 ? ` · 第 ${page} / ${pages} 页` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          id={`analysis-${kind}-page-size`}
          label={`${label}每页条数`}
          className="w-28"
          value={String(pageSize)}
          onChange={(value) => onPageSize(Number(value))}
        >
          <SelectItem value="25">25 条 / 页</SelectItem>
          <SelectItem value="50">50 条 / 页</SelectItem>
        </FilterSelect>
        {pages > 1 && (
          <nav aria-label={`${label}分页`} className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${label}首页`}
              disabled={page <= 1}
              onClick={() => onPage(1)}
            >
              首页
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`${label}上一页`}
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`${label}下一页`}
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
            >
              下一页
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${label}末页`}
              disabled={page >= pages}
              onClick={() => onPage(pages)}
            >
              末页
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
export function QueryFeedback({
  loading,
  error,
  onRetry,
  hasData = false,
}: {
  loading: boolean;
  error?: string;
  onRetry: () => void;
  hasData?: boolean;
}) {
  // 后台重取保留现有内容；加载／错误块只用于首次读取，避免周期刷新挤动列表。
  if (hasData) return null;
  return loading ? (
    <p role="status" className="px-4 py-3 text-ui-sm text-foreground-subtle">
      正在加载…
    </p>
  ) : error ? (
    <div role="alert" className="flex items-center gap-3 px-4 py-3 text-ui-sm text-destructive">
      <span>{error}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        重试加载
      </Button>
    </div>
  ) : null;
}
export function UpdateFeedback({
  error,
  pending,
  message,
  onRetry,
}: {
  error?: string;
  pending: boolean;
  message: string;
  onRetry: () => void;
}) {
  const text = error ?? (pending ? "正在提交…" : message);
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 text-ui-sm">
      <p
        role={error ? "alert" : "status"}
        aria-live="polite"
        className={`min-w-0 flex-1 truncate ${error ? "text-destructive" : "text-foreground-subtle"}`}
        title={text}
      >
        {text}
      </p>
      {error && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试加载
        </Button>
      )}
    </div>
  );
}
