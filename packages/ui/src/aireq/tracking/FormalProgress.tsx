import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
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
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import { ProjectPageHelp } from "../projects/ProjectPageHelp.js";
import { AIReqRequirementContext } from "../shell/AIReqRequirementNavigation.js";
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
import { AIReqFormalHistory } from "./formal/FormalHistory.js";
import { ProgressValue } from "./formal/ProgressDisplay.js";

// 表格始终由工作区固定挂载；筛选、展开和复制反馈留在本 owner，切行仅更新右侧报告。
export function AIReqFormalTable() {
  const aireq = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
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
    (group) =>
      group.projectId === aireq.selection.projectId &&
      (!aireq.releaseId || group.releaseId === aireq.releaseId),
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
      (matches(group.id, group.originalText ?? group.title) ||
        rows.some((sr) => matches(sr.id, sr.title))) &&
      (status === "all" ||
        irProgressStatus(rows) === status ||
        rows.some((sr) => srProgressStatus(sr) === status))
    );
  });
  return (
    // 修复：详情分栏打开时按表格面板而非整个工作区计算内容宽度。
    <main
      className="@container/conversation h-full min-h-0 min-w-0 overflow-hidden bg-background [scrollbar-gutter:stable_both-edges]"
      data-testid="aireq-formal-table"
      aria-label={zh ? "正式需求" : "Formal requirements"}
    >
      <div
        className={cn(AIREQ_PAGE_CONTENT_CLASSNAME, "flex h-full min-h-0 flex-col pb-2 lg:pb-2")}
      >
        {/* 分区导航承接页面切换，移除旧页签占位，筛选栏直接接在页头下方。 */}
        <header className="shrink-0 space-y-4 pt-4">
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
            <ProjectPageHelp scope="formal-requirements" />
          </div>
        </header>
        <TrackingTableScroll
          label="正式需求表格滚动区域"
          className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface"
          viewportClassName="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
          viewportTestId="formal-table-scroll"
        >
          <table
            className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 bg-background text-ui-base"
            aria-label="正式需求 IR SR 开发进度表"
          >
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[30%]" />
              <col />
              <col className="w-14" />
            </colgroup>
            <MarkdownTableHeader className="bg-surface">
              <MarkdownTableRow className="hover:bg-transparent">
                {["原始需求／SR 与 Release", "状态、进度与关注项", "负责人及计划", "操作"].map(
                  (title, index) => (
                    <MarkdownTableHead
                      key={title}
                      scope="col"
                      // 修复：列头和固定首列共用真实的双向滚动容器，避免仅 top-0 仍随页面滚走。
                      className={`sticky top-0 h-10 min-w-0 bg-background whitespace-nowrap ${index === 3 ? "px-2 text-center" : "px-4"} font-normal text-ui-sm text-foreground-subtle ${index === 0 ? "left-0 z-30" : "z-20"}`}
                      // surface 含透明度：所有列头统一在不透明底色上合成，避免固定首列与其余表头色块分裂。
                      style={{
                        backgroundImage:
                          "linear-gradient(var(--color-surface), var(--color-surface))",
                      }}
                    >
                      {title}
                    </MarkdownTableHead>
                  ),
                )}
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
                    srs.flatMap((sr) => (sr.developerEmployeeId ? [sr.developerEmployeeId] : [])),
                  ),
                ];
                const testers = [
                  ...new Set(
                    srs.flatMap((sr) => (sr.testingEmployeeId ? [sr.testingEmployeeId] : [])),
                  ),
                ];
                const warnings = srs.flatMap((sr) => planningWarnings(view, sr));
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
                                <span className="line-clamp-2">
                                  {group.originalText ?? group.title}
                                </span>
                              </Button>
                            </ControlHintTooltip>
                            <p className="mt-1 break-all text-ui-sm text-foreground-subtle">
                              IR · {group.id} · {srs.filter((sr) => srProgress(sr) === 100).length}/
                              {srs.length} SR 完成
                              {" · "}
                              {view.releases.find((release) => release.id === group.releaseId)
                                ?.title ?? group.releaseId}
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
                        <AnalysisSummary srs={srs} aggregate />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-4 py-3 align-middle">
                        <PersonnelPlan
                          developer={developers.join("、") || "未分配"}
                          tester={testers.join("、") || "未分配"}
                          start={plan.plannedStart}
                          end={plan.plannedEnd}
                          incomplete={plan.incomplete}
                          warnings={warnings}
                        />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="min-w-0 px-2 py-3 align-middle">
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
                              <AnalysisSummary srs={[sr]} />
                            </MarkdownTableCell>
                            <MarkdownTableCell className="px-4 py-3 align-middle">
                              <PersonnelPlan
                                developer={sr.developerEmployeeId ?? "待认领"}
                                tester={sr.testingEmployeeId ?? "待认领"}
                                start={sr.planning?.plannedStart}
                                end={sr.planning?.plannedEnd}
                                warnings={warnings}
                              />
                            </MarkdownTableCell>
                            <MarkdownTableCell className="min-w-0 px-2 py-3 align-middle">
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
          className="relative mt-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-ui-sm text-foreground-subtle"
          data-testid="formal-counts"
        >
          {/* 原页脚重复计数、误称 Release 范围且空反馈占行；统计与真实反馈合并，规则移入帮助。 */}
          <p role="status" className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>
              {normalized || status !== "all"
                ? zh
                  ? `显示 ${visible.length} / ${groups.length} 条需求`
                  : `${visible.length} of ${groups.length} requirements`
                : zh
                  ? `共 ${groups.length} 条需求`
                  : `${groups.length} requirements`}
            </span>
            {!normalized && status === "all" && (
              <span>
                {zh
                  ? `${groups.reduce((count, group) => count + irSrs(view, group).length, 0)} 个开发单元`
                  : `${groups.reduce((count, group) => count + irSrs(view, group).length, 0)} development units`}
              </span>
            )}
          </p>
          <p
            role={aireq.error ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "min-w-0 flex-1 truncate",
              aireq.error ? "text-destructive" : "text-foreground-subtle",
              !aireq.error && !copyMessage && "sr-only",
            )}
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
      </div>
    </main>
  );
}

function AnalysisSummary({
  srs,
  aggregate = false,
}: {
  srs: AIReqSystemRequirement[];
  aggregate?: boolean;
}) {
  // 修复：零问题不代表已分析；折叠 IR 也必须直接呈现子 SR 的证据缺口。
  const unanalysed = srs.filter((sr) => !sr.progress).length;
  const failed = srs.filter((sr) => sr.lastAnalysisFailure).length;
  const stale = srs.filter((sr) => sr.progress?.stale).length;
  const health = [
    unanalysed ? (aggregate ? `${unanalysed} 个 SR 未分析` : "尚未分析") : "",
    failed
      ? aggregate
        ? `分析失败 ${failed}`
        : srs[0]?.progress
          ? "分析失败，保留旧报告"
          : "分析失败，暂无报告"
      : "",
    stale ? (aggregate ? `报告过期 ${stale}` : "报告已过期") : "",
  ].filter(Boolean);
  const issues = srs.flatMap((sr) => sr.progress?.issues ?? []);
  const testIssues = srs.reduce(
    (count, sr) =>
      count + (sr.developmentIssues?.filter((issue) => issue.status !== "resolved").length ?? 0),
    0,
  );
  const missingBranches = srs.filter((sr) => !sr.trackingBranch?.name?.trim()).length;
  const branchErrors = srs.flatMap((sr) =>
    sr.trackingBranch?.error ? [sr.trackingBranch.error] : [],
  );
  const primary = testIssues
    ? `未解决测试问题：${testIssues} 项`
    : missingBranches
      ? `开发分支缺失：${missingBranches} 项`
      : branchErrors.length
        ? "开发分支异常，查看详情"
        : issues.length
          ? `分析问题 ${issues.length} 项 · ${issues[0]?.title}`
          : health.length
            ? ""
            : srs.length
              ? "当前报告无阻断问题"
              : "暂无 SR，尚无分析报告";
  const detail = [...health, primary, ...branchErrors, ...issues.map((issue) => issue.title)]
    .filter(Boolean)
    .join("；");
  return (
    <ControlHintTooltip title={detail}>
      <div
        tabIndex={0}
        className="mt-1 space-y-1 rounded-sm text-ui-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {health.length > 0 && (
          <p className={failed ? "text-destructive" : "text-warning-surface-foreground"}>
            {health.join(" · ")}
          </p>
        )}
        {primary && (
          <p
            className={cn(
              "line-clamp-1",
              testIssues || missingBranches || branchErrors.length
                ? "text-destructive"
                : "text-foreground-subtle",
            )}
          >
            {primary}
          </p>
        )}
      </div>
    </ControlHintTooltip>
  );
}

function PersonnelPlan({
  developer,
  tester,
  start,
  end,
  incomplete,
  warnings,
}: {
  developer: string;
  tester: string;
  start?: string;
  end?: string;
  incomplete?: boolean;
  warnings: string[];
}) {
  // 人员分行和重复未排期文案会撑高单元格；固定两行，完整事实仍由提示承载。
  const personnel = `开发：${developer} · 测试：${tester}`;
  const plan =
    !start && !end
      ? "计划：未排期"
      : `计划：${planningDate(start).split(" ")[0]} → ${planningDate(end).split(" ")[0]}`;
  const planDetail = [
    `计划开始：${start?.replace("T", " ") || "未排期"}`,
    `计划结束：${end?.replace("T", " ") || "未排期"}`,
    ...(incomplete && (start || end) ? ["部分未排期"] : []),
    ...warnings,
  ].join("\n");
  return (
    // 修复：展开长表后 sr-only 绝对定位曾越出滚动域，撑高 document；就地定位使排期读屏文本随单元格裁剪。
    <div className="relative min-w-0 space-y-1 text-ui-sm">
      <ControlHintTooltip title={personnel}>
        <p
          tabIndex={0}
          className="truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {personnel}
        </p>
      </ControlHintTooltip>
      <ControlHintTooltip title={planDetail}>
        <p
          tabIndex={0}
          className="flex min-w-0 items-center gap-1 rounded-sm text-foreground-subtle tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {warnings.length > 0 && (
            <>
              <TriangleAlert
                aria-hidden="true"
                className="size-3.5 shrink-0 text-warning-surface-foreground"
              />
              <span className="sr-only">排期冲突／需协调：</span>
            </>
          )}
          <span className="min-w-0 truncate">{plan}</span>
        </p>
      </ControlHintTooltip>
    </div>
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
            size="icon"
            variant="ghost"
            className="pointer-events-none size-8 shrink-0 rounded-lg text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:bg-hover hover:text-foreground focus-visible:pointer-events-auto focus-visible:bg-hover focus-visible:text-foreground focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
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
              {sr.trackingBranch?.status === "failed" && !sr.trackingBranch.pushedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aireq.pending}
                  onClick={() =>
                    void aireq.command({
                      type: "retrySrBranch",
                      projectId: group.projectId,
                      irId: group.id,
                      srId: sr.id,
                    })
                  }
                >
                  重试创建开发分支
                </Button>
              )}
              {sr.trackingBranch?.name?.trim() &&
                sr.trackingBranch.status !== "deleted" &&
                (sr.trackingBranch.status !== "failed" || Boolean(sr.trackingBranch.pushedAt)) && (
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
  const { locale } = useZCodeIntl();
  const detail =
    aireq.selection.formalView !== "list" &&
    Boolean(
      aireq.view?.groups.some(
        (group) =>
          group.projectId === aireq.selection.projectId &&
          group.id === aireq.selection.irId &&
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
              <AIReqRequirementContext />
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
                <TabsList variant="line" aria-label="需求详情">
                  <TabsTrigger value="report">进度报告</TabsTrigger>
                  <TabsTrigger value="materials">
                    <FileText className="size-3.5" />
                    需求材料
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    aria-label={
                      locale === "zh-CN" ? "讨论与评审历史" : "Discussion and review history"
                    }
                  >
                    {locale === "zh-CN" ? "讨论／评审" : "History"}
                  </TabsTrigger>
                </TabsList>
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
              <TabsContent value="history" className="min-h-0 flex-1 overflow-hidden">
                {aireq.selectionReady ? (
                  <AIReqFormalHistory
                    key={`${aireq.selection.projectId}:${aireq.selection.irId}`}
                  />
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
