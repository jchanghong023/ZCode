import { useState } from "react";
import { X } from "lucide-react";
import {
  ISSUE_TYPES,
  ISSUE_STATUSES,
  type AIReqIssueScope,
  type AIReqIssueServices,
  type AIReqIssueSnapshot,
} from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Progress } from "@/components/ui/progress.js";
import { SelectItem } from "@/components/ui/select.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.js";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable.js";
import { MarkdownTableCell, MarkdownTableRow } from "@/components/ai-elements/markdown-table.js";
import { useAIReq } from "../../AIReqContext.js";
import { getEmployeeId, isEmployeeId } from "../../identity.js";
import { BranchCopy } from "../BranchCopy.js";
import {
  IssuePageHeading,
  IssueSelect,
  IssueStatus,
  IssueTable,
  priorityLabels,
  time,
  cell,
  type MutationProps,
} from "./shared.js";

// 列表和详情共用状态配色，避免详情遗漏等待态后仍显示开发中的蓝色。
const progressIndicatorClass = {
  pending: "bg-foreground-subtle",
  developing: "bg-progress-surface-foreground",
  merging: "bg-warning",
  confirming: "bg-warning",
  completed: "bg-success",
} satisfies Record<keyof typeof ISSUE_STATUSES, string>;

export function IssueProgress({
  scope,
  service,
  snapshot,
  pending,
  mutationError,
  mutate,
  onMessage,
}: {
  scope: AIReqIssueScope;
  service: AIReqIssueServices;
  snapshot: AIReqIssueSnapshot;
  onMessage(value: string): void;
} & MutationProps) {
  const aireq = useAIReq()!;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<string>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const canAct = isEmployeeId(getEmployeeId());
  const issue = snapshot.issues.find((item) => item.id === selected);
  const items = snapshot.issues.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      (type === "all" || item.type === type) &&
      `${item.id} ${item.title} ${item.developerEmployeeId}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const filtering = Boolean(query || status !== "all" || type !== "all");
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      layoutId="aireq-issue-progress-v1"
      className="min-h-0 flex-1"
      panelIds={issue ? ["issues", "issue-report"] : ["issues"]}
    >
      <ResizablePanel
        id="issues"
        defaultSize={issue ? "65%" : "100%"}
        minSize="360px"
        className="min-w-0"
      >
        <div className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-4 md:px-6 md:py-6">
            <IssuePageHeading page="issueProgress" scope={scope} />
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-2">
                <Label htmlFor="issue-progress-search">搜索 Issue</Label>
                <Input
                  id="issue-progress-search"
                  placeholder="编号、标题或开发人员工号"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="w-36">
                <IssueSelect
                  id="issue-progress-status"
                  label="状态"
                  value={status}
                  onChange={setStatus}
                >
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(ISSUE_STATUSES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </IssueSelect>
              </div>
              <div className="w-36">
                <IssueSelect id="issue-progress-type" label="类型" value={type} onChange={setType}>
                  <SelectItem value="all">全部类型</SelectItem>
                  {Object.entries(ISSUE_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </IssueSelect>
              </div>
              {filtering && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setType("all");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </div>
            <IssueTable
              label="Issue 进度列表"
              columns={["", "w-24", "w-24", "w-28", "w-48", "w-36"]}
              headings={["Issue", "状态", "进度", "开发人员", "开发分支", "类型 / 优先级"]}
            >
              {items.length ? (
                items.map((item) => (
                  <MarkdownTableRow
                    key={item.id}
                    tabIndex={0}
                    aria-label={`查看 ${item.id} ${item.title}`}
                    data-state={selected === item.id ? "selected" : undefined}
                    className={`cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-input-border-focused ${selected === item.id ? "bg-selected" : ""}`}
                    onClick={(event) => {
                      if (
                        event.target instanceof Element &&
                        event.target.closest("button, a, input, [role=button]")
                      )
                        return;
                      setSelected(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.target !== event.currentTarget ||
                        (event.key !== "Enter" && event.key !== " ")
                      )
                        return;
                      event.preventDefault();
                      setSelected(item.id);
                    }}
                  >
                    <MarkdownTableCell className={cell}>
                      <span className="line-clamp-2 font-medium" title={item.title}>
                        {item.title}
                      </span>
                      <p
                        className="mt-1 truncate text-ui-sm text-foreground-subtle"
                        title={item.requirement?.srId ?? item.requirement?.irId}
                      >
                        {item.id}
                        {item.requirement
                          ? ` · ${item.requirement.srId ?? item.requirement.irId}`
                          : " · 独立跟踪"}
                      </p>
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <IssueStatus issue={item} />
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <span className="tabular-nums">{item.percent}%</span>
                      <Progress
                        className="mt-1 h-1"
                        indicatorClassName={progressIndicatorClass[item.status]}
                        value={item.percent}
                        aria-label={`${item.id} 进度 ${item.percent}%`}
                      />
                    </MarkdownTableCell>
                    <MarkdownTableCell className={`${cell} whitespace-nowrap`}>
                      {item.developerEmployeeId}
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <BranchCopy branch={item.branch} onMessage={onMessage} />
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      {ISSUE_TYPES[item.type]} · {priorityLabels[item.priority]}
                    </MarkdownTableCell>
                  </MarkdownTableRow>
                ))
              ) : (
                <MarkdownTableRow>
                  <MarkdownTableCell
                    colSpan={6}
                    className={`${cell} h-40 text-center text-foreground-subtle`}
                  >
                    {snapshot.issues.length ? (
                      <div className="space-y-3">
                        <p>没有匹配的 Issue。</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setQuery("");
                            setStatus("all");
                            setType("all");
                          }}
                        >
                          清除筛选
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p>暂无 Issue。</p>
                        <Button variant="outline" onClick={() => aireq.setMainView("issueCreate")}>
                          新建 Issue
                        </Button>
                      </div>
                    )}
                  </MarkdownTableCell>
                </MarkdownTableRow>
              )}
            </IssueTable>
            <p className="text-ui-sm text-foreground-subtle">
              共 {items.length} 个 Issue
              {/* 无结果时没有可点击行，不展示与空态矛盾的操作提示。 */}
              {items.length > 0 && " · 点击任意一行查看报告和材料。"}
              {items.length > 0 && issue && "可横向滚动查看其余列。"}
            </p>
          </div>
        </div>
      </ResizablePanel>
      {issue && (
        <>
          <ResizableHandle />
          <ResizablePanel
            id="issue-report"
            defaultSize="35%"
            minSize="320px"
            maxSize="50%"
            className="min-w-0"
          >
            <aside aria-label="Issue 详情" className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-4 md:px-6 md:py-6">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-ui-sm text-foreground-subtle">{issue.id}</p>
                      <h2 className="mt-1 break-words text-ui-lg font-medium">{issue.title}</h2>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="关闭 Issue 详情"
                      onClick={() => setSelected(undefined)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <IssueStatus issue={issue} />
                    <span className="tabular-nums">{issue.percent}%</span>
                    <Progress
                      className="h-1 flex-1"
                      indicatorClassName={progressIndicatorClass[issue.status]}
                      value={issue.percent}
                      aria-label={`${issue.id} 进度 ${issue.percent}%`}
                    />
                  </div>
                  <BranchCopy branch={issue.branch} onMessage={onMessage} />
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-ui-sm">
                    <dt className="text-foreground-subtle">开发人员</dt>
                    <dd>{issue.developerEmployeeId}</dd>
                    <dt className="text-foreground-subtle">关联需求</dt>
                    <dd className="break-words">
                      {issue.requirement?.srId ?? issue.requirement?.irId ?? "未关联"}
                    </dd>
                    <dt className="text-foreground-subtle">最近更新</dt>
                    <dd>{time(issue.updatedAt)}</dd>
                  </dl>
                  <Tabs defaultValue="report" key={issue.id}>
                    <TabsList aria-label="Issue 详情内容">
                      <TabsTrigger value="report">报告</TabsTrigger>
                      <TabsTrigger value="material">材料</TabsTrigger>
                    </TabsList>
                    <TabsContent value="report" className="space-y-5 pt-4">
                      <section className="space-y-2">
                        <h3 className="font-medium">进度分析</h3>
                        <p className="whitespace-pre-wrap break-words leading-7">{issue.report}</p>
                      </section>
                      <section className="space-y-2">
                        <h3 className="font-medium">遗留问题</h3>
                        {issue.remaining.length ? (
                          <ul className="list-disc space-y-2 break-words pl-5 leading-7">
                            {issue.remaining.map((item, index) => (
                              <li key={`${index}:${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-foreground-subtle">暂无遗留问题。</p>
                        )}
                      </section>
                    </TabsContent>
                    <TabsContent value="material" className="space-y-5 pt-4">
                      <section>
                        <h3 className="mb-2 font-medium">问题说明</h3>
                        <p className="whitespace-pre-wrap break-words leading-7">
                          {issue.description}
                        </p>
                      </section>
                      <section>
                        <h3 className="mb-2 font-medium">完成标准</h3>
                        <p className="whitespace-pre-wrap break-words leading-7">
                          {issue.acceptance}
                        </p>
                      </section>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
              <div className="shrink-0 border-t border-border px-4 py-4 md:px-6">
                {issue.status === "completed" ? (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      disabled={pending || !canAct}
                      onClick={() => {
                        setReason("");
                        setReopenOpen(true);
                      }}
                    >
                      重新打开
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(!issue.merged || issue.percent !== 99 || !issue.branch?.trim()) && (
                      <p className="text-ui-sm leading-6 text-foreground-subtle">
                        仅当 AI 分析到 99% 且开发分支已合入默认分支，才可人工确认到 100%。
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button
                        disabled={
                          pending ||
                          !canAct ||
                          !issue.merged ||
                          issue.percent !== 99 ||
                          !issue.branch?.trim()
                        }
                        onClick={() => setConfirmOpen(true)}
                      >
                        确认完成
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
                  <DialogTitle>确认完成 {issue.id}？</DialogTitle>
                  <DialogDescription>
                    请核对完成标准。确认后进度记为 100%，此 Issue 将停止自动分析。
                  </DialogDescription>
                  {mutationError && (
                    <p role="alert" className="text-ui-sm text-destructive">
                      {mutationError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                      取消
                    </Button>
                    <Button
                      disabled={
                        pending ||
                        !canAct ||
                        !issue.merged ||
                        issue.percent !== 99 ||
                        !issue.branch?.trim()
                      }
                      onClick={() =>
                        void mutate(async () => {
                          await service.confirm(scope, issue.id);
                          setConfirmOpen(false);
                        }, "Issue 已确认完成。")
                      }
                    >
                      确认完成
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
                <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
                  <DialogTitle>重新打开 {issue.id}</DialogTitle>
                  <DialogDescription>
                    记录遗留问题并恢复进度跟踪，不改变关联需求或回滚 Git。
                  </DialogDescription>
                  {mutationError && (
                    <p role="alert" className="text-ui-sm text-destructive">
                      {mutationError}
                    </p>
                  )}
                  <Label htmlFor="issue-reopen-reason">重新打开原因</Label>
                  <Textarea
                    id="issue-reopen-reason"
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setReopenOpen(false)}>
                      取消
                    </Button>
                    <Button
                      disabled={pending || !canAct || !reason.trim()}
                      onClick={() =>
                        void mutate(async () => {
                          await service.reopen(scope, issue.id, reason);
                          setReopenOpen(false);
                        }, "Issue 已重新打开。")
                      }
                    >
                      重新打开
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </aside>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
