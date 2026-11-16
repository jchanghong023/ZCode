import { useCallback, useEffect, useRef, useState } from "react";
import { Folders, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  readLastSettingsSectionPreference,
  writeLastSettingsSectionPreference,
  type SettingsSectionId,
} from "@/lib/settingsNavigation.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqSettingsDraftActions } from "../contract.js";
import { AIReqProposalTable } from "../proposals/AIReqProposalTable.js";
import { AIReqTodoPage } from "../AIReqTodoPage.js";
import {
  AIReqProjectProgressPage,
  AIReqProjectOverviewPage,
} from "../projects/AIReqProjectProgressPage.js";
import { AIReqFormalWorkspace, AIReqRequirementAnalysisPage } from "../tracking/index.js";
import { AIReqSettingsPage, type AIReqSettingsSection } from "../settings/AIReqSettingsPage.js";
import { AIReqSkillDesignPage } from "../tools/AIReqSkillDesignPage.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";
import { AIReqWorkspaceFooter } from "./AIReqWorkspaceFooter.js";
import { WorkspaceSidebarToolbar } from "./WorkspaceSidebarToolbar.js";
import { AIReqWorkflowHelp } from "./AIReqWorkflowHelp.js";
import { AIReqProjectSpaceHeader } from "./AIReqProjectSpaceHeader.js";
import { AIReqProposalWorkspace } from "./AIReqProposalWorkspace.js";
import {
  AIReqWorkspaceActiveContext,
  ModelSettingsNavigationContext,
} from "./ModelSettingsNavigationContext.js";

type Section = AIReqSettingsSection;
const nativeSettingsSections = {
  appearance: "appearance",
  projects: "general",
  models: "modelProvider",
  personalization: "personalization",
  analysis: "agentBehavior",
} satisfies Record<Section, SettingsSectionId>;

function readSettingsSection(): Section {
  switch (readLastSettingsSectionPreference("general")) {
    case "appearance":
      return "appearance";
    case "modelProvider":
      return "models";
    case "personalization":
      return "personalization";
    case "agentBehavior":
      return "analysis";
    default:
      return "projects";
  }
}

const pages = [
  { view: "projectProgress", label: "项目", labelEn: "Projects", icon: Folders },
  { view: "todos", label: "待办", labelEn: "Todos", icon: ListTodo },
] as const;

export function AIReqShell({ onLogout }: { onLogout(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const { setNavigationGuard } = ai;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [skillMounted, setSkillMounted] = useState(false);
  const [skillActions, setSkillActions] = useState<AIReqSettingsDraftActions | null>(null);
  const [settingsSection, setSettingsSection] = useState<Section>(readSettingsSection);
  const [help, setHelp] = useState(false);
  const helpReturnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (ai.mainView === "skillDesign") {
      setSkillMounted(true);
      setSettingsMounted(true);
    }
  }, [ai.mainView]);
  const guardChange = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      setNavigationGuard(guard);
    },
    [setNavigationGuard],
  );
  const navigate = (action: () => void) =>
    ai.navigate(() => {
      setSettingsOpen(false);
      action();
    });
  const commitSettingsSection = useCallback((section: Section) => {
    setSettingsSection(section);
    writeLastSettingsSectionPreference(nativeSettingsSections[section]);
  }, []);
  const openSettings = useCallback(
    (section?: Section) =>
      ai.navigate(() => {
        if (section) commitSettingsSection(section);
        setSettingsOpen(true);
        setSettingsMounted(true);
      }),
    [ai, commitSettingsSection],
  );
  const openModelSettings = useCallback(() => openSettings("models"), [openSettings]);
  const openHelp = (returnFocusTo?: HTMLButtonElement | null) =>
    ai.navigate(() => {
      helpReturnFocus.current = returnFocusTo ?? null;
      setHelp(true);
    });
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const projectSpace = !["projectProgress", "todos", "skillDesign"].includes(ai.mainView);
  const formal =
    ai.mainView === "formal" ||
    (ai.mainView === "chat" &&
      Boolean(
        ai.selection.formalView ||
        ai.view?.groups.some(
          (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
        ),
      ));
  let content;
  if (ai.mainView === "projectProgress")
    content = <AIReqProjectProgressPage onManageProjects={() => openSettings("projects")} />;
  else if (ai.mainView === "todos") content = <AIReqTodoPage />;
  else if (ai.mainView === "projectOverview")
    content = <AIReqProjectOverviewPage onManageProjects={() => openSettings("projects")} />;
  else if (!project && ai.view)
    content = (
      <div className="m-auto space-y-3 p-6 text-foreground-subtle">
        <p>
          {zh
            ? "尚无项目，请在项目配置中添加项目。"
            : "No project selected. Add a project in settings."}
        </p>
        <Button variant="outline" onClick={() => openSettings("projects")}>
          {zh ? "项目配置" : "Project settings"}
        </Button>
      </div>
    );
  else if (ai.mainView === "requirementAnalysis")
    content = (
      <AIReqRequirementAnalysisPage
        onOpenModelSettings={openModelSettings}
        onOpenAnalysisSettings={() => openSettings("analysis")}
      />
    );
  else if (ai.mainView === "proposals") content = <AIReqProposalTable />;
  else if (formal) content = <AIReqFormalWorkspace />;
  else if (ai.mainView === "chat") content = <AIReqProposalWorkspace active={!settingsOpen} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background-win-alt">
      {/* 设置只隐藏工作台，保留会话、附件与面板；导航仍只有 Context 一个所有者。 */}
      <div
        hidden={settingsOpen}
        inert={settingsOpen}
        aria-hidden={settingsOpen}
        className={settingsOpen ? "hidden" : "flex min-h-0 min-w-0 flex-1 overflow-hidden"}
      >
        <nav
          id="aireq-navigation"
          aria-label={zh ? "AIReq 工作台导航" : "AIReq workspace navigation"}
          data-testid="aireq-workflow-root"
          className="flex w-[68px] min-h-0 shrink-0 flex-col overflow-hidden bg-background-win-alt text-ui-base"
        >
          <WorkspaceSidebarToolbar
            canGoBack={ai.canGoBack}
            canGoForward={ai.canGoForward}
            onGoBack={() => navigate(ai.goBack)}
            onGoForward={() => navigate(ai.goForward)}
          />
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="flex flex-col items-center gap-1 px-2 py-3">
              {pages.map((page) => {
                // 需求详情同属项目空间，不能因内部 chat 视图丢失主导航选中。
                const selected =
                  page.view === "todos" ? ai.mainView === "todos" : ai.mainView !== "todos";
                return (
                  <ControlHintTooltip
                    key={page.view}
                    title={zh ? page.label : page.labelEn}
                    side="right"
                  >
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className={selected ? "bg-selected" : ""}
                      aria-label={zh ? page.label : page.labelEn}
                      aria-pressed={selected}
                      onClick={() => navigate(() => ai.setMainView(page.view))}
                    >
                      <page.icon className="size-4" />
                    </Button>
                  </ControlHintTooltip>
                );
              })}
            </div>
          </div>
          <AIReqWorkspaceFooter
            onOpenSettings={() => openSettings()}
            onLogout={() => ai.navigate(onLogout)}
            onHelp={openHelp}
          />
        </nav>
        <div className="@container/conversation flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          {projectSpace ? (
            <AIReqProjectSpaceHeader onManageProjects={() => openSettings("projects")} />
          ) : (
            <div className="h-12 shrink-0" />
          )}
          {ai.error && (
            <div
              role="alert"
              className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
            >
              {ai.error}
              <Button variant="ghost" onClick={() => void ai.refresh()}>
                {zh ? "重试" : "Retry"}
              </Button>
            </div>
          )}
          <ModelSettingsNavigationContext.Provider value={openModelSettings}>
            <AIReqWorkspaceActiveContext.Provider value={!settingsOpen}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!ai.view && ai.pending ? (
                  <div role="status" className="m-auto">
                    {zh ? "正在读取项目…" : "Loading projects…"}
                  </div>
                ) : ai.mainView !== "skillDesign" ? (
                  content
                ) : null}
                {skillMounted && (
                  <div
                    hidden={ai.mainView !== "skillDesign"}
                    inert={ai.mainView !== "skillDesign" || settingsOpen}
                    aria-hidden={ai.mainView !== "skillDesign"}
                    className={
                      ai.mainView === "skillDesign"
                        ? "flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable_both-edges]"
                        : "hidden"
                    }
                  >
                    <div className={`${AIREQ_PAGE_CONTENT_CLASSNAME} shrink-0 pb-6 lg:pb-6`}>
                      <h1 className={AIREQ_PAGE_TITLE_CLASSNAME}>
                        {zh ? "Skill 设计" : "Skill design"}
                      </h1>
                    </div>
                    <AIReqWorkspaceActiveContext.Provider
                      value={ai.mainView === "skillDesign" && !settingsOpen}
                    >
                      <AIReqSkillDesignPage
                        active={ai.mainView === "skillDesign" && !settingsOpen}
                        onDraftActionsChange={setSkillActions}
                      />
                    </AIReqWorkspaceActiveContext.Provider>
                  </div>
                )}
              </div>
            </AIReqWorkspaceActiveContext.Provider>
          </ModelSettingsNavigationContext.Provider>
        </div>
      </div>
      {settingsMounted && (
        <div
          hidden={!settingsOpen}
          inert={!settingsOpen}
          aria-hidden={!settingsOpen}
          className={settingsOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          <ModelSettingsNavigationContext.Provider value={openModelSettings}>
            <AIReqSettingsPage
              active={settingsOpen || ai.mainView === "skillDesign"}
              section={settingsSection}
              onSectionChange={commitSettingsSection}
              onClose={() => setSettingsOpen(false)}
              onHelp={openHelp}
              onNavigationGuardChange={guardChange}
              skillActions={skillActions}
            />
          </ModelSettingsNavigationContext.Provider>
        </div>
      )}
      <AIReqWorkflowHelp open={help} onOpenChange={setHelp} returnFocusRef={helpReturnFocus} />
    </div>
  );
}
