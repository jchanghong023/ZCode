import { ChevronDown } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import type { AIReqAnalysisSnapshot, AIReqProgressScheduler } from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Switch } from "@/components/ui/switch.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsSearchTargetContext } from "@/settings-search/index.js";
import { AIReqSettingsTarget } from "../../settings/AIReqSettingsTarget.js";
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
  focusProjectId,
  currentProjectId,
  interval,
  setInterval,
  pending,
  mutate,
}: {
  snapshot: AIReqAnalysisSnapshot;
  scheduler: AIReqProgressScheduler;
  onOpenModelSettings(): void;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  focusProjectId?: string;
  currentProjectId?: string;
  interval: string;
  setInterval: (value: string) => void;
  pending: boolean;
  mutate: (action: () => void | Promise<void>, success: string) => Promise<boolean>;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const target = useContext(SettingsSearchTargetContext);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(true);
  // 仅记录输入方式；分钟值仍唯一来自父组件草稿，避免切换自定义时丢失当前间隔。
  const [customInterval, setCustomInterval] = useState(false);
  useEffect(() => {
    // 搜索目标可能位于用户刚折叠的分区；先展开，目标区域才可见。
    if (target?.id === "aireq.analysis.projects") setProjectsOpen(true);
    if (target?.id === "aireq.analysis.interval") setScheduleOpen(true);
  }, [target]);
  useEffect(() => {
    if (focusProjectId) setProjectsOpen(true);
  }, [focusProjectId]);
  const minutes = Number(interval);
  const showCustomInterval = customInterval || !presets.includes(minutes);
  const positiveInterval = /^\d+$/.test(interval) && Number.isSafeInteger(minutes) && minutes >= 1;
  const validInterval = analysisIntervalMinutes(interval, snapshot.currentTime) !== undefined;
  const visibleProjects = snapshot.projects.filter((project) =>
    `${project.id} ${project.name}`.toLowerCase().includes(projectSearch.toLowerCase()),
  );
  if (focusProjectId) {
    // 定位只改变展示次序，不修改服务端项目范围或全局开关。
    visibleProjects.sort(
      (left, right) => Number(right.id === focusProjectId) - Number(left.id === focusProjectId),
    );
  }
  return (
    <div className="min-w-0 space-y-8" data-testid="aireq-analysis-settings">
      <AIReqSettingsTarget
        id="aireq.analysis.enabled"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="space-y-1">
          <Label htmlFor="analysis-enabled" className="text-ui-base">
            {zh ? "全局自动分析" : "Global automatic analysis"}
          </Label>
          <p className="text-ui-sm text-foreground-subtle">
            {zh
              ? "团队共享 · 开关即时保存，间隔需手动保存。"
              : "Shared by the team · Switches save immediately; save the interval manually."}
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
      </AIReqSettingsTarget>
      <details className="text-ui-sm leading-6 text-remote-foreground-muted">
        <summary className="w-fit cursor-pointer rounded-sm border border-transparent hover:text-foreground focus-visible:border-remote-foreground-muted">
          {zh ? "自动分析说明" : "About automatic analysis"}
        </summary>
        <p className="pt-3">
          {zh
            ? "全局关闭仅暂停自动分析；项目关闭同时停止接纳自动与手动分析。关闭开关不取消已接纳的分析，也不删除历史。"
            : "Turning off the global switch pauses automatic analysis only. Turning off a project stops new automatic and manual analyses. Neither switch cancels accepted runs or removes history."}
        </p>
      </details>
      <AIReqSettingsTarget id="aireq.analysis.projects">
        <Collapsible
          open={projectsOpen}
          onOpenChange={setProjectsOpen}
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
                placeholder={zh ? "搜索项目名称" : "Search project name"}
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
              />
              <p className="mt-2 text-ui-sm text-foreground-subtle">
                {zh
                  ? "待分析 SR 统计项目全部 Release。"
                  : "Pending SRs count across all releases of the project."}
              </p>
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
                    <MarkdownTableHead
                      className={`${cellClass} font-medium text-foreground-subtle`}
                    >
                      项目
                    </MarkdownTableHead>
                    <MarkdownTableHead
                      className={`${cellClass} font-medium text-foreground-subtle`}
                    >
                      {zh ? "自动／手动分析" : "Automatic / manual analysis"}
                    </MarkdownTableHead>
                    <MarkdownTableHead
                      className={`${cellClass} font-medium text-foreground-subtle`}
                    >
                      {zh ? "待分析 SR" : "Pending SRs"}
                    </MarkdownTableHead>
                    <MarkdownTableHead
                      className={`${cellClass} font-medium text-foreground-subtle`}
                    >
                      最近分析
                    </MarkdownTableHead>
                    <MarkdownTableHead
                      className={`${cellClass} font-medium text-foreground-subtle`}
                    >
                      状态
                    </MarkdownTableHead>
                  </MarkdownTableRow>
                </MarkdownTableHeader>
                <MarkdownTableBody>
                  {visibleProjects.map((project) => (
                    <MarkdownTableRow
                      key={project.id}
                      className={`border-b border-border last:border-0 ${project.id === focusProjectId ? "bg-selected" : ""}`}
                    >
                      <MarkdownTableCell className={cellClass}>
                        {project.name}
                        {project.id === currentProjectId && (
                          <span className="ml-2 text-ui-xs text-foreground-subtle">
                            {locale === "zh-CN" ? "当前项目" : "Current project"}
                          </span>
                        )}
                      </MarkdownTableCell>
                      <MarkdownTableCell className={cellClass}>
                        <Switch
                          checked={project.enabled}
                          disabled={pending}
                          aria-label={
                            zh
                              ? `${project.name}的自动与手动分析`
                              : `Automatic and manual analysis for ${project.name}`
                          }
                          onCheckedChange={(enabled) =>
                            mutate(
                              () => scheduler.setProjectEnabled(project.id, enabled),
                              zh
                                ? `已${enabled ? "开启" : "关闭"}“${project.name}”的自动与手动分析。`
                                : `${enabled ? "Enabled" : "Disabled"} automatic and manual analysis for ${project.name}.`,
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
      </AIReqSettingsTarget>
      <section
        aria-labelledby="analysis-schedule-title"
        className="min-w-0 overflow-hidden rounded-lg border border-border"
      >
        <AIReqSettingsTarget id="aireq.analysis.interval">
          <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="group/analysis-toggle h-auto w-full justify-between px-4 py-3"
              >
                <span id="analysis-schedule-title">{zh ? "调度设置" : "Schedule settings"}</span>
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
                  <span className="text-ui-base font-medium">
                    {zh ? "统一间隔" : "Shared interval"}
                  </span>
                  <FilterSelect
                    id="analysis-interval-preset"
                    label={zh ? "统一间隔" : "Shared interval"}
                    className="w-32"
                    value={showCustomInterval ? "custom" : String(minutes)}
                    onChange={(value) => {
                      setCustomInterval(value === "custom");
                      if (value !== "custom") setInterval(value);
                    }}
                  >
                    <SelectItem value="custom">{zh ? "自定义" : "Custom"}</SelectItem>
                    {presets.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {zh ? `${value} 分钟` : `${value} minutes`}
                      </SelectItem>
                    ))}
                  </FilterSelect>
                  {showCustomInterval && (
                    <div className="flex items-center gap-2">
                      <Input
                        id="analysis-minutes"
                        type="number"
                        min="1"
                        step="1"
                        value={interval}
                        onChange={(event) => setInterval(event.target.value)}
                        aria-label={zh ? "自定义间隔（分钟）" : "Custom interval (minutes)"}
                        aria-invalid={!validInterval}
                        aria-describedby="analysis-interval-help"
                        className="h-9 w-24"
                      />
                      <span>{zh ? "分钟" : "minutes"}</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    type="submit"
                    disabled={pending || !validInterval || minutes === snapshot.intervalMinutes}
                  >
                    {zh ? "保存间隔" : "Save interval"}
                  </Button>
                </form>
                <p id="analysis-interval-help" className="text-foreground-subtle">
                  {zh
                    ? "所有项目的开发单元共用此间隔。"
                    : "Development units in all projects share this interval."}
                  {!validInterval && (
                    <span role="alert" className="text-destructive">
                      {positiveInterval
                        ? zh
                          ? "间隔过大，请使用更小的分钟数。"
                          : "The interval is too large. Enter fewer minutes."
                        : zh
                          ? "请输入正整数分钟数。"
                          : "Enter a positive whole number of minutes."}
                    </span>
                  )}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  type="button"
                  disabled={pending}
                  onClick={onOpenModelSettings}
                >
                  {zh ? "配置进度分析 Agent 模型" : "Configure the Progress Analysis Agent model"}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </AIReqSettingsTarget>
      </section>
    </div>
  );
}
