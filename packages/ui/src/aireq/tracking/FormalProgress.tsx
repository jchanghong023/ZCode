import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, FileText, PanelRightClose, Search } from "lucide-react";
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
import { getEmployeeId } from "../identity.js";
import { AssignOwner, AIReqEditPlanning } from "./RequirementPlanning.js";
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
import { AIReqEmployeePicker } from "./EmployeePicker.js";
import { TrackingTableScroll } from "./TrackingTableScroll.js";
import { AIReqFormalReport } from "./formal/FormalReport.js";
import { ProgressValue } from "./formal/ProgressDisplay.js";

// 表格始终由工作区固定挂载；筛选、展开和复制反馈留在本 owner，切行仅更新右侧报告。
export function AIReqFormalTable() {
  const aireq = useAIReq()!;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [ownerEmployeeId, setOwnerEmployeeId] = useState("");
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
    (group) => group.projectId === aireq.selection.projectId && group.releaseId === aireq.releaseId,
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
      (owner !== "mine" ||
        group.ownerEmployeeId === getEmployeeId() ||
        rows.some((sr) => sr.planning?.developerEmployeeId === getEmployeeId())) &&
      (owner !== "unassigned" || !group.ownerEmployeeId) &&
      (owner !== "specified" ||
        !ownerEmployeeId.trim() ||
        group.ownerEmployeeId === ownerEmployeeId.trim()) &&
      (matches(group.id, group.title) || rows.some((sr) => matches(sr.id, sr.title))) &&
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
        <header className="shrink-0 space-y-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* 修复：与自动化共用页面标题字阶，避免跨业务页切换时层级突变。 */}
            <h1 className="shrink-0 text-ui-page-title font-medium tracking-[0.114px]">正式需求</h1>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select value={aireq.selection.projectId ?? ""} onValueChange={aireq.switchProject}>
                <SelectTrigger className="h-7 w-40" aria-label="正式需求项目">
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
              <Select value={aireq.releaseId} onValueChange={aireq.setReleaseId}>
                <SelectTrigger className="h-7 w-44" aria-label="正式需求版本">
                  <SelectValue placeholder="选择版本" />
                </SelectTrigger>
                <SelectContent>
                  {view.releases.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-ui-sm text-foreground-subtle" data-testid="formal-counts">
                <span className="whitespace-nowrap font-medium text-foreground">
                  {visible.length} 个 IR
                </span>
                <span className="ml-3 inline-block">
                  当前 Release 共 {groups.length} 个 IR ·{" "}
                  {groups.reduce((count, group) => count + irSrs(view, group).length, 0)} 个 SR
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-foreground-subtle" />
              <Input
                className="h-7 pl-8"
                aria-label="搜索正式需求"
                placeholder="搜索 IR／SR 名称或编号"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 w-28" aria-label="筛选开发状态">
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
            <Select
              value={owner}
              onValueChange={(value) => {
                setOwner(value);
                setOwnerEmployeeId("");
              }}
            >
              <SelectTrigger className="h-7 w-40" aria-label="筛选需求负责人">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部需求</SelectItem>
                <SelectItem value="mine">我负责的</SelectItem>
                <SelectItem value="specified">指定 IR 负责人</SelectItem>
                <SelectItem value="unassigned">未分配 IR 负责人</SelectItem>
              </SelectContent>
            </Select>
            {owner === "specified" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    aria-label="输入或选择 IR 负责人"
                  >
                    {ownerEmployeeId.trim() || "输入或选择工号"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="max-h-[70dvh] w-96 overflow-y-auto"
                  aria-label="筛选 IR 负责人"
                >
                  <AIReqEmployeePicker
                    value={ownerEmployeeId}
                    onChange={setOwnerEmployeeId}
                    ownerIds={groups.flatMap((group) =>
                      group.ownerEmployeeId ? [group.ownerEmployeeId] : [],
                    )}
                  />
                  {!ownerEmployeeId.trim() && (
                    <p role="status" className="mt-2 text-ui-xs text-foreground-subtle">
                      选择后按工号精确筛选；当前尚未限定负责人。
                    </p>
                  )}
                </PopoverContent>
              </Popover>
            )}
            {(normalized || status !== "all" || owner !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setOwner("all");
                  setOwnerEmployeeId("");
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </header>
        <TrackingTableScroll
          label="正式需求表格滚动区域"
          className="mt-3 rounded-xl border border-border bg-background"
          viewportTestId="formal-table-scroll"
        >
          <table
            className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-ui-base"
            aria-label="正式需求 IR SR 开发进度表"
          >
            <colgroup>
              {/* 四组弹性列适应内容列，不再为每个辅助字段单独保留固定宽度。 */}
              <col className="w-[34%]" />
              <col className="w-[22%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
            </colgroup>
            <MarkdownTableHeader className="bg-surface">
              <MarkdownTableRow className="hover:bg-transparent">
                {["需求", "状态与问题", "人员与计划", "操作"].map((title, index) => (
                  <MarkdownTableHead
                    key={title}
                    scope="col"
                    className={`whitespace-nowrap px-2 font-medium text-foreground-subtle ${index === 0 ? "sticky left-0 z-30 bg-background" : ""}`}
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
                const groupMatches = matches(group.id, group.title);
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
                      sr.planning?.developerEmployeeId ? [sr.planning.developerEmployeeId] : [],
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
                      className={`cursor-pointer ${selected ? "bg-selected hover:bg-selected [--formal-row-fill:var(--color-selected)]" : "bg-surface hover:bg-hover [--formal-row-fill:var(--color-surface)] hover:[--formal-row-fill:var(--color-hover)]"}`}
                      onClick={() => open(group)}
                    >
                      <MarkdownTableCell
                        className="sticky left-0 z-10 bg-background px-2 py-1.5 align-top"
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
                          <div className="min-w-0">
                            <ControlHintTooltip title={group.title}>
                              <Button
                                variant="link"
                                className="h-auto w-full max-w-full justify-start p-0 text-left font-medium whitespace-normal [overflow-wrap:anywhere]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  open(group);
                                }}
                              >
                                <span className="line-clamp-2">{group.title}</span>
                              </Button>
                            </ControlHintTooltip>
                            <p className="mt-1 break-all font-mono text-ui-xs text-foreground-subtle">
                              IR · {group.id} · {srs.filter((sr) => srProgress(sr) === 100).length}/
                              {srs.length} SR 完成
                            </p>
                          </div>
                        </div>
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-2 py-1.5 align-top">
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
                      <MarkdownTableCell className="px-2 py-1.5 align-top">
                        <p className="break-words text-ui-sm">
                          负责人：{group.ownerEmployeeId ?? "未分配"}
                        </p>
                        <ControlHintTooltip title={developers.join("、") || "暂无开发人员"}>
                          <p
                            tabIndex={0}
                            className="line-clamp-2 rounded-sm text-ui-sm text-foreground-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
                      <MarkdownTableCell className="px-2 py-1.5 align-top">
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
                            className={`cursor-pointer ${aireq.selection.irId === group.id && aireq.selection.srId === sr.id ? "bg-selected hover:bg-selected [--formal-row-fill:var(--color-selected)]" : "hover:bg-hover [--formal-row-fill:transparent] hover:[--formal-row-fill:var(--color-hover)]"}`}
                            onClick={() => open(group, sr)}
                          >
                            <MarkdownTableCell
                              className="sticky left-0 z-10 bg-background pr-2 pl-9 py-1.5 align-top"
                              style={{
                                backgroundImage:
                                  "linear-gradient(var(--formal-row-fill), var(--formal-row-fill))",
                              }}
                            >
                              <ControlHintTooltip title={sr.title}>
                                <Button
                                  variant="link"
                                  className="h-auto w-full max-w-full justify-start p-0 text-left whitespace-normal [overflow-wrap:anywhere]"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    open(group, sr);
                                  }}
                                >
                                  <span className="line-clamp-2">{sr.title}</span>
                                </Button>
                              </ControlHintTooltip>
                              <p className="mt-1 break-all font-mono text-ui-xs text-foreground-subtle">
                                SR · {sr.id}
                              </p>
                            </MarkdownTableCell>
                            <MarkdownTableCell className="px-2 py-1.5 align-top">
                              <ProgressValue
                                value={srProgress(sr)}
                                label={sr.title}
                                status={srProgressStatus(sr)}
                              />
                              <IssueCount issues={sr.progress?.issues ?? []} />
                              {!sr.trackingBranch?.name?.trim() && (
                                <p role="alert" className="mt-1 text-ui-sm text-destructive">
                                  开发分支缺失
                                </p>
                              )}
                            </MarkdownTableCell>
                            <MarkdownTableCell className="px-2 py-1.5 align-top">
                              <p className="break-words text-ui-sm">
                                开发：{sr.planning?.developerEmployeeId ?? "未分配"}
                              </p>
                              <PlanRange
                                start={sr.planning?.plannedStart}
                                end={sr.planning?.plannedEnd}
                              />
                              <PlanningAlert warnings={warnings} />
                            </MarkdownTableCell>
                            <MarkdownTableCell className="px-2 py-1.5 align-top">
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
                : !aireq.releaseId
                  ? "当前项目尚无 Release，请先创建版本。"
                  : groups.length
                    ? "没有符合条件的需求。"
                    : "当前版本尚无正式需求。"}
            </p>
          )}
        </TrackingTableScroll>
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
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <Button size="sm" variant="ghost" onClick={onDetail}>
        详情
      </Button>
      {/* 子表单关闭前保留 Popover 挂载，避免外部焦点关闭菜单时一并卸载 Dialog。 */}
      <Popover
        open={open}
        onOpenChange={(value) => {
          if (!dialogOpen) setOpen(value);
        }}
      >
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={`${sr?.title ?? group.title}的更多操作`}>
            更多
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={cn("w-72 gap-2", dialogOpen && "invisible pointer-events-none")}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-ui-sm text-foreground-subtle">需求负责人</p>
          <AssignOwner group={group} onDialogOpenChange={setDialogOpen} />
          {sr && (
            <>
              <AIReqEditPlanning group={group} sr={sr} onDialogOpenChange={setDialogOpen} />
              {sr.trackingBranch?.name?.trim() && (
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
  const detail =
    aireq.selection.formalView === "detail" ||
    (aireq.selection.formalView !== "list" &&
      Boolean(
        aireq.view?.groups.some(
          (group) =>
            group.projectId === aireq.selection.projectId && group.id === aireq.selection.irId,
        ),
      ));
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
