import { useLayoutEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { ScopedPageTitle } from "../shell/ScopedPageTitle.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME } from "../shell/pageLayout.js";
import { ProjectPageHelp } from "./ProjectPageHelp.js";

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
  const view = ai.view;
  const project = view?.projects.find((item) => item.id === ai.selection.projectId);
  const release = view?.releases.find(
    (item) => item.projectId === project?.id && item.id === ai.releaseId,
  );
  const unavailable = ai.pending
    ? zh
      ? "正在读取当前项目…"
      : "Loading current project…"
    : zh
      ? "当前项目数据不可用，请重试。"
      : "Project data is unavailable. Retry to continue.";
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
                ? "添加 Release 后，即可录入和查看需求。"
                : "Add a release to create and view requirements."}
            </p>
            <Button variant="outline" onClick={onConfigureProject}>
              {zh ? "配置项目" : "Configure project"}
            </Button>
          </div>
        ) : (
          <section
            aria-label={zh ? "需求总览" : "Requirements overview"}
            data-aireq-motion-card=""
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-card-border bg-card px-4 py-5"
          >
            <dl>
              <dt className="text-ui-sm text-foreground-subtle">
                {zh ? "需求总数" : "Total requirements"}
              </dt>
              <dd className="text-ui-xl font-semibold tabular-nums">{release.requirementCount}</dd>
            </dl>
            <Button variant="outline" onClick={ai.openRequirementsFromOverview}>
              {zh ? "打开需求共创" : "Open Co-creation"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
