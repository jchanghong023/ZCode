import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, CheckCheck, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import {
  deriveAIReqTodos,
  fullReviewReadyBlocker,
  requirementsReviewReadyBlocker,
  proposalUpdatedTime,
  proposalStateLabel,
  progressLabel,
  srProgress,
  srProgressStatus,
} from "../contract.js";
import type { AIReqRequirementGroup, AIReqProgressStatus } from "../contract.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "../shell/pageLayout.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";
import { OverviewProgress } from "./OverviewProgress.js";

type ConfirmationFilter = "all" | "review" | "business" | "development" | "testing";
const statusEn: Record<AIReqProgressStatus, string> = {
  待开发: "Not started",
  开发中: "In development",
  待合入: "Awaiting merge",
  待验收: "Awaiting acceptance",
  已完成: "Completed",
};
export function AIReqProjectOverviewPage({
  active,
  onReturnProjects,
  onConfigureProject,
}: {
  active: boolean;
  onReturnProjects(): void;
  onConfigureProject(): void;
}) {
  const ai = useAIReq()!;
  const scrollRoot = useRef<HTMLElement>(null);
  const scrollPosition = useRef(0);
  // 页面保留挂载；中间加载态会收短内容，不能把它造成的滚动归零当成用户滚动。
  useLayoutEffect(() => {
    if (active && ai.selectionReady && scrollRoot.current)
      scrollRoot.current.scrollTop = scrollPosition.current;
  }, [active, ai.selectionReady]);
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [confirmationFilter, setConfirmationFilter] = useState<ConfirmationFilter>("all");
  const [showAllPending, setShowAllPending] = useState(false);
  const view = ai.view;
  const project = view?.projects.find((item) => item.id === ai.selection.projectId);
  const release = view?.releases.find(
    (item) => item.projectId === project?.id && item.id === ai.releaseId,
  );
  const summary =
    ai.selectionReady && release
      ? view?.projectProgress
          ?.find((item) => item.projectId === project?.id)
          ?.releases.find((item) => item.releaseId === release.id)
      : undefined;
  const proposals =
    view?.drafts.filter(
      (item) => item.projectId === project?.id && item.releaseId === release?.id,
    ) ?? [];
  const formalIds = new Set(summary?.requirements.map((item) => item.irId) ?? []);
  const srs =
    view?.srs.filter((sr) => sr.projectId === project?.id && formalIds.has(sr.irId)) ?? [];
  const completed = srs.filter((sr) => srProgress(sr) === 100).length;
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const todos = view
    ? deriveAIReqTodos(view).filter((todo) => {
        if (todo.projectId !== project?.id || todo.releaseId !== release?.id) return false;
        const proposal = proposalsById.get(todo.irId);
        if (!proposal) return false;
        if (todo.kind === "original-review")
          return (
            !requirementsReviewReadyBlocker(proposal) &&
            proposal.originalReview?.humanDecision?.reviewId !== proposal.originalReview?.id
          );
        if (todo.kind === "full-review")
          return (
            !fullReviewReadyBlocker(proposal) &&
            proposal.review?.humanDecision?.reviewId !== proposal.review?.id
          );
        return todo.kind === "alignment";
      })
    : [];
  const matches = (kind: ConfirmationFilter) =>
    todos.filter(
      (todo) =>
        kind === "all" ||
        (kind === "review"
          ? todo.kind !== "alignment"
          : todo.kind === "alignment" && todo.perspective === kind),
    );
  const filters: { id: ConfirmationFilter; label: string }[] = [
    { id: "all", label: zh ? "待人工处理提案" : "Proposals awaiting people" },
    { id: "review", label: zh ? "人工判断／放行" : "Review decisions" },
    { id: "business", label: zh ? "业务确认" : "Business confirmation" },
    { id: "development", label: zh ? "开发确认" : "Development confirmation" },
    { id: "testing", label: zh ? "测试视角确认" : "Testing confirmation" },
  ];
  const pendingIds = new Set(matches(confirmationFilter).map((todo) => todo.irId));
  const pending = proposals.filter((item) => pendingIds.has(item.id));
  const recent = [...proposals]
    .sort(
      (a, b) =>
        proposalUpdatedTime(b, view?.operations ?? []) -
          proposalUpdatedTime(a, view?.operations ?? []) || a.id.localeCompare(b.id),
    )
    .slice(0, 5);
  const recentSrs = srs
    .filter((sr) => sr.statusChange)
    .sort(
      (a, b) => b.statusChange!.at.localeCompare(a.statusChange!.at) || a.id.localeCompare(b.id),
    )
    .slice(0, 5);
  const time = (value: number | string) =>
    new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const openProposal = (proposal: AIReqRequirementGroup) =>
    ai.openFromProjectOverview(
      "chat",
      { projectId: proposal.projectId, irId: proposal.id },
      proposal.releaseId,
    );
  const unavailable = ai.pending
    ? zh
      ? "正在读取当前项目…"
      : "Loading current project…"
    : zh
      ? "当前项目数据不可用，请重试。"
      : "Project data is unavailable. Retry to continue.";
  const empty = (text: string) => (
    <p className="px-4 py-8 text-ui-sm text-foreground-subtle">{text}</p>
  );

  return (
    <main
      ref={scrollRoot}
      onScroll={(event) => {
        if (active && ai.selectionReady) scrollPosition.current = event.currentTarget.scrollTop;
      }}
      className="h-full min-h-0 min-w-0 overflow-y-auto bg-background text-ui-base [scrollbar-gutter:stable_both-edges] [&_button:focus-visible]:border-remote-foreground-muted"
      data-testid="aireq-project-overview"
      aria-label={zh ? "当前项目" : "Current project"}
    >
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-8"}>
        <header className="flex items-center gap-2">
          <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>{zh ? "当前项目" : "Current project"}</h1>
          {active && <ProjectPageHelp scope="project-overview" />}
        </header>
        <p
          role="status"
          className={ai.error && view ? "text-ui-sm text-foreground-subtle" : "sr-only"}
        >
          {ai.error && view
            ? zh
              ? "显示上次成功读取结果，请使用上方重试入口。"
              : "Showing the last successful read. Use Retry above."
            : ai.pending
              ? zh
                ? "正在更新…"
                : "Updating…"
              : ""}
        </p>
        {!ai.selectionReady ? (
          <div role="status" className="space-y-3 text-foreground-subtle">
            <p>{unavailable}</p>
            {!ai.pending && (
              <Button variant="outline" onClick={() => void ai.refresh()}>
                {zh ? "重试" : "Retry"}
              </Button>
            )}
          </div>
        ) : !project ? (
          <div className="space-y-3">
            <p>
              {zh
                ? "请在左侧选择项目，或添加第一个项目。"
                : "Choose a project in the sidebar, or add your first project."}
            </p>
            <Button variant="outline" onClick={onReturnProjects}>
              {zh ? "项目总览" : "Projects"}
            </Button>
          </div>
        ) : !release ? (
          <div className="space-y-3">
            <h2 className="text-ui-xl font-semibold">
              {zh ? "当前项目尚无 Release" : "No releases in this project"}
            </h2>
            <p className="text-foreground-subtle">
              {zh
                ? "添加 Release 后，即可查看需求、确认事项和开发进展。"
                : "Add a release to see requirements, confirmations and delivery progress."}
            </p>
            <Button variant="outline" onClick={onConfigureProject}>
              {zh ? "配置项目" : "Configure project"}
            </Button>
          </div>
        ) : !summary ? (
          <div role="status" className="space-y-3">
            <p>{unavailable}</p>
            {!ai.pending && (
              <Button variant="outline" onClick={() => void ai.refresh()}>
                {zh ? "重试" : "Retry"}
              </Button>
            )}
          </div>
        ) : (
          <>
            <section
              aria-labelledby="overview-delivery"
              className="space-y-6 border-b border-border pb-8"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="overview-delivery" className="text-ui-xl font-semibold">
                  {zh ? "需求与交付" : "Requirements & delivery"}
                </h2>
              </div>
              {/* 数据区原先透出页面底色、辅助文字混用侧栏灰；按外观页卡片与文字角色呈现。 */}
              <dl
                data-aireq-motion-card=""
                className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border border-card-border bg-card p-4 text-foreground lg:grid-cols-4"
              >
                {[
                  {
                    label: zh ? "正式需求 IR" : "Formal requirements · IR",
                    count: summary.formalCount,
                    target: "formal" as const,
                  },
                  {
                    label: zh ? "需求提案" : "Proposals",
                    count: summary.proposalCount,
                    target: "proposals" as const,
                  },
                  {
                    label: zh ? "开发任务 SR" : "Development tasks · SR",
                    count: summary.srCount,
                    target: "formal" as const,
                  },
                  {
                    label: zh ? "已完成 SR" : "Completed SRs",
                    count: completed,
                    target: "formal" as const,
                  },
                ].map((item) => (
                  <div key={item.label} data-aireq-motion-stat="" className="space-y-1 rounded-lg">
                    <dt className="text-ui-sm text-foreground">{item.label}</dt>
                    <dd>
                      <Button
                        variant="link"
                        className="h-auto gap-2 p-0 text-ui-xl font-semibold tabular-nums text-foreground"
                        aria-label={`${item.label}: ${item.count}`}
                        onClick={() => ai.openFromProjectOverview(item.target)}
                      >
                        {item.count}
                        <ArrowRight
                          className="size-3.5 text-foreground-subtle"
                          aria-hidden="true"
                        />
                      </Button>
                    </dd>
                  </div>
                ))}
              </dl>
              {/* 上方信息卡同样需要局部反馈；整体进度保持原位，不重播真实进度。 */}
              <div
                data-aireq-motion-card=""
                className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-card-border bg-card px-4 py-3 text-foreground"
              >
                <div className="flex min-w-56 flex-1 items-center gap-4">
                  <span className="shrink-0 text-ui-sm">
                    {zh ? "整体进度" : "Overall progress"}
                  </span>
                  <div className="flex-1">
                    <OverviewProgress
                      percent={summary.percent}
                      formalCount={summary.formalCount}
                      label={release.title}
                      zh={zh}
                    />
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-ui-sm text-foreground-subtle">
                  <CheckCheck className="size-4" aria-hidden="true" />
                  {zh
                    ? `人工验收完成 ${completed} / ${srs.length}`
                    : `Accepted ${completed} / ${srs.length}`}
                  {srs.length > 0 ? ` · ${progressLabel((completed / srs.length) * 100)}` : ""}
                </span>
              </div>
              {summary.unanalyzedCount > 0 && (
                <p className="text-ui-sm text-foreground-subtle">
                  {zh
                    ? `未分析 SR ${summary.unanalyzedCount}`
                    : `Unanalyzed SRs ${summary.unanalyzedCount}`}
                </p>
              )}
            </section>
            <section aria-labelledby="overview-confirmations" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="overview-confirmations" className="text-ui-xl font-semibold">
                  {zh ? "待人工处理" : "Awaiting people"}
                </h2>
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={zh ? "确认事项筛选" : "Filter confirmations"}
                data-aireq-motion-filters=""
              >
                {filters.map((filter) => (
                  <Button
                    key={filter.id}
                    variant={confirmationFilter === filter.id ? "secondary" : "outline"}
                    className="h-auto min-h-9 gap-3 py-2"
                    aria-pressed={confirmationFilter === filter.id}
                    onClick={() => {
                      setConfirmationFilter(filter.id);
                      setShowAllPending(false);
                    }}
                  >
                    {filter.label}
                    <span className="font-semibold tabular-nums">
                      {new Set(matches(filter.id).map((todo) => todo.irId)).size}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-card-border bg-card text-foreground">
                {pending.length === 0
                  ? empty(
                      zh
                        ? "当前范围暂无此类待确认事项。"
                        : "No pending confirmations in this scope.",
                    )
                  : (showAllPending ? pending : pending.slice(0, 5)).map((proposal) => (
                      <button
                        key={proposal.id}
                        type="button"
                        data-aireq-motion-row=""
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:bg-surface-hover hover:[&_.text-foreground-subtle]:text-foreground focus-visible:[&_.text-foreground-subtle]:text-foreground"
                        onClick={() => openProposal(proposal)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{proposal.title}</span>
                          <span className="mt-1 block text-ui-sm text-foreground-subtle">
                            {zh
                              ? todos
                                  .filter((todo) => todo.irId === proposal.id)
                                  .map((todo) => todo.title)
                                  .join("、")
                              : "Open co-creation to confirm"}
                          </span>
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0 text-foreground-subtle"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
              </div>
              {pending.length > 5 && (
                <Button variant="ghost" onClick={() => setShowAllPending(!showAllPending)}>
                  {showAllPending
                    ? zh
                      ? "收起"
                      : "Show less"
                    : zh
                      ? `查看全部 ${pending.length} 条`
                      : `View all ${pending.length}`}
                </Button>
              )}
            </section>
            <div className="grid gap-8 @min-[60rem]/conversation:grid-cols-2">
              <section aria-labelledby="overview-recent-proposals" className="min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="overview-recent-proposals" className="text-ui-xl font-semibold">
                    {zh ? "最近更新的提案" : "Recently updated proposals"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => ai.openFromProjectOverview("proposals")}
                  >
                    {zh ? "查看全部" : "View all"}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-card-border bg-card text-foreground">
                  {recent.length === 0
                    ? empty(zh ? "当前 Release 暂无需求提案。" : "No proposals in this release.")
                    : recent.map((proposal) => (
                        <button
                          key={proposal.id}
                          type="button"
                          data-aireq-motion-row=""
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:bg-surface-hover hover:[&_.text-foreground-subtle]:text-foreground focus-visible:[&_.text-foreground-subtle]:text-foreground"
                          onClick={() => openProposal(proposal)}
                        >
                          <span className="min-w-0 flex-1 space-y-1.5">
                            <span className="block truncate font-medium">{proposal.title}</span>
                            <span className="block text-ui-sm text-foreground-subtle">
                              {proposalStateLabel(proposal, zh ? "zh-CN" : "en-US")}
                            </span>
                            <time
                              className="flex items-center gap-1.5 text-ui-sm text-foreground-subtle"
                              dateTime={new Date(
                                proposalUpdatedTime(proposal, view?.operations ?? []),
                              ).toISOString()}
                            >
                              <Clock3 className="size-3.5" aria-hidden="true" />
                              {time(proposalUpdatedTime(proposal, view?.operations ?? []))}
                            </time>
                          </span>
                          <ArrowRight
                            className="mt-1 size-4 shrink-0 text-foreground-subtle"
                            aria-hidden="true"
                          />
                        </button>
                      ))}
                </div>
              </section>
              <section aria-labelledby="overview-recent-srs" className="min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="overview-recent-srs" className="text-ui-xl font-semibold">
                    {zh ? "最近状态变化的 SR" : "Recent SR status changes"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => ai.openFromProjectOverview("formal")}
                  >
                    {zh ? "查看全部" : "View all"}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-card-border bg-card text-foreground">
                  {recentSrs.length === 0
                    ? empty(
                        zh
                          ? "当前 Release 暂无已记录的状态变化。"
                          : "No recorded status changes in this release.",
                      )
                    : recentSrs.map((sr) => {
                        const change = sr.statusChange!;
                        const parent = view?.groups.find(
                          (item) => item.projectId === sr.projectId && item.id === sr.irId,
                        );
                        return (
                          <button
                            key={sr.id}
                            type="button"
                            data-aireq-motion-row=""
                            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:bg-surface-hover hover:[&_.text-foreground-subtle]:text-foreground focus-visible:[&_.text-foreground-subtle]:text-foreground"
                            onClick={() =>
                              ai.openFromProjectOverview(
                                "chat",
                                {
                                  projectId: sr.projectId,
                                  irId: sr.irId,
                                  srId: sr.id,
                                  formalView: "detail",
                                },
                                release.id,
                              )
                            }
                          >
                            <span className="min-w-0 flex-1 space-y-1.5">
                              <span className="block truncate font-medium">{sr.title}</span>
                              {parent && (
                                <span className="block truncate text-ui-sm text-foreground-subtle">
                                  {parent.title}
                                </span>
                              )}
                              <span className="flex flex-wrap items-center gap-2 text-ui-sm">
                                {change.from && (
                                  <>
                                    <span className="text-foreground-subtle">
                                      {zh ? change.from : statusEn[change.from]}
                                    </span>
                                    <ArrowRight className="size-3" aria-hidden="true" />
                                  </>
                                )}
                                <Badge variant="secondary">
                                  {zh ? srProgressStatus(sr) : statusEn[srProgressStatus(sr)]}
                                </Badge>
                                <time className="text-foreground-subtle" dateTime={change.at}>
                                  {time(change.at)}
                                </time>
                              </span>
                            </span>
                            <ArrowRight
                              className="mt-1 size-4 shrink-0 text-foreground-subtle"
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
