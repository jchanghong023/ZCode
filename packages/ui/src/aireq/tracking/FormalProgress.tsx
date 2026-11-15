import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  PanelRightClose,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import {
  MarkdownTableBody,
  MarkdownTableCell,
  MarkdownTableHead,
  MarkdownTableHeader,
  MarkdownTableRow,
} from "@/components/ai-elements/markdown-table.js";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { cn } from "@/components/lib/utils.js";
import { SETTINGS_FRAME_CONTENT_CLASSNAME } from "@/settings/SettingsPageParts.js";
import { AIReqMaterialsPane } from "../proposals/AIReqWorkbench.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqEditPlanning } from "./RequirementPlanning.js";
import { irPlanning, planningDate, planningWarnings } from "../contract.js";
import {
  irProgress,
  irProgressStatus,
  irSrs,
  PROGRESS_STATUSES,
  srProgress,
  srProgressStatus,
} from "../contract.js";
import type { AIReqRequirementGroup, AIReqSystemRequirement } from "../contract.js";
import { BranchCopy } from "./BranchCopy.js";
import { TrackingTableScroll } from "./TrackingTableScroll.js";
import { AIReqFormalReport } from "./formal/FormalReport.js";
import { ProgressValue } from "./formal/ProgressDisplay.js";

// 表格始终由工作区固定挂载；筛选、展开和复制反馈留在本 owner，切行仅更新右侧报告。
export function AIReqFormalTable() {
  const aireq = useAIReq()!;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [filteredExpansion, setFilteredExpansion] = useState<Record<string, boolean>>({});
  const [copyMessage, setCopyMessage] = useState("");
  const view = aireq.view;
  if (!view)
    return (
      <div className="space-y-3 p-6 text-ui-base">
        <p role={aireq.error ? "alert" : "status"}>{aireq.error ?? "正在读取正式需求…"}</p>
        {aireq.error && (
          <Button variant="outline" disabled={aireq.pending} onClick={() => void aireq.refresh()}>
            重试
          </Button>
        )}
      </div>
    );
  const groups = view.groups.filter(
    (group) => group.projectId === aireq.selection.projectId && (!aireq.releaseId || group.releaseId === aireq.releaseId),
  );
  const normalized = query.trim().toLocaleLowerCase();
  const open = (group: AIReqRequirementGroup, sr?: AIReqSystemRequirement) =>
    aireq.select({
      projectId: group.projectId,
      irId: group.id,
      srId: sr?.id,
      formalView: "detail",
    });
  const matches = (id: string, title: string) =>
    !normalized || `${id} ${title}`.toLocaleLowerCase().includes(normalized);
  const visible = groups.filter((group) => {
    const rows = irSrs(view, group);
    return (
      (matches(group.id, group.originalText ?? group.title) || rows.some((sr) => matches(sr.id, sr.title))) &&
      (status === "all" ||
        irProgressStatus(rows) === status ||
        rows.some((sr) => srProgressStatus(sr) === status))
    );
  });
  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background [scrollbar-gutter:stable]"
      data-testid="aireq-formal-table"
    >
      {/* 修复：AIReq 固定显示主导航，此处仅保留原版 48px 空白顶栏。 */}
      <div className="h-12 shrink-0" />
      {/* 与 base 表格式页面一致：外层纵向滚动，内层只负责限宽居中。 */}
      <div className={cn(SETTINGS_FRAME_CONTENT_CLASSNAME, "min-w-0 pt-4 md:pt-6")}>
        <header className="shrink-0 space-y-5">
          <div className="space-y-2">
            <h1 className="text-ui-page-title font-medium tracking-[0.114px]">正式需求</h1>
            <p className="text-ui-sm text-foreground-subtle">
              查看 IR 与 SR 的开发进度、问题和人员计划，选择需求阅读同页报告。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle" />
              <Input
                className="h-9 rounded-lg bg-surface pl-9"
                aria-label="搜索正式需求"
                placeholder="搜索 IR／SR 名称或编号"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select value={aireq.selection.projectId ?? ""} onValueChange={(id) => aireq.navigate(() => aireq.switchProject(id))}>
              <SelectTrigger className="h-9 w-36 rounded-lg bg-surface" aria-label="正式需求项目">
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent>
                {view.projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={aireq.releaseId || "all"} onValueChange={(value) => aireq.navigate(() => aireq.setReleaseId(value === "all" ? "" : value))}>
              <SelectTrigger className="h-9 w-40 rounded-lg bg-surface" aria-label="正式需求版本">
                <SelectValue placeholder="选择版本" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部 Release</SelectItem>
                {view.releases.filter((item) => item.projectId === aireq.selection.projectId).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-28 rounded-lg bg-surface" aria-label="筛选开发状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {PROGRESS_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(normalized || status !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </header>
        <TrackingTableScroll
          label="正式需求表格滚动区域"
          className="mt-4 rounded-xl border border-border bg-surface"
          viewportTestId="formal-table-scroll"
        >
          <table
            className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 bg-background text-ui-base"
            aria-label="正式需求 IR SR 开发进度表"
          >
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[24%]" />
              <col />
              <col className="w-14" />
            </colgroup>
            <MarkdownTableHeader className="bg-surface">
              <MarkdownTableRow className="hover:bg-transparent">
                {["原始需求／SR 与 Release", "状态、进度与最新审查", "负责人及计划", "操作"].map((title, index) => (
                  <MarkdownTableHead
                    key={title}
                    scope="col"
                    className={`h-10 min-w-0 whitespace-nowrap px-4 font-normal text-ui-sm text-foreground-subtle ${index === 0 ? "sticky left-0 z-30 bg-background" : ""}`}
                    // surface 含透明度：固定首列需一次性合成不透明底色，不能透出横滚后的内容。
                    style={
                      index === 0
                        ? {
                            backgroundImage:
                              "linear-gradient(var(--color-surface), var(--color-surface))",
                          }
                        : undefined
                    }
                  >
                    {title}
                  </MarkdownTableHead>
                ))}
              </MarkdownTableRow>
            </MarkdownTableHeader>
            <MarkdownTableBody>
              {visible.map((group) => {
                const srs = irSrs(view, group);
                const groupMatches = matches(group.id, group.originalText ?? group.title);
                const children = srs.filter(
                  (sr) =>
                    (groupMatches || matches(sr.id, sr.title)) &&
                    (status === "all" ||
                      irProgressStatus(srs) === status ||
                      srProgressStatus(sr) === status),
                );
                const expansionKey = JSON.stringify([
                  group.projectId,
                  group.id,
                  normalized,
                  status,
                ]);
                const filteringChildren = Boolean(normalized) || status !== "all";
                const showChildren = filteringChildren
                  ? (filteredExpansion[expansionKey] ?? true)
                  : expanded.has(group.id);
                const selected = aireq.selection.irId === group.id && !aireq.selection.srId;
                const plan = irPlanning(srs);
                const developers = [
                  ...new Set(
                    srs.flatMap((sr) =>
                      sr.developerEmployeeId ? [sr.developerEmployeeId] : [],
                    ),
                  ),
                ];
                const issues = srs.flatMap((sr) => sr.progress?.issues ?? []);
                const warnings = srs.flatMap((sr) => planningWarnings(view, sr));
                const missingBranches = srs.filter((sr) => !sr.trackingBranch?.name?.trim()).length;
                // 主题行色含透明度：固定列在不透明底色上叠加同一行色，避免滚动透字和双层选中色。
                return (
                  <Fragment key={group.id}>
                    <MarkdownTableRow
                      data-ir-id={group.id}
                      aria-selected={selected}
                      className={`group/row cursor-pointer ${selected ? "bg-selected hover:bg-selected [--formal-row-fill:var(--color-selected)]" : "bg-surface hover:bg-hover [--formal-row-fill:var(--color-surface)] hover:[--formal-row-fill:var(--color-hover)]"}`}
                      onClick={() => open(group)}
                    >
                      <MarkdownTableCell
                        className="sticky left-0 z-10 bg-background px-4 py-3 align-middle"
                        style={{
                          backgroundImage:
                            "linear-gradient(var(--formal-row-fill), var(--formal-row-fill))",
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`${showChildren ? "收起" : "展开"}${group.title}的SR`}
                            aria-expanded={showChildren}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (filteringChildren) {
                                setFilteredExpansion((current) => ({
                                  ...current,
                                  [expansionKey]: !showChildren,
                                }));
                              } else {
                                setExpanded((current) => {
                                  const next = new Set(current);
                                  if (next.has(group.id)) next.delete(group.id);
                                  else next.add(group.id);
                                  return next;
                                });
                              }
                            }}
                          >
                            {showChildren ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                          <FileText className="mt-1 size-4 shrink-0 text-foreground-subtle" />
                          <div className="min-w-0 flex-1">
                            <ControlHintTooltip title={group.originalText ?? group.title}>
                              <Button
                                variant="link"
                                className="h-auto w-full max-w-full justify-start p-0 text-left font-medium whitespace-normal [overflow-wrap:anywhere]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  open(group);
                                }}
                              >
                                <span className="line-clamp-2">{group.originalText ?? group.title}</span>
                              </Button>
                            </ControlHintTooltip>
                            <p className="mt-1 break-all text-ui-sm text-foreground-subtle">
                              IR · {group.id} · {srs.filter((sr) => srProgress(sr) === 100).length}/
                              {srs.length} SR 完成
                              {" · "}{view.releases.find((release) => release.id === group.releaseId)?.title ?? group.releaseId}
                            </p>
                          </div>
                        </div>
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-4 py-3 align-middle">
                        <ProgressValue
                          value={irProgress(srs)}
                          label={group.title}
                          status={irProgressStatus(srs)}
                        />
                        <IssueCount issues={issues} />
                        {missingBranches > 0 && (
                          <p className="mt-1 text-ui-sm text-destructive">
                            开发分支缺失：{missingBranches} 项
                          </p>
                        )}
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-4 py-3 align-middle">
                        <ControlHintTooltip title={developers.join("、") || "暂无开发人员"}>
                          <p
                            tabIndex={0}
                            className="line-clamp-2 rounded-sm text-ui-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            开发：{developers.join("、") || "未分配"}
                          </p>
                        </ControlHintTooltip>
                        <PlanRange start={plan.plannedStart} end={plan.plannedEnd} />
                        {plan.incomplete && (
                          <p className="text-ui-sm text-foreground-subtle">部分未排期</p>
                        )}
                        <PlanningAlert warnings={warnings} />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="min-w-0 px-4 py-3 align-middle">
                        <FormalActions
                          group={group}
                          onDetail={() => open(group)}
                          onMessage={setCopyMessage}
                        />
                      </MarkdownTableCell>
                    </MarkdownTableRow>
                    {showChildren &&
                      children.map((sr) => {
                        const warnings = planningWarnings(view, sr);
                        return (
                          <MarkdownTableRow
                            key={sr.id}
                            data-sr-id={sr.id}
                            aria-selected={
                              aireq.selection.irId === group.id && aireq.selection.srId === sr.id
                            }
                            className={`group/row cursor-pointer ${aireq.selection.irId === group.id && aireq.selection.srId === sr.id ? "bg-selected hover:bg-selected [--formal-row-fill:var(--color-selected)]" : "bg-surface hover:bg-hover [--formal-row-fill:var(--color-surface)] hover:[--formal-row-fill:var(--color-hover)]"}`}
                            onClick={() => open(group, sr)}
                          >
                            <MarkdownTableCell
                              className="sticky left-0 z-10 bg-background pr-4 pl-12 py-3 align-middle"
                              style={{
                                backgroundImage:
                                  "linear-gradient(var(--formal-row-fill), var(--formal-row-fill))",
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <FileText className="mt-1 size-4 shrink-0 text-foreground-subtle" />
                                <div className="min-w-0 flex-1">
                                  <ControlHintTooltip title={sr.title}>
                                    <Button
                                      variant="link"
                                      className="h-auto w-full max-w-full justify-start p-0 text-left font-medium whitespace-normal [overflow-wrap:anywhere]"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        open(group, sr);
                                      }}
                                    >
                                      <span className="line-clamp-2">{sr.title}</span>
                                    </Button>
                                  </ControlHintTooltip>
                                  <p className="mt-1 break-all text-ui-sm text-foreground-subtle">
                                    SR · {sr.id}
                                  </p>
                                </div>
                              </div>
                            </MarkdownTableCell>
                            <MarkdownTableCell className="px-4 py-3 align-middle">
                              <ProgressValue
                                value={srProgress(sr)}
                                label={sr.title}
                                status={srProgressStatus(sr)}
                              />
                              <IssueCount issues={sr.progress?.issues ?? []} />
                              <p className="mt-1 line-clamp-2 text-ui-sm text-foreground-subtle">
                                最新审查：{sr.progress ? sr.progress.issues[0]?.title ?? "当前报告无阻断问题" : "尚未分析"}
                              </p>
                              {sr.lastAnalysisFailure && <p className="text-ui-sm text-destructive">最近分析失败，保留旧报告</p>}
                              {sr.progress?.stale && <p className="text-ui-sm text-foreground-subtle">报告已过期，等待当前版本分析</p>}
                              <p className="break-all text-ui-sm text-foreground-subtle">
                                {sr.trackingBranch?.name ?? "分支缺失"}{sr.trackingBranch?.status === "deleted" ? "（已清理，模拟）" : ""}
                              </p>
                              {sr.trackingBranch?.error && <p className="text-ui-sm text-destructive">{sr.trackingBranch.error}</p>}
                              {!sr.trackingBranch?.name?.trim() && (
                                <p role="alert" className="mt-1 text-ui-sm text-destructive">
                                  开发分支缺失
                                </p>
                              )}
                            </MarkdownTableCell>
                            <MarkdownTableCell className="px-4 py-3 align-middle">
                              <p className="break-words text-ui-sm">
                                开发：{sr.developerEmployeeId ?? "待认领"} · 测试：{sr.testingEmployeeId ?? "待认领"}
                              </p>
                              <PlanRange
                                start={sr.planning?.plannedStart}
                                end={sr.planning?.plannedEnd}
                              />
                              <PlanningAlert warnings={warnings} />
                            </MarkdownTableCell>
                            <MarkdownTableCell className="min-w-0 px-4 py-3 align-middle">
                              <FormalActions
                                group={group}
                                sr={sr}
                                onDetail={() => open(group, sr)}
                                onMessage={setCopyMessage}
                              />
                            </MarkdownTableCell>
                          </MarkdownTableRow>
                        );
                      })}
                  </Fragment>
                );
              })}
            </MarkdownTableBody>
          </table>
          {!visible.length && (
            <p role="status" className="py-12 text-center text-ui-sm text-foreground-subtle">
              {!aireq.selection.projectId
                ? "请先选择项目。"
                : !view.releases.length
                  ? "当前项目尚无 Release，请在设置中创建。"
                  : groups.length
                    ? "没有符合条件的需求。"
                    : "当前范围暂无正式需求。"}
            </p>
          )}
        </TrackingTableScroll>
        <div
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-sm text-foreground-subtle"
          data-testid="formal-counts"
        >
          <span className="whitespace-nowrap font-medium text-foreground">
            {visible.length} 个 IR
          </span>
          <span>
            当前 Release 共 {groups.length} 个 IR ·{" "}
            {groups.reduce((count, group) => count + irSrs(view, group).length, 0)} 个 SR
          </span>
        </div>
        <div className="flex h-8 shrink-0 items-center gap-2 text-ui-sm">
          <p
            role={aireq.error ? "alert" : "status"}
            aria-live="polite"
            className={`min-w-0 flex-1 truncate ${aireq.error ? "text-destructive" : "text-foreground-subtle"}`}
            title={aireq.error ?? copyMessage}
          >
            {aireq.error ?? copyMessage}
          </p>
          {aireq.error && (
            <Button
              variant="outline"
              size="sm"
              disabled={aireq.pending}
              onClick={() => void aireq.refresh()}
            >
              重试
            </Button>
          )}
        </div>
        <p className="shrink-0 py-2 text-ui-sm text-foreground-subtle">
          IR 时间由 SR 计划汇总，进度为 SR 平均值。
        </p>
      </div>
    </main>
  );
}

function IssueCount({ issues }: { issues: { title: string }[] }) {
  return (
    <ControlHintTooltip
      title={
        issues.length
          ? `${issues
              .slice(0, 3)
              .map((issue) => issue.title)
              .join("；")}${issues.length > 3 ? "；其余见详情" : ""}`
          : "暂无问题记录，完整分析判断见详情"
      }
    >
      <p
        tabIndex={0}
        className="mt-1 rounded-sm text-ui-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        问题：{issues.length} 项
      </p>
    </ControlHintTooltip>
  );
}

function PlanRange({ start, end }: { start?: string; end?: string }) {
  return (
    <ControlHintTooltip
      title={`计划开始：${start?.replace("T", " ") || "未排期"}\n计划结束：${end?.replace("T", " ") || "未排期"}`}
    >
      <p
        tabIndex={0}
        className="mt-1 rounded-sm text-ui-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        计划：{planningDate(start).split(" ")[0]} → {planningDate(end).split(" ")[0]}
      </p>
    </ControlHintTooltip>
  );
}

function PlanningAlert({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <ControlHintTooltip
      title={`${warnings[0]}${warnings.length > 1 ? `（另 ${warnings.length - 1} 项，见详情）` : ""}`}
    >
      <p
        tabIndex={0}
        className="mt-1 rounded-sm text-ui-sm text-warning-surface-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        排期冲突／需协调
      </p>
    </ControlHintTooltip>
  );
}

function FormalActions({
  group,
  sr,
  onDetail,
  onMessage,
}: {
  group: AIReqRequirementGroup;
  sr?: AIReqSystemRequirement;
  onDetail: () => void;
  onMessage: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const aireq = useAIReq()!;
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
      {/* 子表单关闭前保留 Popover 挂载，避免外部焦点关闭菜单时一并卸载 Dialog。 */}
      <Popover
        open={open}
        onOpenChange={(value) => {
          if (!dialogOpen) setOpen(value);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            className="pointer-events-none shrink-0 rounded-md text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:bg-hover hover:text-foreground focus-visible:pointer-events-auto focus-visible:bg-hover focus-visible:text-foreground focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
            aria-label={`${sr?.title ?? group.title}的更多操作`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={cn("w-72 gap-2", dialogOpen && "invisible pointer-events-none")}
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              setOpen(false);
              onDetail();
            }}
          >
            查看详情
          </Button>
          {sr && (
            <>
              <AIReqEditPlanning group={group} sr={sr} onDialogOpenChange={setDialogOpen} />
              {sr.trackingBranch?.status === "failed" && !sr.trackingBranch.pushedAt && <Button
                size="sm" variant="outline" disabled={aireq.pending}
                onClick={() => void aireq.command({ type: "retrySrBranch", projectId: group.projectId, irId: group.id, srId: sr.id })}
              >重试创建开发分支（模拟）</Button>}
              {sr.trackingBranch?.name?.trim() && sr.trackingBranch.status !== "deleted" && (sr.trackingBranch.status !== "failed" || Boolean(sr.trackingBranch.pushedAt)) && (
                <BranchCopy branch={sr.trackingBranch.name} onMessage={onMessage} />
              )}
            </>
          )}
          {!sr && (
            <p className="text-ui-sm text-foreground-subtle">
              开发安排与分支复制见各 SR 更多操作或详情。
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

const formalTablePanels = ["formal-table"];
const formalDetailPanels = ["formal-table", "formal-inspector"];

export function AIReqFormalWorkspace() {
  const aireq = useAIReq()!;
  const detail = aireq.selection.formalView !== "list" && Boolean(
    aireq.view?.groups.some((group) =>
      group.projectId === aireq.selection.projectId && group.id === aireq.selection.irId &&
      (!aireq.releaseId || group.releaseId === aireq.releaseId),
    ),
  );
  return (
    <ResizablePanelGroup
      layoutId="aireq-formal-progress-layout-v4"
      panelIds={detail ? formalDetailPanels : formalTablePanels}
      className="min-h-0 flex-1"
    >
      <ResizablePanel id="formal-table" minSize="400px" defaultSize={detail ? undefined : "100%"}>
        <AIReqFormalTable />
      </ResizablePanel>
      {detail && (
        <>
          <ResizableHandle />
          <ResizablePanel id="formal-inspector" minSize="320px" maxSize="45%" defaultSize="30%">
            <Tabs
              defaultValue="report"
              className="h-full min-h-0 gap-0 overflow-hidden rounded-xl border border-border bg-background"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
                <TabsList variant="line" aria-label="需求详情">
                  <TabsTrigger value="report">进度报告</TabsTrigger>
                  <TabsTrigger value="materials">
                    <FileText className="size-3.5" />
                    需求材料
                  </TabsTrigger>
                </TabsList>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="收起需求详情"
                  onClick={() =>
                    aireq.select({ projectId: aireq.selection.projectId, formalView: "list" })
                  }
                >
                  <PanelRightClose className="size-4" />
                </Button>
              </div>
              {aireq.error && (
                <div
                  role="alert"
                  className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-ui-sm text-destructive"
                >
                  <span className="min-w-0 flex-1 break-words">{aireq.error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={aireq.pending}
                    onClick={() => void aireq.refresh()}
                  >
                    重试
                  </Button>
                </div>
              )}
              <TabsContent value="report" className="min-h-0 flex-1 overflow-hidden">
                {aireq.selectionReady ? (
                  <AIReqFormalReport />
                ) : (
                  <FormalDetailLoading failed={Boolean(aireq.error)} />
                )}
              </TabsContent>
              <TabsContent value="materials" className="min-h-0 flex-1 overflow-hidden">
                {aireq.selectionReady ? (
                  <AIReqMaterialsPane />
                ) : (
                  <FormalDetailLoading failed={Boolean(aireq.error)} />
                )}
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

function FormalDetailLoading({ failed }: { failed: boolean }) {
  return (
    <p role="status" className="p-6 text-ui-sm text-foreground-subtle">
      {failed ? "所选需求读取失败，可重试或在表格选择其他需求。" : "正在读取所选需求…"}
    </p>
  );
}
