import { ChevronDown } from "lucide-react";
import type { AIReqAnalysisSnapshot, AIReqProgressScheduler } from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Switch } from "@/components/ui/switch.js";
import { SelectItem } from "@/components/ui/select.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.js";
import {
  MarkdownTableBody,
  MarkdownTableCell,
  MarkdownTableHead,
  MarkdownTableHeader,
  MarkdownTableRow,
} from "@/components/ai-elements/markdown-table.js";
import {
  cellClass,
  tableClass,
  headClass,
  FilterSelect,
  time,
  shortTime,
  runLabels,
} from "./AnalysisPresentation.js";

const presets = [15, 30, 60, 120];

export function analysisIntervalMinutes(value: string, currentTime?: string): number | undefined {
  const minutes = Number(value);
  return /^\d+$/.test(value) &&
    Number.isSafeInteger(minutes) &&
    minutes >= 1 &&
    Number.isFinite(
      new Date(Date.parse(currentTime ?? new Date().toISOString()) + minutes * 60_000).getTime(),
    )
    ? minutes
    : undefined;
}

export function AnalysisSettings({
  snapshot,
  scheduler,
  onOpenModelSettings,
  projectSearch,
  setProjectSearch,
  interval,
  setInterval,
  pending,
  message,
  mutate,
}: {
  snapshot: AIReqAnalysisSnapshot;
  scheduler: AIReqProgressScheduler;
  onOpenModelSettings(): void;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  interval: string;
  setInterval: (value: string) => void;
  pending: boolean;
  message: string;
  mutate: (action: () => void | Promise<void>, success: string) => Promise<boolean>;
}) {
  const minutes = Number(interval);
  const positiveInterval = /^\d+$/.test(interval) && Number.isSafeInteger(minutes) && minutes >= 1;
  const validInterval = analysisIntervalMinutes(interval, snapshot.currentTime) !== undefined;
  const visibleProjects = snapshot.projects.filter((project) =>
    `${project.id} ${project.name}`.toLowerCase().includes(projectSearch.toLowerCase()),
  );
  return (
    <div className="min-w-0 space-y-6" data-testid="aireq-analysis-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="analysis-enabled" className="text-ui-base">
            全局自动分析
          </Label>
          <p className="text-ui-sm text-foreground-subtle">
            全局及项目开关立即保存；统一间隔修改后点击保存。
          </p>
        </div>
        <Switch
          id="analysis-enabled"
          checked={snapshot.enabled}
          disabled={pending}
          onCheckedChange={(enabled) =>
            void mutate(
              () => scheduler.configure(enabled, snapshot.intervalMinutes),
              `全局自动分析已${enabled ? "开启" : "暂停"}。`,
            )
          }
        />
      </div>
      <Collapsible
        defaultOpen
        aria-labelledby="analysis-projects-title"
        className="overflow-hidden rounded-lg border border-border"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="group/analysis-toggle h-auto w-full justify-between rounded-none px-4 py-3"
          >
            <span
              id="analysis-projects-title"
              className="flex items-center gap-2 text-ui-base font-medium"
            >
              项目分析范围
              <span className="text-ui-sm font-normal text-foreground-subtle">
                {snapshot.projects.filter((project) => project.enabled).length} /{" "}
                {snapshot.projects.length} 已开启
              </span>
            </span>
            {/* 由原生折叠状态驱动箭头，不维护重复的展开状态。 */}
            <ChevronDown className="size-4 text-foreground-subtle transition-transform group-data-[state=open]/analysis-toggle:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-3">
            <Label htmlFor="analysis-project-search" className="sr-only">
              搜索项目
            </Label>
            <Input
              id="analysis-project-search"
              className="h-8 max-w-sm"
              placeholder="搜索项目名称"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-auto">
            <table className={`${tableClass} min-w-[640px]`}>
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-24" />
                <col className="w-28" />
                <col className="w-36" />
                <col />
              </colgroup>
              <MarkdownTableHeader className={headClass}>
                <MarkdownTableRow className="border-y border-border">
                  <MarkdownTableHead className={`${cellClass} font-medium text-foreground-subtle`}>
                    项目
                  </MarkdownTableHead>
                  <MarkdownTableHead className={`${cellClass} font-medium text-foreground-subtle`}>
                    自动分析
                  </MarkdownTableHead>
                  <MarkdownTableHead className={`${cellClass} font-medium text-foreground-subtle`}>
                    待分析 SR
                  </MarkdownTableHead>
                  <MarkdownTableHead className={`${cellClass} font-medium text-foreground-subtle`}>
                    最近分析
                  </MarkdownTableHead>
                  <MarkdownTableHead className={`${cellClass} font-medium text-foreground-subtle`}>
                    状态
                  </MarkdownTableHead>
                </MarkdownTableRow>
              </MarkdownTableHeader>
              <MarkdownTableBody>
                {visibleProjects.map((project) => (
                  <MarkdownTableRow
                    key={project.id}
                    className="border-b border-border last:border-0"
                  >
                    <MarkdownTableCell className={cellClass}>{project.name}</MarkdownTableCell>
                    <MarkdownTableCell className={cellClass}>
                      <Switch
                        checked={project.enabled}
                        disabled={pending}
                        aria-label={`启用${project.name}进度分析`}
                        onCheckedChange={(enabled) =>
                          mutate(
                            () => scheduler.setProjectEnabled(project.id, enabled),
                            `已${enabled ? "启用" : "停用"}“${project.name}”的自动分析。`,
                          )
                        }
                      />
                    </MarkdownTableCell>
                    <MarkdownTableCell className={`${cellClass} tabular-nums`}>
                      {project.pendingCount}
                    </MarkdownTableCell>
                    <MarkdownTableCell
                      className={`${cellClass} whitespace-nowrap tabular-nums`}
                      title={time(project.lastRunAt)}
                    >
                      {shortTime(project.lastRunAt)}
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cellClass}>
                      {project.runningCount
                        ? `${project.runningCount} 个分析中`
                        : !project.enabled
                          ? "已关闭"
                          : !snapshot.enabled
                            ? "全局暂停"
                            : project.lastStatus
                              ? runLabels[project.lastStatus]
                              : "等待首次分析"}
                    </MarkdownTableCell>
                  </MarkdownTableRow>
                ))}
              </MarkdownTableBody>
            </table>
          </div>
          {!visibleProjects.length && (
            <p className="px-4 py-3 text-ui-sm text-foreground-subtle">没有匹配项目。</p>
          )}
        </CollapsibleContent>
      </Collapsible>
      <section
        aria-labelledby="analysis-schedule-title"
        className="min-w-0 overflow-hidden rounded-lg border border-border"
      >
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="group/analysis-toggle h-auto w-full justify-between px-4 py-3"
            >
              <span id="analysis-schedule-title">调度设置</span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]/analysis-toggle:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 border-b border-border bg-surface p-4 text-ui-sm">
              <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (validInterval)
                    mutate(
                      () => scheduler.configure(snapshot.enabled, minutes),
                      "全局间隔已保存。",
                    );
                }}
              >
                <Label htmlFor="analysis-minutes">统一间隔</Label>
                <FilterSelect
                  id="analysis-interval-preset"
                  label="间隔预设"
                  className="w-32"
                  value={presets.includes(minutes) ? String(minutes) : "custom"}
                  onChange={(value) => {
                    setInterval(value === "custom" ? "" : value);
                  }}
                >
                  <SelectItem value="custom">自定义</SelectItem>
                  {presets.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} 分钟
                    </SelectItem>
                  ))}
                </FilterSelect>
                <Input
                  id="analysis-minutes"
                  type="number"
                  min="1"
                  step="1"
                  value={interval}
                  onChange={(event) => setInterval(event.target.value)}
                  aria-invalid={!validInterval}
                  aria-describedby="analysis-interval-help"
                  className="h-9 w-24"
                />
                <span>分钟</span>
                <Button
                  size="sm"
                  type="submit"
                  disabled={pending || !validInterval || minutes === snapshot.intervalMinutes}
                >
                  保存间隔
                </Button>
                {/* 原版此处可直接进入角色模型配置，静态说明会丢失设置操作入口。 */}
                <Button
                  variant="link"
                  size="sm"
                  type="button"
                  disabled={pending}
                  onClick={onOpenModelSettings}
                >
                  查看 Agent 模型配置
                </Button>
              </form>
              <p id="analysis-interval-help" className="text-foreground-subtle">
                所有 SR
                共用间隔；项目开关立即保存。关闭自动调度不取消在途分析，仍可手动分析已开启项目。
                {!validInterval && (
                  <span role="alert" className="text-destructive">
                    {positiveInterval
                      ? "间隔超出可表示的日期范围，请使用更小的分钟数。"
                      : "请输入正整数分钟数。"}
                  </span>
                )}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>
      <p role="status" aria-live="polite" className="text-ui-sm text-foreground-subtle">
        {pending ? "正在提交…" : message}
      </p>
    </div>
  );
}
