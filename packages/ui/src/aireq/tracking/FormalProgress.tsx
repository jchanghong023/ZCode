import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, MoreHorizontal, Search } from "lucide-react";
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
import { cn } from "@/components/lib/utils.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import { ProjectPageHelp } from "../projects/ProjectPageHelp.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqSidePane } from "../side-pane/AIReqSidePaneContext.js";
import type { AIReqSidePaneKind } from "../side-pane/contract.js";
import { AIReqEditPlanning } from "./RequirementPlanning.js";
import { irPlanning } from "../contract.js";
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
import { ProgressValue } from "./formal/ProgressDisplay.js";
import { CompactPlanSummary } from "./CompactPlanSummary.js";
import { coordinationWarnings, PersonnelPlan } from "./PersonnelPlan.js";

// 表格与主区选择保持独立；点击对象只打开统一侧栏的目标 Tab，不重置筛选或浏览器历史。
function AIReqFormalTable() {
  const aireq = useAIReq()!;
  const sidePane = useAIReqSidePane();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [filteredExpansion, setFilteredExpansion] = useState<Record<string, boolean>>({});
  // 窄分栏把负责人及计划折叠为行内展开详情；展开状态属于本表布局，不进入业务 owner。
  const [planExpanded, setPlanExpanded] = useState(() => new Set<string>());
  const togglePlan = (key: string) =>
    setPlanExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
  const selectedTarget =
    sidePane.activeTab?.releaseId === aireq.releaseId ? sidePane.activeTab.selection : undefined;
  const open = (group: AIReqRequirementGroup, sr?: AIReqSystemRequirement) =>
    sidePane.open({
      kind: "report",
      selection: {
        projectId: group.projectId,
        irId: group.id,
        srId: sr?.id,
        formalView: "detail",
      },
      releaseId: group.releaseId,
      title: sr?.title ?? group.title,
    });
  const matches = (id: string, title: string, original = "") =>
    !normalized || `${id} ${title} ${original}`.toLocaleLowerCase().includes(normalized);
  const visible = groups.filter((group) => {
    const rows = irSrs(view, group);
    return (
      (matches(group.id, group.title, group.originalText) ||
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
        <header className="shrink-0 space-y-4">
          <ScopedPageTitle title={zh ? "开发任务" : "Development tasks"} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-48 @min-[640px]/conversation:min-w-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle" />
              <Input
                className="h-9 rounded-lg bg-surface pl-9"
                aria-label={zh ? "搜索 IR 或 SR 名称" : "Search IR or SR names"}
                placeholder={zh ? "搜索 IR／SR 名称" : "Search IR / SR names"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-28 rounded-lg bg-surface" aria-label="筛选开发状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态 {groups.length}</SelectItem>
                {PROGRESS_STATUSES.map((item) => {
                  const count = groups.filter((group) => {
                    const rows = irSrs(view, group);
                    return (
                      irProgressStatus(rows) === item ||
                      rows.some((sr) => srProgressStatus(sr) === item)
                    );
                  }).length;
                  return (
                    <SelectItem key={item} value={item}>
                      {item}
                      {count ? ` ${count}` : ""}
                    </SelectItem>
                  );
                })}
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
          className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-card-border bg-card text-foreground"
          viewportClassName="@container/formal-table min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
          viewportTestId="formal-table-scroll"
        >
          <table
            className="w-full min-w-[480px] table-fixed border-separate border-spacing-0 bg-card text-ui-base @min-[640px]/conversation:min-w-[640px]"
            aria-label="正式需求 IR SR 开发进度表"
          >
            <colgroup>
              <col className="w-[34%]" />
              <col className="@min-[640px]/conversation:w-[30%]" />
              <col className="hidden @min-[640px]/conversation:table-column" />
              <col className="w-20" />
            </colgroup>
            <MarkdownTableHeader className="bg-card">
              <MarkdownTableRow className="hover:bg-transparent">
                {["需求／开发任务", "状态、进度与关注项", "负责人及计划", "操作"].map(
                  (title, index) => (
                    <MarkdownTableHead
                      key={title}
                      scope="col"
                      // 修复：列头和固定首列共用真实的双向滚动容器，避免仅 top-0 仍随页面滚走。
                      className={`sticky top-0 h-10 min-w-0 bg-card whitespace-nowrap ${index === 2 ? "hidden @min-[640px]/conversation:table-cell" : ""} ${index === 3 ? "px-2 text-center" : "px-4"} font-medium text-ui-sm text-foreground ${index === 0 ? "left-0 z-30" : "z-20"}`}
                    >
                      {title}
                    </MarkdownTableHead>
                  ),
                )}
              </MarkdownTableRow>
            </MarkdownTableHeader>
            <MarkdownTableBody>
              {visible.length === 0 && (
                <MarkdownTableRow>
                  <MarkdownTableCell
                    colSpan={4}
                    className="px-4 py-10 text-center text-ui-sm text-foreground-subtle"
                  >
                    当前筛选无开发任务。
                    {(normalized || status !== "all") && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setQuery("");
                          setStatus("all");
                        }}
                      >
                        清除筛选
                      </Button>
                    )}
                  </MarkdownTableCell>
                </MarkdownTableRow>
              )}
              {visible.map((group) => {
                const srs = irSrs(view, group);
                const groupMatches = matches(group.id, group.title, group.originalText);
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
                const selected =
                  selectedTarget?.projectId === group.projectId &&
                  selectedTarget.irId === group.id &&
                  !selectedTarget?.srId;
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
                const warnings = srs.flatMap((sr) => coordinationWarnings(view, sr));
                // 表头和固定列共用外观卡片底色；只叠一次悬停／选中行色，避免滚动透字和色块分裂。
                return (
                  <Fragment key={group.id}>
                    <MarkdownTableRow
                      data-ir-id={group.id}
                      data-aireq-motion-row=""
                      aria-selected={selected}
                      className={`group/row cursor-pointer hover:[&_.text-foreground-subtle]:text-foreground focus-within:[&_.text-foreground-subtle]:text-foreground ${selected ? "bg-selected hover:bg-selected [--formal-row-fill:var(--color-selected)]" : "bg-transparent hover:bg-hover [--formal-row-fill:transparent] hover:[--formal-row-fill:var(--color-hover)]"}`}
                      onClick={() => open(group)}
                    >
                      <MarkdownTableCell
                        data-aireq-motion-cell=""
                        className="sticky left-0 z-10 bg-card px-4 py-4 align-middle"
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
                                <span className="line-clamp-2">{group.title}</span>
                              </Button>
                            </ControlHintTooltip>
                            <p className="mt-1 break-all text-ui-sm text-foreground-subtle">
                              IR · {srs.filter((sr) => srProgress(sr) === 100).length}/{srs.length}{" "}
                              SR 完成
                            </p>
                          </div>
                        </div>
                        <CompactPlanSummary
                          planKey={`ir:${group.id}`}
                          expanded={planExpanded.has(`ir:${group.id}`)}
                          onToggle={() => togglePlan(`ir:${group.id}`)}
                          developer={developers.join("、") || "未分配"}
                          tester={testers.join("、") || "未分配"}
                          label={group.title}
                        />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-4 py-4 align-middle">
                        <ProgressValue
                          value={irProgress(srs)}
                          label={group.title}
                          status={irProgressStatus(srs)}
                        />
                        <AnalysisSummary srs={srs} aggregate />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="hidden px-4 py-4 align-middle @min-[640px]/conversation:table-cell">
                        <PersonnelPlan
                          developer={developers.join("、") || "未分配"}
                          tester={testers.join("、") || "未分配"}
                          start={plan.plannedStart}
                          end={plan.plannedEnd}
                          incomplete={plan.incomplete}
                          warnings={warnings}
                        />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="min-w-0 px-1 py-4 align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <Button
                            variant="link"
                            size="sm"
                            className="px-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              open(group);
                            }}
                          >
                            详情
                          </Button>
                          <FormalActions
                            group={group}
                            onDetail={() => open(group)}
                            onMessage={setCopyMessage}
                          />
                        </div>
                      </MarkdownTableCell>
                    </MarkdownTableRow>
                    {planExpanded.has(`ir:${group.id}`) && (
                      <MarkdownTableRow className="bg-card hover:bg-transparent @min-[640px]/conversation:hidden">
                        <MarkdownTableCell
                          id={`formal-plan-ir:${group.id}`}
                          colSpan={3}
                          className="bg-card p-0"
                        >
                          {/* 跨列单元格随表格滚动；详情内容保持在可视宽度内并与首列同向固定。 */}
                          <div className="sticky left-0 w-[100cqi] max-w-full px-4 pb-3 pl-12">
                            <PersonnelPlan
                              expanded
                              developer={developers.join("、") || "未分配"}
                              tester={testers.join("、") || "未分配"}
                              start={plan.plannedStart}
                              end={plan.plannedEnd}
                              incomplete={plan.incomplete}
                              warnings={warnings}
                            />
                          </div>
                        </MarkdownTableCell>
                      </MarkdownTableRow>
                    )}
                    {showChildren &&
                      children.map((sr) => {
                        const warnings = coordinationWarnings(view, sr);
                        return (
                          <Fragment key={sr.id}>
                            <MarkdownTableRow
                              data-sr-id={sr.id}
                              data-aireq-motion-row=""
                              aria-selected={
                                selectedTarget?.projectId === group.projectId &&
                                selectedTarget.irId === group.id &&
                                selectedTarget?.srId === sr.id
                              }
                              className={`group/row cursor-pointer hover:[&_.text-foreground-subtle]:text-foreground focus-within:[&_.text-foreground-subtle]:text-foreground ${selectedTarget?.projectId === group.projectId && selectedTarget.irId === group.id && selectedTarget?.srId === sr.id ? "bg-selected hover:bg-selected [--formal-row-fill:var(--color-selected)]" : "bg-transparent hover:bg-hover [--formal-row-fill:transparent] hover:[--formal-row-fill:var(--color-hover)]"}`}
                              onClick={() => open(group, sr)}
                            >
                              <MarkdownTableCell
                                data-aireq-motion-cell=""
                                className="sticky left-0 z-10 bg-card pr-2 pl-8 py-3 align-middle @min-[640px]/conversation:pr-4 @min-[640px]/conversation:pl-12"
                                style={{
                                  backgroundImage:
                                    "linear-gradient(var(--formal-row-fill), var(--formal-row-fill))",
                                }}
                              >
                                <div className="ml-4 flex items-start gap-2 @min-[640px]/conversation:ml-0">
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
                                      SR
                                    </p>
                                  </div>
                                </div>
                                <CompactPlanSummary
                                  planKey={`sr:${sr.id}`}
                                  expanded={planExpanded.has(`sr:${sr.id}`)}
                                  onToggle={() => togglePlan(`sr:${sr.id}`)}
                                  developer={sr.developerEmployeeId ?? "待认领"}
                                  tester={sr.testingEmployeeId ?? "待认领"}
                                  label={sr.title}
                                />
                              </MarkdownTableCell>
                              <MarkdownTableCell className="px-4 py-4 align-middle">
                                <ProgressValue
                                  value={srProgress(sr)}
                                  label={sr.title}
                                  status={srProgressStatus(sr)}
                                />
                                <AnalysisSummary srs={[sr]} />
                              </MarkdownTableCell>
                              <MarkdownTableCell className="hidden px-4 py-4 align-middle @min-[640px]/conversation:table-cell">
                                <PersonnelPlan
                                  developer={sr.developerEmployeeId ?? "待认领"}
                                  tester={sr.testingEmployeeId ?? "待认领"}
                                  start={sr.planning?.plannedStart}
                                  end={sr.planning?.plannedEnd}
                                  warnings={warnings}
                                />
                              </MarkdownTableCell>
                              <MarkdownTableCell className="min-w-0 px-2 py-4 align-middle">
                                <FormalActions
                                  group={group}
                                  sr={sr}
                                  onDetail={() => open(group, sr)}
                                  onMessage={setCopyMessage}
                                />
                              </MarkdownTableCell>
                            </MarkdownTableRow>
                            {planExpanded.has(`sr:${sr.id}`) && (
                              <MarkdownTableRow className="bg-card hover:bg-transparent @min-[640px]/conversation:hidden">
                                <MarkdownTableCell
                                  id={`formal-plan-sr:${sr.id}`}
                                  colSpan={3}
                                  className="bg-card p-0"
                                >
                                  <div className="sticky left-0 w-[100cqi] max-w-full px-4 pb-3 pl-16">
                                    <PersonnelPlan
                                      expanded
                                      developer={sr.developerEmployeeId ?? "待认领"}
                                      tester={sr.testingEmployeeId ?? "待认领"}
                                      start={sr.planning?.plannedStart}
                                      end={sr.planning?.plannedEnd}
                                      warnings={warnings}
                                    />
                                  </div>
                                </MarkdownTableCell>
                              </MarkdownTableRow>
                            )}
                          </Fragment>
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
  const unanalysed = srs.filter((sr) => !sr.progress && !sr.lastAnalysisFailure).length;
  const failed = srs.filter((sr) => sr.lastAnalysisFailure ?? sr.progress?.analysisFailure).length;
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
  const missingBranches = srs.filter((sr) => !sr.trackingBranch?.name?.trim()).length;
  const branchErrors = srs.flatMap((sr) =>
    sr.trackingBranch?.error ? [sr.trackingBranch.error] : [],
  );
  const primary = missingBranches
    ? `开发分支缺失：${missingBranches} 项`
    : branchErrors.length
      ? "开发分支异常，查看详情"
      : issues.length
        ? `分析问题 ${issues.length} 项 · ${issues[0]?.title}`
        : !srs.length
          ? "暂无 SR，尚无分析报告"
          : "";
  const detail = [...health, primary, ...branchErrors, ...issues.map((issue) => issue.title)]
    .filter(Boolean)
    .join("；");
  if (!detail) return null;
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
              missingBranches || branchErrors.length
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
  const sidePane = useAIReqSidePane();
  const { locale } = useZCodeIntl();
  const openDetailTab = (kind: AIReqSidePaneKind) => {
    setOpen(false);
    sidePane.open({
      kind,
      selection: { projectId: group.projectId, irId: group.id, srId: sr?.id, formalView: "detail" },
      releaseId: group.releaseId,
      title: sr?.title ?? group.title,
    });
  };
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
            // 行内操作统一默认隐藏（spec：全局想法池）：行悬停／键盘聚焦／菜单展开时显现，保持表格安静。
            className="pointer-events-none size-8 shrink-0 rounded-lg text-foreground-subtle opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground aria-expanded:pointer-events-auto aria-expanded:opacity-100"
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
            className="w-full justify-start focus-visible:border-remote-foreground-muted"
            onClick={() => {
              setOpen(false);
              onDetail();
            }}
          >
            查看详情
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start focus-visible:border-remote-foreground-muted"
            onClick={() => openDetailTab("materials")}
          >
            {locale === "zh-CN" ? "查看需求材料" : "View materials"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start focus-visible:border-remote-foreground-muted"
            onClick={() => openDetailTab("history")}
          >
            {locale === "zh-CN" ? "查看讨论／评审历史" : "View discussion and review history"}
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

/** 显式对象链接只接纳一次报告目标；普通行点击由表格直接打开 Tab。 */
export function AIReqFormalWorkspace() {
  const aireq = useAIReq()!;
  const { open } = useAIReqSidePane();
  const routedTarget = useRef<string | undefined>(undefined);
  const { projectId, irId, srId, formalView } = aireq.selection;
  const selectedGroup = aireq.view?.groups.find(
    (group) =>
      group.projectId === projectId && group.id === irId && group.releaseId === aireq.releaseId,
  );
  const releaseId = selectedGroup?.releaseId;
  const title =
    (srId
      ? aireq.view?.srs.find(
          (sr) => sr.projectId === projectId && sr.irId === irId && sr.id === srId,
        )?.title
      : undefined) ?? selectedGroup?.title;
  const ready = aireq.selectionReady;
  useEffect(() => {
    if (!irId || formalView === "list") {
      routedTarget.current = undefined;
      return;
    }
    if (!ready || !projectId || !releaseId || !title) return;
    const key = JSON.stringify([projectId, releaseId, irId, srId]);
    if (routedTarget.current === key) return;
    routedTarget.current = key;
    open(
      {
        kind: "report",
        selection: { projectId, irId, srId, formalView: "detail" },
        releaseId,
        title,
      },
      { ifAbsent: true },
    );
  }, [projectId, irId, srId, formalView, ready, releaseId, title, open]);
  return <AIReqFormalTable />;
}
