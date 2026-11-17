import {
  Folders,
  Inbox,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  ChartNoAxesCombined,
  FolderGit2,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
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
  global: true,
};

const sections = [
  {
    title: "需求规划",
    titleEn: "Requirements",
    pages: [
      {
        view: "projectProgress",
        label: "项目总览",
        labelEn: "Projects",
        icon: Folders,
        global: true,
      },
      { view: "ideas", label: "想法池", labelEn: "Ideas", icon: Lightbulb, global: true },
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
      onClick={() => ai.navigate(() => ai.setMainView(view))}
    >
      <Icon
        className={`size-4 ${selected === view ? "text-foreground" : "text-remote-foreground-muted"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-left">{zh ? label : labelEn}</span>
      {global && (
        <span className="shrink-0 text-ui-sm font-normal text-remote-foreground-muted">
          {zh ? "全部项目" : "All"}
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
        <div className="mb-4 flex items-center gap-2 border-b border-border px-1 pb-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface text-remote-foreground-muted">
            <FolderGit2 className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-ui-sm text-remote-foreground-muted">
              {zh ? "当前项目" : "Current project"}
            </span>
            <span
              className="truncate text-ui-base font-medium text-foreground"
              title={project?.name}
            >
              {project?.name ?? (zh ? "未选择项目" : "No project selected")}
            </span>
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
