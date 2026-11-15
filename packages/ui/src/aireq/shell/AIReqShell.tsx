import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
  ListTodo,
  FileSearch,
  TableProperties,
  ChartNoAxesCombined,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME,
} from "@/components/ui/resizable.js";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { V4PaneConversationProvider } from "@/v4/V4ConversationContext.js";
import {
  readLastSettingsSectionPreference,
  writeLastSettingsSectionPreference,
  type SettingsSectionId,
} from "@/lib/settingsNavigation.js";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqDataSource } from "../data-source.js";
import type { AIReqMainView } from "../contract.js";
import { conversationReadOnlyReason, proposalProgressIndex } from "../contract.js";
import { AIReqStageHeader, AIReqMaterialsPane } from "../proposals/AIReqWorkbench.js";
import { AIReqProposalStageBody } from "../proposals/AIReqPhaseHeader.js";
import { AIReqProposalTable } from "../proposals/AIReqProposalTable.js";
import { AIReqTodoPage } from "../AIReqTodoPage.js";
import { AIReqProjectProgressPage } from "../projects/AIReqProjectProgressPage.js";
import { AIReqSessionPane } from "../conversation/AIReqSessionPane.js";
import { AIReqFormalWorkspace, AIReqRequirementAnalysisPage } from "../tracking/index.js";
import { AIReqSettingsPage, type AIReqSettingsSection } from "../settings/AIReqSettingsPage.js";
import { AIReqWorkspaceFooter } from "./AIReqWorkspaceFooter.js";
import {
  WorkspaceSidebarToolbar,
  type WorkspaceSidebarToolbarProps,
} from "./WorkspaceSidebarToolbar.js";
import { AIReqRequirementMenu } from "../proposals/AIReqRequirementMenu.js";
import { AIReqWorkflowHelp } from "./AIReqWorkflowHelp.js";
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
  skillDesign: "skill",
} satisfies Record<Section, SettingsSectionId>;

function readSettingsSection(): Section {
  const saved = readLastSettingsSectionPreference("general");
  switch (saved) {
    case "appearance":
      return "appearance";
    case "modelProvider":
      return "models";
    case "personalization":
      return "personalization";
    case "skill":
      return "skillDesign";
    default:
      return "projects";
  }
}
const pages = [
  { view: "projectProgress", label: "项目进度", labelEn: "Project progress", icon: ChartNoAxesCombined },
  { view: "todos", label: "待办列表", labelEn: "Todos", icon: ListTodo },
  { view: "formal", label: "正式需求", labelEn: "Formal requirements", icon: TableProperties },
  { view: "proposals", label: "需求提案", labelEn: "Proposals", icon: TableProperties },
  { view: "requirementAnalysis", label: "进度分析", labelEn: "Progress analysis", icon: FileSearch },
] satisfies { view: AIReqMainView; label: string; labelEn: string; icon: typeof FileSearch }[];
export function AIReqShell({ onLogout }: { onLogout(): void }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const { setNavigationGuard } = ai;
  const source = useAIReqDataSource();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section>(readSettingsSection);
  const settings = settingsOpen ? settingsSection : null;
  const [navigationWidth, setNavigationWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("zcode:workspace-shell:sidebar-width-px"));
      return Number.isFinite(saved) && saved >= 264 ? Math.round(saved) : 264;
    } catch {
      return 264;
    }
  });
  const shellRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const clampWidth = () => {
      const maximum = Math.max(264, shell.clientWidth / 2);
      setNavigationWidth((width) => Math.min(width, maximum));
    };
    clampWidth();
    const observer = new ResizeObserver(clampWidth);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  const navigationResize = useRef<{ startX: number; width: number } | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const materialsPanel = useRef<PanelImperativeHandle>(null);
  const lastMaterialsSize = useRef<number | null>(null);
  const appliedMaterialsOpen = useRef(true);
  useLayoutEffect(() => {
    if (appliedMaterialsOpen.current === materialsOpen) return;
    appliedMaterialsOpen.current = materialsOpen;
    // 修复：先提交最小宽度约束再收起，否则原生 resize 会被 240px 下限夹回。
    materialsPanel.current?.resize(materialsOpen ? `${lastMaterialsSize.current ?? 45}%` : "0px");
  }, [materialsOpen]);
  const [help, setHelp] = useState(false);
  const helpReturnFocus = useRef<HTMLButtonElement | null>(null);
  const guardChange = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      setNavigationGuard(guard);
    },
    [setNavigationGuard],
  );
  const project = ai.view?.projects.find((item) => item.id === ai.selection.projectId);
  const workspace = source.resolveWorkspace(ai.view, ai.selection);
  const scope = { workspacePath: workspace.path ?? "", workspaceIdentity: workspace.identity };
  const navigate = (action: () => void) =>
    ai.navigate(() => {
      setSettingsOpen(false);
      action();
    });
  const commitSettingsSection = useCallback((section: Section) => {
    // 仅在离开门禁接纳后写入原生偏好，避免刷新丢失分区或取消导航改写记忆。
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
  const closeSettings = () => {
    // 设置覆盖层关闭后仍保持设计会话与原生 composer 挂载。
    setSettingsOpen(false);
  };
  const openHelp = (returnFocusTo?: HTMLButtonElement | null) =>
    ai.navigate(() => {
      helpReturnFocus.current = returnFocusTo ?? null;
      setHelp(true);
    });
  const logout = () => ai.navigate(onLogout);
  const toolbar: WorkspaceSidebarToolbarProps = {
    canGoBack: ai.canGoBack,
    canGoForward: ai.canGoForward,
    onGoBack: () => navigate(ai.goBack),
    onGoForward: () => navigate(ai.goForward),
  };
  const proposal = ai.view?.drafts.find(
    (item) => item.projectId === ai.selection.projectId && item.id === ai.selection.irId,
  );
  // 空会话也可能是失效对象或读取故障，只有有效交付的入库选择才显示正常状态。
  const viewingIntake =
    ai.selectionReady &&
    !ai.error &&
    proposal &&
    (proposalProgressIndex(proposal, ai.selection) === 3) &&
    (ai.selection.proposalStep === "intake" ||
      (!ai.selection.proposalStep && !ai.selection.discussionPhase));
  const resizeNavigation = (width: number, remember = false) => {
    const maximum = Math.max(264, (shellRef.current?.clientWidth ?? 528) / 2);
    const nextWidth = Math.round(Math.max(264, Math.min(maximum, width)));
    setNavigationWidth(nextWidth);
    if (remember) {
      try {
        localStorage.setItem("zcode:workspace-shell:sidebar-width-px", String(nextWidth));
      } catch {
        // 修复：浏览器禁止存储时仍允许本次拖动，不把布局偏好失败当作业务错误。
      }
    }
  };
  const toggleMaterials = () => {
    if (materialsOpen)
      lastMaterialsSize.current = materialsPanel.current?.getSize().asPercentage ?? null;
    setMaterialsOpen((open) => !open);
  };
  const formal =
    ai.mainView === "formal" ||
    (ai.mainView === "chat" && Boolean(ai.selection.formalView || ai.view?.groups.some((item) => item.id === ai.selection.irId)));
  let content;
  if (ai.mainView === "projectProgress")
    content = <AIReqProjectProgressPage onManageProjects={() => openSettings("projects")} />;
  else if (ai.mainView === "todos") content = <AIReqTodoPage />;
  else if (!project && ai.view)
    content = (
      <div className="m-auto p-6 text-foreground-subtle">
        尚无项目，请在项目设置中添加名称、远程仓库与默认分支。
        <Button variant="outline" onClick={() => openSettings("projects")}>
          项目设置
        </Button>
      </div>
    );
  else if (ai.mainView === "requirementAnalysis")
    content = <AIReqRequirementAnalysisPage onOpenModelSettings={openModelSettings} />;
  else if (ai.mainView === "proposals") content = <AIReqProposalTable />;
  else if (formal) content = <AIReqFormalWorkspace />;
  else
    content = (
      <ResizablePanelGroup orientation="horizontal" layoutId="aireq-proposal-workspace-v2">
        <ResizablePanel id="discussion" defaultSize={materialsOpen ? "52%" : "100%"} minSize="35%">
          <div
            className={`flex h-full min-h-0 flex-col overflow-hidden bg-background ${materialsOpen ? "rounded-xl border-[0.5px] border-border shadow-xs" : ""}`}
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4">
              <span
                className="min-w-0 flex-1 truncate text-ui-base font-medium"
                title={proposal?.title}
              >
                {proposal?.title ?? "AIReq"}
              </span>
              {proposal && <AIReqRequirementMenu key={proposal.id} group={proposal} />}
              <Button
                variant="ghost"
                size="icon-md"
                aria-label={materialsOpen ? "收起材料" : "展开材料"}
                aria-expanded={materialsOpen}
                onClick={toggleMaterials}
              >
                {materialsOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
            </div>
            {ai.selection.irId && <AIReqStageHeader />}
            {ai.selection.srId &&
              proposal &&
              ai.view?.srs.some(
                (item) =>
                  item.projectId === ai.selection.projectId &&
                  item.irId === proposal.id &&
                  item.id === ai.selection.srId,
              ) ? (
              <div className="space-y-3 p-6 text-ui-base">
                <p>SR 规格为只读材料；讨论与阶段决策在所属 IR 进行。</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    ai.select({ projectId: ai.selection.projectId, irId: ai.selection.irId })
                  }
                >
                  返回 IR 讨论
                </Button>
              </div>
            ) : ai.session ? (
              <V4PaneConversationProvider scope={scope} sessionId={ai.session.sessionId}>
                <AIReqSessionPane
                  paneId="aireq-proposal"
                  sessionId={ai.session.sessionId}
                  {...scope}
                  readOnly={Boolean(
                    conversationReadOnlyReason(ai.view, ai.selection, source.capabilities),
                  )}
                  embedded
                  focused={!settings}
                />
              </V4PaneConversationProvider>
            ) : viewingIntake ? (
              <AIReqProposalStageBody />
            ) : ai.selection.irId || !ai.view ? (
              <div className="m-auto space-y-3 p-6 text-ui-base text-foreground-subtle">
                <p role={ai.error ? "alert" : "status"}>
                  {ai.error
                    ? `读取需求或会话失败：${ai.error}`
                    : !ai.selectionReady
                      ? ai.pending
                        ? "正在加载需求与会话…"
                        : "需求与会话尚未加载，请重新读取。"
                      : !proposal
                        ? "需求提案不存在或已被删除。"
                        : ai.selection.srId
                          ? "所选 SR 不存在或已被删除。"
                          : "当前阶段会话不可用，请重新读取或返回项目。"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={ai.pending} onClick={() => void ai.refresh()}>
                    重新读取
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => ai.select({ projectId: ai.selection.projectId })}
                  >
                    返回项目
                  </Button>
                </div>
              </div>
            ) : (
              <div className="m-auto p-6 text-foreground-subtle">
                请从需求提案表进入讨论。
              </div>
            )}
          </div>
        </ResizablePanel>
        {materialsOpen && (
          <ResizableHandle
            className={`${WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME} aria-[orientation=vertical]:w-[3px]`}
          />
        )}
        <ResizablePanel
          id="materials"
          panelRef={materialsPanel}
          defaultSize={materialsOpen ? "45%" : "0px"}
          minSize={materialsOpen ? "240px" : "0px"}
          maxSize="65%"
          disabled={!materialsOpen}
          className={materialsOpen ? "" : "pointer-events-none invisible"}
        >
          <div
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border-[0.5px] border-border bg-background shadow-xs"
            inert={!materialsOpen}
          >
            <div className="flex h-12 shrink-0 items-center border-b border-border/50 px-4 text-ui-base">
              <span className="flex-1">需求材料</span>
              <Button
                variant="ghost"
                size="icon-md"
                aria-label="收起材料"
                onClick={toggleMaterials}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </div>
            <AIReqMaterialsPane />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  // 原生窗口框架依赖列容器横向拉伸；行容器会把设置页缩为内容宽度，留下整块空白。
  // Zai Dark 的 sidebar 与内容背景同值；导航须沿用原生浏览器窗口底层，内容区另用 background。
  return (
    <div
      ref={shellRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background-win-alt"
    >
      {/* 仅隐藏内容会留下第二条侧栏；整个工作台保持挂载并隔离交互，保护原生草稿与附件。 */}
      <div
        hidden={Boolean(settings)}
        inert={Boolean(settings)}
        aria-hidden={Boolean(settings)}
        className={settings ? "hidden" : "flex min-h-0 min-w-0 flex-1 overflow-hidden"}
      >
        <nav
          id="aireq-navigation"
          aria-label="AIReq 工作台导航"
          data-testid="aireq-workflow-root"
          style={{ width: navigationWidth, minWidth: 264, maxWidth: "50%" }}
          className="flex min-h-0 shrink-0 flex-col overflow-hidden bg-background-win-alt text-ui-base"
        >
          <WorkspaceSidebarToolbar {...toolbar} />
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="flex flex-col gap-1 px-2 py-3">
              {pages.map((page) => (
                <Button
                  key={page.view}
                  variant="ghost"
                  size="lg"
                  className={`w-full justify-start gap-2 ${!settings && ai.mainView === page.view ? "bg-selected" : ""}`}
                  aria-pressed={!settings && ai.mainView === page.view}
                  onClick={() => navigate(() => ai.setMainView(page.view))}
                >
                  <page.icon className="size-4" />
                  {zh ? page.label : page.labelEn}
                </Button>
              ))}
            </div>
          </div>
          <AIReqWorkspaceFooter
            onOpenSettings={() => openSettings()}
            onManageProjects={() => openSettings("projects")}
            onLogout={logout}
            onHelp={openHelp}
          />
        </nav>
        <div
          role="separator"
          tabIndex={0}
          aria-label="调整导航宽度"
          aria-orientation="vertical"
          aria-valuemin={264}
          aria-valuenow={navigationWidth}
          aria-controls="aireq-navigation"
          className="relative z-10 h-full w-1 shrink-0 cursor-ew-resize touch-none hover:bg-border-hover focus-visible:bg-border-hover"
          onPointerDown={(event) => {
            navigationResize.current = { startX: event.clientX, width: navigationWidth };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = navigationResize.current;
            if (drag) resizeNavigation(drag.width + event.clientX - drag.startX);
          }}
          onPointerUp={(event) => {
            const drag = navigationResize.current;
            if (drag) resizeNavigation(drag.width + event.clientX - drag.startX, true);
            navigationResize.current = null;
          }}
          onPointerCancel={() => {
            navigationResize.current = null;
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            resizeNavigation(
              event.key === "Home"
                ? 264
                : event.key === "End"
                  ? (shellRef.current?.clientWidth ?? 528) / 2
                  : navigationWidth + (event.key === "ArrowLeft" ? -16 : 16),
              true,
            );
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          {ai.mainView !== "chat" && (
            <div className="h-12 shrink-0 bg-background" />
          )}
          {ai.error && (
            <div
              role="alert"
              className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-ui-sm text-destructive"
            >
              {ai.error}
              <Button variant="ghost" onClick={() => void ai.refresh()}>
                重试
              </Button>
            </div>
          )}
          <ModelSettingsNavigationContext.Provider value={openModelSettings}>
            <AIReqWorkspaceActiveContext.Provider value={!settings}>
              {/* 设置期间保留原生草稿、附件与面板；隐藏工作区不得接收焦点或快捷键。 */}
              <div
                hidden={Boolean(settings)}
                inert={Boolean(settings)}
                aria-hidden={Boolean(settings)}
                className={settings ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}
              >
                {!ai.view && ai.pending ? (
                  <div role="status" className="m-auto">
                    正在读取项目…
                  </div>
                ) : (
                  content
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
              active={settingsOpen}
              section={settingsSection}
              onSectionChange={commitSettingsSection}
              onClose={closeSettings}
              onManageProjects={() => openSettings("projects")}
              onHelp={openHelp}
              onLogout={logout}
              onNavigationGuardChange={guardChange}
            />
          </ModelSettingsNavigationContext.Provider>
        </div>
      )}
      <AIReqWorkflowHelp open={help} onOpenChange={setHelp} returnFocusRef={helpReturnFocus} />
    </div>
  );
}
