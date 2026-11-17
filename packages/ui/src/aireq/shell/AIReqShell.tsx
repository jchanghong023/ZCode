import { AIReqSidePaneProvider } from "../side-pane/AIReqSidePaneContext.js";
import { AIReqSidePaneHost } from "../side-pane/AIReqSidePaneHost.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  readLastSettingsSectionPreference,
  writeLastSettingsSectionPreference,
  type SettingsSectionId,
} from "@/lib/settingsNavigation.js";
import { clearAIReqObjectLink, useAIReq } from "../AIReqContext.js";
import type { AIReqSettingsDraftActions } from "../contract.js";
import { AIReqProposalTable } from "../proposals/AIReqProposalTable.js";
import { AIReqTodoPage } from "../AIReqTodoPage.js";
import {
  AIReqProjectProgressPage,
  AIReqProjectOverviewPage,
} from "../projects/AIReqProjectProgressPage.js";
import { AIReqFormalWorkspace, AIReqRequirementAnalysisPage } from "../tracking/index.js";
import { AIReqSettingsPage, type AIReqSettingsSection } from "../settings/AIReqSettingsPage.js";
import type { AIReqProjectSettingsRequest } from "../settings/AIReqProjectSettings.js";
import { AIReqSkillDesignPage } from "../tools/AIReqSkillDesignPage.js";
import { AIREQ_PAGE_CONTENT_CLASSNAME, AIREQ_PAGE_TITLE_CLASSNAME } from "./pageLayout.js";
import { AIReqWorkspaceFooter } from "./AIReqWorkspaceFooter.js";
import { AIReqWorkflowHelp } from "./AIReqWorkflowHelp.js";
import { AIReqSidebarNavigation } from "./AIReqSidebarNavigation.js";
import { AIReqIdeaPool } from "../ideas/AIReqIdeaPool.js";
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

export function AIReqShell(props: { onLogout(): void }) {
  return (
    <AIReqSidePaneProvider>
      <AIReqShellContent {...props} />
    </AIReqSidePaneProvider>
  );
}
function AIReqShellContent({ onLogout }: { onLogout(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const { setNavigationGuard } = ai;
  const settingsOpen = ai.settingsOpen;
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [todosMounted, setTodosMounted] = useState(false);
  const [proposalsMounted, setProposalsMounted] = useState(false);
  const [analysisProjectId, setAnalysisProjectId] = useState<string>();
  const [projectSettingsRequest, setProjectSettingsRequest] =
    useState<AIReqProjectSettingsRequest | null>(null);
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
  useEffect(() => {
    if (ai.mainView === "todos") setTodosMounted(true);
    if (ai.mainView === "proposals") setProposalsMounted(true);
  }, [ai.mainView]);
  const guardChange = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      setNavigationGuard(guard);
    },
    [setNavigationGuard],
  );
  const navigate = (action: () => void) => ai.navigate(action);
  const commitSettingsSection = useCallback((section: Section) => {
    setSettingsSection(section);
    writeLastSettingsSectionPreference(nativeSettingsSections[section]);
  }, []);
  const openSettings = useCallback(
    (section?: Section, projectId?: string) =>
      ai.navigate(() => {
        if (section) commitSettingsSection(section);
        setProjectSettingsRequest(null);
        setAnalysisProjectId(projectId);
        ai.openSettings();
        setSettingsMounted(true);
      }),
    [ai, commitSettingsSection],
  );
  const openModelSettings = useCallback(() => openSettings("models"), [openSettings]);
  const openProjectSettings = (request: AIReqProjectSettingsRequest) =>
    ai.navigate(() => {
      commitSettingsSection("projects");
      setAnalysisProjectId(undefined);
      setProjectSettingsRequest(request);
      ai.openSettings();
      setSettingsMounted(true);
    });
  const projectSettingsRequestHandled = useCallback((request: AIReqProjectSettingsRequest) => {
    setProjectSettingsRequest((current) => (current === request ? null : current));
  }, []);
  const openHelp = (returnFocusTo?: HTMLButtonElement | null) =>
    ai.navigate(() => {
      helpReturnFocus.current = returnFocusTo ?? null;
      setHelp(true);
    });
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const formal =
    ai.mainView === "formal" ||
    (ai.mainView === "chat" &&
      Boolean(
        ai.selection.formalView ||
        ai.view?.groups.some(
          (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
        ),
      ));
  // 切项目后的旧投影不包含目标列表，不能先展示零条和空态。
  const listLoading =
    !ai.selectionReady &&
    (ai.mainView === "proposals" || (ai.mainView === "formal" && !ai.selection.irId));
  const listFeedback = (
    <div role="status" className="m-auto space-y-3 p-6 text-foreground-subtle">
      <p>
        {ai.pending
          ? zh
            ? "正在读取需求…"
            : "Loading requirements…"
          : zh
            ? "需求尚未读取，请重试。"
            : "Requirements are not loaded. Retry to continue."}
      </p>
      {!ai.pending && (
        <Button variant="outline" onClick={() => void ai.refresh()}>
          {zh ? "重试" : "Retry"}
        </Button>
      )}
    </div>
  );
  let content;
  if (ai.mainView === "projectProgress")
    content = (
      <AIReqProjectProgressPage onAddProject={() => openProjectSettings({ kind: "create" })} />
    );
  else if (ai.mainView === "todos") content = null;
  else if (ai.mainView === "ideas") content = <AIReqIdeaPool />;
  else if (ai.mainView === "projectOverview")
    content = (
      <AIReqProjectOverviewPage
        onConfigureProject={() =>
          openProjectSettings({ kind: "project", projectId: ai.selection.projectId! })
        }
        onReturnProjects={() => navigate(() => ai.setMainView("projectProgress"))}
      />
    );
  else if (!project && ai.view && ai.selectionReady)
    content = (
      <div className="m-auto space-y-3 p-6 text-foreground-subtle">
        <p>
          {zh
            ? "尚无项目，请返回项目列表添加项目。"
            : "No project selected. Return to the project list to add one."}
        </p>
        <Button variant="outline" onClick={() => navigate(() => ai.setMainView("projectProgress"))}>
          {zh ? "返回项目列表" : "Back to projects"}
        </Button>
      </div>
    );
  else if (ai.mainView === "requirementAnalysis")
    content = (
      <AIReqRequirementAnalysisPage
        onOpenModelSettings={openModelSettings}
        onOpenAnalysisSettings={() => openSettings("analysis", ai.selection.projectId)}
      />
    );
  else if (ai.mainView === "proposals") content = null;
  else if (formal)
    content = (
      <>
        {listLoading && listFeedback}
        <div
          hidden={listLoading}
          inert={listLoading}
          aria-hidden={listLoading}
          className={listLoading ? "hidden" : "flex min-h-0 flex-1 flex-col"}
        >
          <AIReqFormalWorkspace />
        </div>
      </>
    );
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
          className="flex w-64 min-h-0 shrink-0 flex-col overflow-hidden bg-background-win-alt text-ui-base"
        >
          <AIReqSidebarNavigation />
          <AIReqWorkspaceFooter
            compact={false}
            onOpenSettings={() => openSettings()}
            onLogout={() =>
              ai.navigate(() => {
                // 切工号不能沿用上一个身份的显式对象目标。
                clearAIReqObjectLink();
                onLogout();
              })
            }
            onHelp={openHelp}
          />
        </nav>
        <AIReqSidePaneHost>
          <div className="@container/conversation flex min-h-0 min-w-0 flex-1 flex-col border border-transparent bg-background">
            {/* 讨论页已移除页头，原48px占位也应归还聊天与材料面板；业务列表仍保留标题基线。 */}
            {(ai.mainView !== "chat" || formal) && (
              <div className="h-12 shrink-0" aria-hidden="true" />
            )}
            {ai.linkError && (
              <div
                role="alert"
                className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
              >
                {ai.linkError}
                <Button variant="ghost" onClick={ai.clearLinkError}>
                  {zh ? "关闭" : "Dismiss"}
                </Button>
              </div>
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
                  {(todosMounted || ai.mainView === "todos") && (
                    <div
                      hidden={ai.mainView !== "todos"}
                      inert={ai.mainView !== "todos" || settingsOpen}
                      aria-hidden={ai.mainView !== "todos"}
                      className={
                        ai.mainView === "todos" ? "flex min-h-0 flex-1 flex-col" : "hidden"
                      }
                    >
                      {/* 保留来源列表挂载，详情返回时筛选与滚动位置不再重置。 */}
                      <AIReqTodoPage key={`${ai.selection.projectId ?? ""}:${ai.releaseId}`} />
                    </div>
                  )}
                  {(proposalsMounted || ai.mainView === "proposals") && (
                    <>
                      {ai.mainView === "proposals" && listLoading && listFeedback}
                      <div
                        hidden={ai.mainView !== "proposals" || !project || listLoading}
                        inert={
                          ai.mainView !== "proposals" || !project || listLoading || settingsOpen
                        }
                        aria-hidden={ai.mainView !== "proposals" || !project || listLoading}
                        className={
                          ai.mainView === "proposals" && project && !listLoading
                            ? "flex min-h-0 flex-1 flex-col"
                            : "hidden"
                        }
                      >
                        <AIReqProposalTable key={ai.selection.projectId ?? "no-project"} />
                      </div>
                    </>
                  )}
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
        </AIReqSidePaneHost>
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
              analysisProjectId={analysisProjectId}
              projectSettingsRequest={projectSettingsRequest}
              onProjectSettingsRequestHandled={projectSettingsRequestHandled}
              onSectionChange={commitSettingsSection}
              onClose={ai.closeSettings}
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
