import {
  Folders,
  Inbox,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  ChartNoAxesCombined,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import appLogoUrl from "@/assets/provider-icons/logo-zai.svg";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqMainView } from "../contract.js";

type SidebarPage = {
  view: AIReqMainView;
  label: string;
  labelEn: string;
  icon: typeof Folders;
  global: boolean;
};

const todos: SidebarPage = {
  view: "todos",
  label: "我的待办",
  labelEn: "My todos",
  icon: Inbox,
  global: false,
};

const sections = [
  {
    title: "全局",
    titleEn: "Global",
    pages: [
      {
        view: "projectProgress",
        label: "项目总览",
        labelEn: "Projects",
        icon: Folders,
        global: true,
      },
      { view: "ideas", label: "想法池", labelEn: "Ideas", icon: Lightbulb, global: true },
    ],
  },
  {
    title: "需求规划",
    titleEn: "Requirements",
    pages: [
      {
        view: "projectOverview",
        label: "当前项目",
        labelEn: "Current project",
        icon: LayoutDashboard,
        global: false,
      },
      {
        view: "proposals",
        label: "需求共创",
        labelEn: "Co-creation",
        icon: MessagesSquare,
        global: false,
      },
    ],
  },
  {
    title: "研发交付",
    titleEn: "Development & delivery",
    pages: [
      {
        view: "formal",
        label: "开发任务",
        labelEn: "Development tasks",
        icon: ListChecks,
        global: false,
      },
      {
        view: "requirementAnalysis",
        label: "进度分析",
        labelEn: "Progress analysis",
        icon: ChartNoAxesCombined,
        global: false,
      },
    ],
  },
] satisfies {
  title: string;
  titleEn: string;
  pages: SidebarPage[];
}[];

export function AIReqSidebarNavigation() {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const releases =
    ai.view?.availableReleases.filter((item) => item.projectId === project?.id) ?? [];
  const formal = Boolean(
    ai.selection.formalView ||
    ai.view?.groups.some(
      (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
    ),
  );
  const selected = ai.mainView === "chat" ? (formal ? "formal" : "proposals") : ai.mainView;
  const renderPage = ({ view, label, labelEn, icon: Icon, global }: SidebarPage) => (
    <Button
      key={view}
      variant="ghost"
      size="lg"
      // 全局焦点样式会清除 outline 和阴影；复用按钮已有边框标出键盘焦点，行宽不变。
      className="h-auto min-h-9 w-full justify-start gap-3 py-2 focus-visible:border-remote-foreground-muted aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:hover:bg-selected"
      aria-current={selected === view ? "page" : undefined}
      data-aireq-motion-nav=""
      onClick={() => ai.navigate(() => ai.setMainView(view))}
    >
      <Icon
        className={`size-4 ${selected === view ? "text-foreground" : "text-remote-foreground-muted"}`}
        aria-hidden="true"
      />
      <span data-aireq-motion-label="" className="min-w-0 flex-1 truncate text-left">
        {zh ? label : labelEn}
      </span>
      {(global || view === "todos") && (
        <span className="shrink-0 text-ui-sm font-normal text-remote-foreground-muted">
          {view === "todos" ? (zh ? "当前 Release" : "This release") : zh ? "全部项目" : "All"}
        </span>
      )}
    </Button>
  );
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 px-5">
        <img
          src={appLogoUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-7 shrink-0 select-none object-contain"
        />
        <div className="flex min-w-0 flex-col">
          <span lang="zh-CN" className="text-ui-lg leading-tight font-semibold text-foreground">
            AI 需求协作
          </span>
          <span lang="en" className="text-ui-sm leading-tight text-remote-foreground-muted">
            AI Requirements
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3">
        <div className="mb-4 space-y-3 border-b border-border px-1 pb-4">
          <div className="space-y-1.5">
            <label id="sidebar-project-label" className="text-ui-sm text-remote-foreground-muted">
              {zh ? "项目" : "Project"}
            </label>
            <Select
              value={project?.id ?? ""}
              onValueChange={(id) => ai.navigate(() => ai.switchProject(id))}
              disabled={!ai.view?.projects.length}
            >
              <SelectTrigger
                className="w-full min-w-0"
                aria-labelledby="sidebar-project-label"
                title={project?.name}
              >
                <SelectValue placeholder={zh ? "未选择项目" : "Choose project"} />
              </SelectTrigger>
              <SelectContent>
                {ai.view?.projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label id="sidebar-release-label" className="text-ui-sm text-remote-foreground-muted">
              Release
            </label>
            <Select
              value={releases.some((item) => item.id === ai.releaseId) ? ai.releaseId : ""}
              onValueChange={(id) => ai.navigate(() => ai.setReleaseId(id))}
              disabled={!ai.selectionReady || !releases.length}
            >
              <SelectTrigger
                className="w-full min-w-0"
                aria-labelledby="sidebar-release-label"
                title={releases.find((item) => item.id === ai.releaseId)?.title}
              >
                <SelectValue
                  placeholder={
                    !ai.selectionReady
                      ? zh
                        ? "正在读取…"
                        : "Loading…"
                      : zh
                        ? "暂无 Release"
                        : "No releases"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {releases.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {sections.map((section, index) => (
          <section
            key={section.title}
            className={index ? "mt-4 border-t border-border pt-4" : ""}
            aria-label={zh ? section.title : section.titleEn}
          >
            <div className="mb-1 px-3 text-ui-sm font-medium text-remote-foreground-muted">
              {zh ? section.title : section.titleEn}
            </div>
            <div className="flex flex-col gap-1">{section.pages.map(renderPage)}</div>
          </section>
        ))}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <div className="border-t border-border pt-3">{renderPage(todos)}</div>
      </div>
    </>
  );
}
