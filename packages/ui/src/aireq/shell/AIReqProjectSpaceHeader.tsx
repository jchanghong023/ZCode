import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

export function AIReqProjectSpaceHeader({ onReturnProjects }: { onReturnProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = ai.view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const formal = Boolean(
    ai.selection.formalView ||
    ai.view?.groups.some((item) => item.projectId === project?.id && item.id === ai.selection.irId),
  );
  const release = releases.find((item) => item.id === ai.releaseId);
  if (ai.mainView === "chat" && !formal) {
    const proposal = ai.view?.drafts.find(
      (item) => item.projectId === project?.id && item.id === ai.selection.irId,
    );
    const requirementRelease = releases.find((item) => item.id === proposal?.releaseId);
    return (
      <header className="shrink-0 border-b border-border/50" data-testid="aireq-discussion-header">
        <div className={`mx-auto min-w-0 px-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
          <nav
            aria-label={zh ? "需求讨论导航" : "Requirement discussion navigation"}
            className="flex min-h-12 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-3 pb-2 text-ui-sm"
          >
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 text-foreground-subtle"
              onClick={() => ai.navigate(() => ai.setMainView("proposals"))}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {zh ? "返回需求共创" : "Back to co-creation"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-60 text-foreground-subtle"
              aria-label={
                zh
                  ? `返回项目概览：${project?.name ?? "项目"}`
                  : `Back to project overview: ${project?.name ?? "Project"}`
              }
              onClick={() => ai.navigate(() => ai.setMainView("projectOverview"))}
            >
              <span className="truncate">{project?.name ?? (zh ? "项目" : "Project")}</span>
            </Button>
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtlest"
              aria-hidden="true"
            />
            <span aria-current="page" className="font-medium">
              {zh ? "需求讨论" : "Discussion"}
            </span>
            <Button variant="ghost" size="sm" onClick={onReturnProjects}>
              {zh ? "切换项目" : "Switch project"}
            </Button>
            {requirementRelease && (
              <span
                className="ml-auto min-w-0 truncate text-foreground-subtle"
                title={requirementRelease.title}
              >
                {requirementRelease.title}
              </span>
            )}
          </nav>
        </div>
      </header>
    );
  }
  const title =
    ai.mainView === "projectOverview"
      ? zh
        ? "项目概览"
        : "Project overview"
      : ai.mainView === "requirementAnalysis"
        ? zh
          ? "进度分析"
          : "Progress analysis"
        : ai.mainView === "formal" || formal
          ? zh
            ? "开发任务"
            : "Development tasks"
          : zh
            ? "需求共创"
            : "Co-creation";
  return (
    <header className="shrink-0 border-b border-border/50" data-testid="aireq-project-space-header">
      <div
        className={`mx-auto flex min-h-16 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-2 py-3 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}
      >
        {/* 项目是页面的上级；返回本项目概览沿用当前版本，不走会重置范围的项目打开动作。 */}
        {project && ai.mainView !== "projectOverview" ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 max-w-60 text-ui-sm text-foreground-subtle"
            title={project.name}
            aria-label={
              zh ? `返回项目概览：${project.name}` : `Back to project overview: ${project.name}`
            }
            onClick={() => ai.navigate(() => ai.setMainView("projectOverview"))}
          >
            <span className="truncate">{project.name}</span>
          </Button>
        ) : (
          <span
            className="min-w-0 max-w-60 truncate text-ui-sm text-foreground-subtle"
            title={project?.name}
          >
            {project?.name ?? (zh ? "项目" : "Project")}
          </span>
        )}
        <ChevronRight className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <h1 aria-current="page" className="shrink-0 text-ui-lg font-medium">
          {title}
        </h1>
        <Button variant="ghost" size="sm" onClick={onReturnProjects}>
          {zh ? "切换项目" : "Switch project"}
        </Button>
        <Select
          value={release?.id ?? (ai.releaseId || "all")}
          onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id === "all" ? "" : id))}
          disabled={!project || !releases.length || !ai.selectionReady}
        >
          <SelectTrigger
            className="ml-auto w-52 max-w-full"
            aria-label={zh ? "当前版本" : "Current release"}
          >
            <SelectValue placeholder={zh ? "选择版本" : "Choose release"} />
          </SelectTrigger>
          <SelectContent>
            {ai.releaseId && !release && (
              <SelectItem value={ai.releaseId} disabled>
                {zh ? "正在读取版本…" : "Loading release…"}
              </SelectItem>
            )}
            <SelectItem value="all">{zh ? "全部版本" : "All releases"}</SelectItem>
            {releases.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* 目标快照未就绪时，旧项目的版本列表不能作为空项目的证据。 */}
        {ai.selectionReady && (!project || !releases.length) && (
          <div className="flex w-full flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle">
            <span>
              {!project
                ? zh
                  ? "请选择项目，或返回项目总览添加项目。"
                  : "Choose a project or add one from the project overview."
                : zh
                  ? "当前项目尚无版本。"
                  : "This project has no releases."}
            </span>
            <Button variant="link" size="sm" onClick={onReturnProjects}>
              {zh ? "返回项目总览" : "Back to projects"}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
