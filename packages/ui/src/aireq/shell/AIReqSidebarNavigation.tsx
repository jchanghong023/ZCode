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
  pages: {
    view: AIReqMainView;
    label: string;
    labelEn: string;
    icon: typeof Folders;
    global: boolean;
  }[];
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
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <img
          src={appLogoUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-5 shrink-0 select-none object-contain"
        />
        <span className="text-ui-lg font-semibold text-foreground">AIReq</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3">
        <div className="mb-5 min-w-0 border-b border-border px-2 pb-4">
          <div className="mb-2 text-ui-sm text-remote-foreground-muted">
            {zh ? "当前项目" : "Current project"}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-ui-base font-medium text-foreground">
            <FolderGit2 className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
            <span className="truncate" title={project?.name}>
              {project?.name ?? (zh ? "未选择项目" : "No project selected")}
            </span>
          </div>
        </div>
        {sections.map((section, index) => (
          <section
            key={section.title}
            className={index ? "mt-5 border-t border-border pt-5" : ""}
            aria-label={zh ? section.title : section.titleEn}
          >
            <div className="mb-2 px-2 text-ui-sm text-remote-foreground-muted">
              {zh ? section.title : section.titleEn}
            </div>
            <div className="flex flex-col gap-1">
              {section.pages.map((page) => (
                <Button
                  key={page.view}
                  variant="ghost"
                  size="lg"
                  className={`h-auto min-h-9 w-full justify-start gap-2 py-2 ${selected === page.view ? "bg-selected" : ""}`}
                  aria-current={selected === page.view ? "page" : undefined}
                  onClick={() => ai.navigate(() => ai.setMainView(page.view))}
                >
                  <page.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {zh ? page.label : page.labelEn}
                  </span>
                  {page.global && (
                    <span className="shrink-0 text-ui-sm font-normal text-remote-foreground-muted">
                      {zh ? "全部项目" : "All"}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Button
          variant="ghost"
          size="lg"
          className={`w-full justify-start gap-2 ${selected === "todos" ? "bg-selected" : ""}`}
          aria-current={selected === "todos" ? "page" : undefined}
          onClick={() => ai.navigate(() => ai.setMainView("todos"))}
        >
          <Inbox className="size-4" aria-hidden="true" />
          {zh ? "我的待办" : "My todos"}
        </Button>
      </div>
    </>
  );
}
