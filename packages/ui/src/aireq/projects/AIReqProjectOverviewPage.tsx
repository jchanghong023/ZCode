import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { deriveAIReqTodos, proposalUpdatedTime, proposalStateLabel } from "../contract.js";
import type { AIReqRequirementGroup } from "../contract.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";

type ConfirmationFilter = "all" | "review" | "business" | "development" | "testing";
export function AIReqProjectOverviewPage({
  active,
  onReturnProjects,
  onConfigureProject,
  onCreateProposal,
}: {
  active: boolean;
  onReturnProjects(): void;
  onConfigureProject(): void;
  onCreateProposal(trigger: HTMLButtonElement): void;
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
  const proposals =
    view?.drafts.filter(
      (item) => item.projectId === project?.id && item.releaseId === release?.id,
    ) ?? [];
  // The view contains every draft for the project, but its todos are filtered by operator role.
  const confirmationTodos = view
    ? deriveAIReqTodos({ drafts: proposals }).filter(
        (todo) => todo.kind === "original-review" || todo.kind === "alignment",
      )
    : [];
  const matches = (kind: ConfirmationFilter) =>
    confirmationTodos.filter(
      (todo) =>
        kind === "all" ||
        (kind === "review"
          ? todo.kind === "original-review"
          : todo.kind === "alignment" && todo.perspective === kind),
    );
  const pendingLabel = zh ? "待人工处理提案" : "Proposals awaiting people";
  const filters: { id: ConfirmationFilter; label: string }[] = [
    { id: "all", label: pendingLabel },
    { id: "review", label: zh ? "需求评审确认" : "Requirements review confirmation" },
    { id: "business", label: zh ? "业务确认" : "Business confirmation" },
    { id: "development", label: zh ? "开发确认" : "Development confirmation" },
    { id: "testing", label: zh ? "测试确认" : "Testing confirmation" },
  ];
  const allPendingCount = new Set(confirmationTodos.map((todo) => todo.irId)).size;
  const pendingIds = new Set(matches(confirmationFilter).map((todo) => todo.irId));
  const pending = proposals.filter((item) => pendingIds.has(item.id));
  const recent = [...proposals]
    .sort(
      (a, b) =>
        proposalUpdatedTime(b, view?.operations ?? []) -
          proposalUpdatedTime(a, view?.operations ?? []) || a.id.localeCompare(b.id),
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
      aria-label={zh ? "项目概览" : "Project overview"}
    >
      <div className={AIREQ_PAGE_CONTENT_CLASSNAME + " min-w-0 space-y-8"}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ScopedPageTitle title={zh ? "项目概览" : "Project overview"} />
            {active && <ProjectPageHelp scope="project-overview" />}
          </div>
          {ai.selectionReady && release && (
            <Button onClick={(event) => onCreateProposal(event.currentTarget)}>
              {zh ? "新建需求" : "New requirement"}
            </Button>
          )}
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
              {zh ? "所有项目" : "All projects"}
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
                : "Add a release to see requirements, confirmations and formal documents."}
            </p>
            <Button variant="outline" onClick={onConfigureProject}>
              {zh ? "配置项目" : "Configure project"}
            </Button>
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
                className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border border-card-border bg-card p-4 text-foreground lg:grid-cols-3"
              >
                {[
                  {
                    label: zh ? "正式文档" : "Formal documents",
                    count: release.formalCount,
                    target: "formal" as const,
                  },
                  {
                    label: zh ? "需求提案" : "Proposals",
                    count: release.proposalCount,
                    target: "proposals" as const,
                  },
                  {
                    label: pendingLabel,
                    count: allPendingCount,
                  },
                ].map((item) => (
                  <div key={item.label} data-aireq-motion-stat="" className="space-y-1 rounded-lg">
                    <dt className="text-ui-sm text-foreground">{item.label}</dt>
                    <dd>
                      {item.target ? (
                        <Button
                          variant="link"
                          className="h-auto gap-2 p-0 text-ui-xl font-semibold tabular-nums text-foreground"
                          aria-label={item.label + ": " + item.count}
                          onClick={() => item.target && ai.openFromProjectOverview(item.target)}
                        >
                          {item.count}
                          <ArrowRight
                            className="size-3.5 text-foreground-subtle"
                            aria-hidden="true"
                          />
                        </Button>
                      ) : (
                        <span className="text-ui-xl font-semibold tabular-nums">{item.count}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
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
                              ? confirmationTodos
                                  .filter((todo) => todo.irId === proposal.id)
                                  .map((todo) => todo.title)
                                  .join("、")
                              : "Open co-creation"}
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
            <div>
              <section aria-labelledby="overview-recent-proposals" className="min-w-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="overview-recent-proposals" className="text-ui-xl font-semibold">
                    {zh ? "最近更新的提案" : "Recently updated proposals"}
                  </h2>
                  {recent.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => ai.openFromProjectOverview("proposals")}
                    >
                      {zh ? "查看全部" : "View all"}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-card-border bg-card text-foreground">
                  {recent.length === 0 ? (
                    <div className="space-y-3 px-4 py-6">
                      <p className="text-ui-sm text-foreground-subtle">
                        {zh ? "当前 Release 暂无需求提案。" : "No proposals in this release."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => onCreateProposal(event.currentTarget)}
                      >
                        {zh ? "新建需求" : "New requirement"}
                      </Button>
                    </div>
                  ) : (
                    recent.map((proposal) => (
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
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
