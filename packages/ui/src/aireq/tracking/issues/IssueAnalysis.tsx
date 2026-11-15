import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { AIReqIssueScope, AIReqIssueServices, AIReqIssueSnapshot } from "../../contract.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Badge } from "@/components/ui/badge.js";
import { Progress } from "@/components/ui/progress.js";
import { Switch } from "@/components/ui/switch.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.js";
import { MarkdownTableCell, MarkdownTableRow } from "@/components/ai-elements/markdown-table.js";
import { useAIReqDataSource } from "../../data-source.js";
import { AnalysisRunConfirmation } from "../AnalysisRunConfirmation.js";
import { BranchCopy } from "../BranchCopy.js";
import { RunModelFacts } from "../RunModelFacts.js";
import {
  IssuePageHeading,
  IssueStatus,
  IssueTable,
  time,
  cell,
  type MutationProps,
} from "./shared.js";

export function IssueAnalysis({
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
  const source = useAIReqDataSource();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [enabled, setEnabled] = useState(snapshot.enabled);
  const [interval, setInterval] = useState(String(snapshot.intervalMinutes));
  const [tab, setTab] = useState("tasks");
  const [query, setQuery] = useState("");
  const canManage = source.capabilities.settingsWrite === true;
  const [analysisCount, setAnalysisCount] = useState(0);
  const matches = (id: string, title: string) =>
    `${id} ${title}`.toLowerCase().includes(query.trim().toLowerCase());
  const tasks = snapshot.issues.filter(
    (issue) => issue.status !== "completed" && matches(issue.id, issue.title),
  );
  const runs = snapshot.runs.filter((run) => matches(run.issueId, run.title));
  const [run, setRun] = useState<AIReqIssueSnapshot["runs"][number]>();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-4 md:px-6 md:py-6">
        <IssuePageHeading page="issueAnalysis" scope={scope} />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">{snapshot.enabled ? "自动分析已启用" : "自动分析已暂停"}</p>
            <p className="mt-1 text-ui-sm text-foreground-subtle">
              {snapshot.enabled
                ? `每 ${snapshot.intervalMinutes} 分钟检查 · 下次 ${time(snapshot.nextRunAt)}`
                : "可立即分析，也可在分析设置中启用自动分析。"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setEnabled(snapshot.enabled);
                setInterval(String(snapshot.intervalMinutes));
                setSettingsOpen(true);
              }}
            >
              <Settings2 className="size-4" />
              分析设置{!canManage && "（只读）"}
            </Button>
            <Button
              disabled={
                pending ||
                !canManage ||
                !snapshot.issues.some((issue) => issue.status !== "completed")
              }
              onClick={() => {
                setAnalysisCount(
                  snapshot.issues.filter((issue) => issue.status !== "completed").length,
                );
                setAnalysisOpen(true);
              }}
            >
              {pending ? "正在提交…" : "立即分析"}
            </Button>
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList aria-label="Issue 分析列表">
              <TabsTrigger value="tasks">
                分析任务{" "}
                <span className="ml-1 tabular-nums text-foreground-subtle">{tasks.length}</span>
              </TabsTrigger>
              <TabsTrigger value="history">
                分析历史{" "}
                <span className="ml-1 tabular-nums text-foreground-subtle">{runs.length}</span>
              </TabsTrigger>
            </TabsList>
            <div className="w-full min-w-0 sm:w-72">
              <Label htmlFor="issue-analysis-search" className="sr-only">
                搜索 Issue 分析
              </Label>
              <Input
                id="issue-analysis-search"
                placeholder="搜索 Issue 编号或标题"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <TabsContent value="tasks" className="mt-4">
            <IssueTable
              label="Issue 分析任务"
              columns={["", "w-48", "w-24", "w-28", "w-40"]}
              headings={["Issue", "开发分支", "状态", "进度", "最近更新"]}
            >
              {tasks.length ? (
                tasks.map((issue) => (
                  <MarkdownTableRow key={issue.id}>
                    <MarkdownTableCell className={cell}>
                      <p className="line-clamp-2 font-medium" title={issue.title}>
                        {issue.title}
                      </p>
                      <p className="mt-1 text-ui-sm text-foreground-subtle">{issue.id}</p>
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <BranchCopy branch={issue.branch} onMessage={onMessage} />
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <IssueStatus issue={issue} />
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <span className="tabular-nums">{issue.percent}%</span>
                      <Progress
                        className="mt-1 h-1"
                        indicatorClassName="bg-progress-surface-foreground"
                        value={issue.percent}
                        aria-label={`${issue.id} 进度 ${issue.percent}%`}
                      />
                    </MarkdownTableCell>
                    <MarkdownTableCell
                      className={`${cell} text-ui-sm tabular-nums text-foreground-subtle`}
                    >
                      {time(issue.updatedAt)}
                    </MarkdownTableCell>
                  </MarkdownTableRow>
                ))
              ) : (
                <MarkdownTableRow>
                  <MarkdownTableCell
                    colSpan={5}
                    className={`${cell} h-32 text-center text-foreground-subtle`}
                  >
                    {query
                      ? "没有匹配的 Issue。"
                      : "暂无待分析 Issue。新建 Issue 后会进入任务列表。"}
                  </MarkdownTableCell>
                </MarkdownTableRow>
              )}
            </IssueTable>
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <IssueTable
              label="Issue 分析历史"
              columns={["", "w-44", "w-24", "w-28"]}
              headings={["Issue", "分析时间", "结果", "报告"]}
            >
              {runs.length ? (
                runs.map((item) => (
                  <MarkdownTableRow key={item.id}>
                    <MarkdownTableCell className={cell}>
                      <p className="line-clamp-2 font-medium" title={item.title}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-ui-sm text-foreground-subtle">{item.issueId}</p>
                    </MarkdownTableCell>
                    <MarkdownTableCell className={`${cell} text-ui-sm tabular-nums`}>
                      {time(item.startedAt)}
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <Badge
                        variant="secondary"
                        // 状态表面与前景成对，避免自定义透明度破坏主题对比度。
                        className={`font-normal ${item.status === "succeeded" ? "bg-success-surface text-success-surface-foreground" : "bg-destructive-surface text-destructive-surface-foreground"}`}
                      >
                        {item.status === "succeeded" ? "成功" : "失败"}
                      </Badge>
                    </MarkdownTableCell>
                    <MarkdownTableCell className={cell}>
                      <Button variant="ghost" size="sm" onClick={() => setRun(item)}>
                        查看报告
                      </Button>
                    </MarkdownTableCell>
                  </MarkdownTableRow>
                ))
              ) : (
                <MarkdownTableRow>
                  <MarkdownTableCell
                    colSpan={4}
                    className={`${cell} h-32 text-center text-foreground-subtle`}
                  >
                    {query
                      ? "没有匹配的分析记录。"
                      : "暂无分析记录。完成首次分析后可在这里查看报告。"}
                  </MarkdownTableCell>
                </MarkdownTableRow>
              )}
            </IssueTable>
          </TabsContent>
        </Tabs>
        <AnalysisRunConfirmation
          open={analysisOpen}
          onOpenChange={setAnalysisOpen}
          scope="分析当前项目的全部未完成 Issue，不受列表搜索影响。"
          count={analysisCount}
          unit="Issue"
          disabled={pending || !canManage}
          onConfirm={() => {
            setAnalysisOpen(false);
            void mutate(() => service.runNow(scope), "已提交 Issue 分析请求。");
          }}
        />
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
            <DialogTitle>Issue 分析设置</DialogTitle>
            <DialogDescription>
              分析当前项目的未完成 Issue。独立使用 issue-analysis 角色模型与追加提示。
            </DialogDescription>
            {mutationError && (
              <p role="alert" className="text-ui-sm text-destructive">
                {mutationError}
              </p>
            )}
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="issue-analysis-enabled">启用自动分析</Label>
              <Switch
                id="issue-analysis-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={pending || !canManage}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-analysis-interval">分析间隔（分钟）</Label>
              <Input
                id="issue-analysis-interval"
                type="number"
                min={15}
                max={1440}
                value={interval}
                disabled={pending || !canManage}
                onChange={(event) => setInterval(event.target.value)}
              />
              <p className="text-ui-sm text-foreground-subtle">可设置 15 至 1440 分钟。</p>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={
                  pending ||
                  !canManage ||
                  !Number.isInteger(Number(interval)) ||
                  Number(interval) < 15 ||
                  Number(interval) > 1440
                }
                onClick={() =>
                  void mutate(async () => {
                    await service.configure(scope, enabled, Number(interval));
                    setSettingsOpen(false);
                  }, "Issue 分析设置已保存。")
                }
              >
                保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(run)}
          onOpenChange={(open) => {
            if (!open) setRun(undefined);
          }}
        >
          <DialogContent className="flex max-h-[80dvh] flex-col sm:max-w-2xl">
            <DialogTitle>{run?.issueId} · 分析报告</DialogTitle>
            <DialogDescription>
              {run?.title} · {time(run?.startedAt)}
            </DialogDescription>
            <div className="min-h-0 overflow-y-auto">
              <p className="whitespace-pre-wrap break-words text-ui-base leading-7">
                {run?.summary}
              </p>
              <RunModelFacts binding={run?.modelConfig} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
