import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, FileText, PanelRightClose, Search } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
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
import { AIReqMaterialsPane } from "../proposals/AIReqWorkbench.js";
import { useAIReq } from "../AIReqContext.js";
import { getEmployeeId } from "../identity.js";
import { AssignOwner, AIReqDependencies, AIReqEditPlanning } from "./RequirementPlanning.js";
import { irPlanning, planningDate, planningWarnings, srDependencies } from "../contract.js";
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
import { AIReqFormalReport } from "./formal/FormalReport.js";
import { ProgressValue } from "./formal/ProgressDisplay.js";

// 表格始终由工作区固定挂载；筛选、展开和复制反馈留在本 owner，切行仅更新右侧报告。
export function AIReqFormalTable() {
  const aireq = useAIReq()!;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [ownerEmployeeId, setOwnerEmployeeId] = useState("");
  const [expanded, setExpanded] = useState(
    () => new Set(aireq.view?.groups.slice(0, 1).map((group) => group.id)),
  );
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
  const latest = (rows: AIReqSystemRequirement[]) =>
    rows
      .map((sr) => sr.progress?.analysedAt ?? "")
      .sort()
      .at(-1);
  const date = (value?: string) =>
    value
      ? new Date(value).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "尚未分析";
  return (
    <main
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      data-testid="aireq-formal-table"
    >
      {/* 修复：AIReq 固定显示主导航，此处仅保留原版 48px 空白顶栏。 */}
      <div className="h-12 shrink-0" />
      {/* 沿用 base 内容列的居中与水平留白；宽表格单独限宽，窄窗口仍在表格内滚动。 */}
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 md:py-6 lg:px-8">
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
        <div
          role="region"
          aria-label="正式需求表格滚动区域"
          tabIndex={0}
          className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          data-testid="formal-table-scroll"
        >
          <table
            className="w-full min-w-[1168px] table-fixed border-separate border-spacing-0 text-ui-base"
            aria-label="正式需求 IR SR 开发进度表"
          >
            <colgroup>
              <col />
              <col className="w-36" />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-36" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-16" />
              <col className="w-24" />
            </colgroup>
            <MarkdownTableHeader className="sticky top-0 z-20 bg-background">
              <MarkdownTableRow>
                {[
                  "需求",
                  "状态与进度",
                  "负责人 / 开发人员",
                  "开发分支",
                  "依赖关系",
                  "计划开始",
                  "计划结束",
                  "问题",
                  "最近分析",
                ].map((title, index) => (
                  <MarkdownTableHead
                    key={title}
                    scope="col"
                    className={`whitespace-nowrap bg-background px-2 font-medium text-foreground-subtle ${index === 0 ? "sticky left-0 z-30" : ""}`}
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
                const dependencies = srs.reduce(
                  (count, sr) => count + srDependencies(view, sr).length,
                  0,
                );
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
                        className="sticky left-0 z-10 bg-background px-2"
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
                            <Button
                              variant="link"
                              className="h-auto max-w-full justify-start p-0 text-left font-medium whitespace-normal"
                              onClick={(event) => {
                                event.stopPropagation();
                                open(group);
                              }}
                            >
                              {group.title}
                            </Button>
                            <p className="mt-1 font-mono text-ui-xs text-foreground-subtle">
                              IR · {group.id} · {srs.filter((sr) => srProgress(sr) === 100).length}/
                              {srs.length} SR 完成
                            </p>
                          </div>
                        </div>
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-2">
                        <ProgressValue
                          value={irProgress(srs)}
                          label={group.title}
                          status={irProgressStatus(srs)}
                        />
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-2">
                        <AssignOwner group={group} />
                        <p
                          className="mt-1 text-ui-xs text-foreground-subtle"
                          title={developers.join("、")}
                        >
                          {developers.length} 名开发人员
                        </p>
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-2 text-ui-sm text-foreground-subtle">
                        见各 SR
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-2 text-ui-sm text-foreground-subtle">
                        {dependencies ? `${dependencies} 条依赖 · 见各 SR` : "无前置依赖"}
                      </MarkdownTableCell>
                      <MarkdownTableCell
                        className="px-2 text-ui-sm tabular-nums"
                        title={plan.plannedStart?.replace("T", " ")}
                      >
                        <p>{planningDate(plan.plannedStart)}</p>
                        {plan.incomplete && (
                          <p className="mt-1 text-foreground-subtle">部分未排期</p>
                        )}
                      </MarkdownTableCell>
                      <MarkdownTableCell
                        className="px-2 text-ui-sm tabular-nums"
                        title={plan.plannedEnd?.replace("T", " ")}
                      >
                        {planningDate(plan.plannedEnd)}
                      </MarkdownTableCell>
                      <MarkdownTableCell className="px-2 tabular-nums">
                        {srs.reduce((count, sr) => count + (sr.progress?.issues.length ?? 0), 0)} 项
                      </MarkdownTableCell>
                      <MarkdownTableCell
                        className="whitespace-nowrap px-2 text-ui-sm text-foreground-subtle"
                        title={latest(srs)}
                      >
                        {date(latest(srs))}
                      </MarkdownTableCell>
                    </MarkdownTableRow>
                    {showChildren &&
                      children.map((sr) => (
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
                            className="sticky left-0 z-10 bg-background pr-2 pl-9"
                            style={{
                              backgroundImage:
                                "linear-gradient(var(--formal-row-fill), var(--formal-row-fill))",
                            }}
                          >
                            <Button
                              variant="link"
                              className="h-auto max-w-full p-0 text-left whitespace-normal"
                              onClick={(event) => {
                                event.stopPropagation();
                                open(group, sr);
                              }}
                            >
                              {sr.title}
                            </Button>
                            <p className="mt-1 font-mono text-ui-xs text-foreground-subtle">
                              SR · {sr.id}
                            </p>
                          </MarkdownTableCell>
                          <MarkdownTableCell className="px-2">
                            <ProgressValue
                              value={srProgress(sr)}
                              label={sr.title}
                              status={srProgressStatus(sr)}
                            />
                          </MarkdownTableCell>
                          <MarkdownTableCell className="px-2">
                            <AIReqEditPlanning group={group} sr={sr} compact />
                            <p className="mt-1 text-ui-xs text-foreground-subtle">
                              {sr.planning?.source === "manual"
                                ? "人工确认"
                                : sr.planning
                                  ? "AI 建议"
                                  : "待分析"}
                            </p>
                          </MarkdownTableCell>
                          <MarkdownTableCell className="px-2">
                            {sr.trackingBranch?.name?.trim() ? (
                              // 正式 SR 直接展示平台映射的真实分支名，复制反馈不能替换业务标识。
                              <BranchCopy
                                key={sr.trackingBranch.name}
                                branch={sr.trackingBranch.name}
                                onMessage={setCopyMessage}
                              />
                            ) : (
                              <span
                                role="alert"
                                className="text-ui-sm text-destructive"
                                title="正式 SR 必须已有平台分配的开发分支；当前映射缺失属于数据异常。"
                              >
                                开发分支缺失
                              </span>
                            )}
                          </MarkdownTableCell>
                          <MarkdownTableCell className="px-2">
                            <AIReqDependencies sr={sr} view={view} compact />
                            {planningWarnings(view, sr).length > 0 && (
                              <p
                                className="mt-1 text-ui-xs"
                                title={planningWarnings(view, sr).join("\n")}
                              >
                                需协调排期
                              </p>
                            )}
                          </MarkdownTableCell>
                          <MarkdownTableCell
                            className="whitespace-nowrap px-2 text-ui-sm tabular-nums"
                            title={sr.planning?.plannedStart?.replace("T", " ")}
                          >
                            {planningDate(sr.planning?.plannedStart)}
                          </MarkdownTableCell>
                          <MarkdownTableCell
                            className="whitespace-nowrap px-2 text-ui-sm tabular-nums"
                            title={sr.planning?.plannedEnd?.replace("T", " ")}
                          >
                            {planningDate(sr.planning?.plannedEnd)}
                          </MarkdownTableCell>
                          <MarkdownTableCell className="px-2 tabular-nums">
                            {sr.progress?.issues.length ?? 0} 项
                          </MarkdownTableCell>
                          <MarkdownTableCell
                            className="whitespace-nowrap px-2 text-ui-sm text-foreground-subtle"
                            title={sr.progress?.analysedAt}
                          >
                            {date(sr.progress?.analysedAt)}
                          </MarkdownTableCell>
                        </MarkdownTableRow>
                      ))}
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
