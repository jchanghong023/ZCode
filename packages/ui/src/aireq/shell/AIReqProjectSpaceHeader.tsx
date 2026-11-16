import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { AIREQ_CONTENT_WIDTH_CLASSNAME } from "./pageLayout.js";

export function AIReqProjectSpaceHeader({ onReturnProjects }: { onReturnProjects(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases = ai.view?.releases.filter((item) => item.projectId === project?.id) ?? [];
  const formalGroup = ai.view?.groups.find(
    (item) => item.projectId === project?.id && item.id === ai.selection.irId,
  );
  // 详情仍属于需求；仅从唯一导航和目标归属派生选中，不另存一份页签。
  const proposalView =
    ai.mainView === "proposals" ||
    (ai.mainView === "chat" && !ai.selection.formalView && !formalGroup);
  const requirementView =
    ai.mainView === "proposals" || ai.mainView === "formal" || ai.mainView === "chat"
      ? proposalView
        ? "proposals"
        : "formal"
      : ai.requirementView;
  const section =
    ai.mainView === "projectOverview"
      ? "overview"
      : ai.mainView === "requirementAnalysis"
        ? "analysis"
        : "requirements";
  const release = releases.find((item) => item.id === ai.releaseId);

  // 修复：提案讨论属于需求详情，不能继续用项目级页签冒充当前页面导航。
  if (ai.mainView === "chat" && proposalView) {
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
              {zh ? "返回提案列表" : "Back to proposals"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-60 text-foreground-subtle"
              onClick={() => ai.navigate(() => ai.setMainView("projectOverview"))}
            >
              <span className="truncate">{project?.name ?? (zh ? "项目" : "Project")}</span>
            </Button>
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtlest"
              aria-hidden="true"
            />
            <span className="text-foreground-subtle">{zh ? "需求提案" : "Proposals"}</span>
            <ChevronRight
              className="size-3.5 shrink-0 text-foreground-subtlest"
              aria-hidden="true"
            />
            <span aria-current="page" className="font-medium">
              {zh ? "需求讨论" : "Requirement discussion"}
            </span>
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

  return (
    <header className="shrink-0 border-b border-border/50" data-testid="aireq-project-space-header">
      <div className={`mx-auto min-w-0 space-y-3 px-2 pt-3 pb-2 ${AIREQ_CONTENT_WIDTH_CLASSNAME}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1 text-foreground-subtle"
            onClick={() => ai.navigate(() => ai.setMainView("projectProgress"))}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {zh ? "全部项目" : "All projects"}
          </Button>
          <Select
            value={project?.id ?? ""}
            onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
            disabled={!ai.view?.projects.length}
          >
            <SelectTrigger
              className="w-60 max-w-full bg-surface"
              aria-label={zh ? "当前项目" : "Current project"}
            >
              <SelectValue placeholder={zh ? "选择项目" : "Choose project"} />
            </SelectTrigger>
            <SelectContent>
              {ai.view?.projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={release?.id ?? "all"}
            onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id === "all" ? "" : id))}
            disabled={!project || !releases.length}
          >
            <SelectTrigger
              className="w-52 max-w-full bg-surface"
              aria-label={zh ? "当前 Release" : "Current Release"}
            >
              <SelectValue placeholder={zh ? "选择 Release" : "Choose Release"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{zh ? "全部 Release" : "All Releases"}</SelectItem>
              {releases.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(!project || !releases.length) && (
          <div className="flex flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle">
            <span>
              {!project
                ? zh
                  ? "请选择项目，或返回项目列表添加项目。"
                  : "Choose a project or return to the project list to add one."
                : zh
                  ? "当前项目尚无 Release。"
                  : "This project has no Releases."}
            </span>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onReturnProjects}>
              {zh ? "返回项目列表" : "Back to projects"}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tabs
            value={section}
            onValueChange={(value) =>
              ai.navigate(() =>
                ai.setMainView(
                  value === "overview"
                    ? "projectOverview"
                    : value === "requirements"
                      ? requirementView
                      : "requirementAnalysis",
                ),
              )
            }
          >
            <TabsList variant="line" aria-label={zh ? "项目空间页面" : "Project space pages"}>
              <TabsTrigger value="overview" className="px-3">
                {zh ? "概览" : "Overview"}
              </TabsTrigger>
              <TabsTrigger value="requirements" className="px-3">
                {zh ? "需求" : "Requirements"}
              </TabsTrigger>
              <TabsTrigger value="analysis" className="px-3">
                {zh ? "分析运行" : "Analysis runs"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </header>
  );
}
