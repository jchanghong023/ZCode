import { useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { FileText, ChartNoAxesCombined, History } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME,
} from "@/components/ui/resizable.js";
import { useAnimatedResizablePanel } from "@/app-shell/useAnimatedResizablePanel.js";
import { WorkspaceSidePaneToggleButton } from "@/WorkspaceSidePaneToggleButton.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import type { AIReqSelection } from "../contract.js";
import { AIReqMaterialsPane } from "../proposals/AIReqWorkbench.js";
import { AIReqFormalReport } from "../tracking/formal/FormalReport.js";
import { AIReqFormalHistory } from "../tracking/formal/FormalHistory.js";
import { AIReqRequirementContext } from "../shell/AIReqRequirementNavigation.js";
import { AIReqDetailScope } from "./AIReqDetailScope.js";
import { AIReqSidePaneTabs } from "./AIReqSidePaneTabs.js";
import { AIReqAnalysisReportTab } from "./AIReqAnalysisReportTab.js";
import {
  AIReqSidePaneMemoryContext,
  sidePaneTargetKey,
  useAIReqSidePane,
} from "./AIReqSidePaneContext.js";
import type { AIReqSidePaneGuard, AIReqSidePaneTab } from "./contract.js";

function TabContents({ tab, active }: { tab: AIReqSidePaneTab; active: boolean }) {
  const { open, updateTab, registerGuard } = useAIReqSidePane();
  const select = useCallback(
    (selection: AIReqSelection, releaseId?: string) => {
      const target = { ...tab, selection, releaseId: releaseId ?? tab.releaseId };
      if (sidePaneTargetKey(target) === sidePaneTargetKey(tab))
        updateTab(tab.id, selection, target.releaseId);
      else open(target);
    },
    [open, updateTab, tab],
  );
  const guard = useCallback(
    (value: AIReqSidePaneGuard) => registerGuard(tab.id, value),
    [registerGuard, tab.id],
  );
  if (tab.kind === "launcher") return <Launcher tab={tab} />;
  if (tab.kind === "analysis") return <AIReqAnalysisReportTab tab={tab} active={active} />;
  return (
    <AIReqDetailScope
      target={tab.selection}
      releaseId={tab.releaseId}
      tabId={tab.id}
      active={active}
      onSelect={select}
      onGuardChange={guard}
    >
      {tab.kind !== "materials" && <AIReqRequirementContext showReturn={false} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab.kind === "materials" ? (
          <AIReqMaterialsPane />
        ) : tab.kind === "history" ? (
          <AIReqFormalHistory />
        ) : (
          <AIReqFormalReport />
        )}
      </div>
    </AIReqDetailScope>
  );
}
function Launcher({ tab }: { tab?: AIReqSidePaneTab }) {
  const ai = useAIReq()!;
  const pane = useAIReqSidePane();
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const selection = tab?.selection ?? ai.selection;
  const group = [...(ai.view?.groups ?? []), ...(ai.view?.drafts ?? [])].find(
    (item) => item.projectId === selection.projectId && item.id === selection.irId,
  );
  const formal =
    group &&
    ai.view?.groups.some((item) => item.projectId === group.projectId && item.id === group.id);
  const releaseId = tab?.releaseId ?? ai.releaseId;
  const rows = [
    {
      kind: "materials" as const,
      title: zh ? "需求材料" : "Materials",
      description: zh ? "阅读需求与方案文档" : "Read requirement and solution documents",
      icon: FileText,
      enabled: Boolean(group),
    },
    {
      kind: "report" as const,
      title: zh ? "进度报告" : "Progress report",
      description: zh ? "查看需求或开发任务进展" : "Inspect delivery progress",
      icon: ChartNoAxesCombined,
      enabled: Boolean(formal),
    },
    {
      kind: "history" as const,
      title: zh ? "讨论／评审历史" : "Discussion & review history",
      description: zh ? "回看已归档的讨论与评审" : "Read archived discussion and reviews",
      icon: History,
      enabled: Boolean(formal),
    },
  ];
  return (
    <div
      className="@container/launcher h-full min-h-0 overflow-y-auto px-7 py-6"
      data-testid="aireq-side-pane-launcher"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h2 className="pl-2 text-ui-xl font-semibold">{zh ? "新标签页" : "New tab"}</h2>
        {group ? (
          <p className="px-2 text-ui-sm text-remote-foreground-muted">{group.title}</p>
        ) : (
          <p className="px-2 text-ui-sm text-remote-foreground-muted">
            {zh
              ? "从主区选择需求，报告、材料与历史会在这里打开。"
              : "Select a requirement in the main workspace to open reports, materials and history here."}
          </p>
        )}
        <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-1 @min-[36rem]/launcher:grid-cols-2">
          {rows
            .filter((row) => row.enabled)
            .map(({ kind, title, description, icon: Icon }) => (
              <Button
                key={kind}
                variant="ghost"
                className="h-auto min-w-0 justify-start gap-3 whitespace-normal px-2 py-3 text-left focus-visible:border-remote-foreground-muted"
                onClick={() =>
                  pane.open({
                    kind,
                    selection: { ...selection, formalView: formal ? "detail" : undefined },
                    releaseId,
                    title: group ? group.title + " · " + title : title,
                  })
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{title}</span>
                  <span className="block text-ui-sm font-normal text-remote-foreground-muted">
                    {description}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-ui-sm">
                  {zh ? "打开" : "Open"}
                </span>
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}
export function AIReqSidePaneHost({ children }: { children: ReactNode }) {
  const pane = useAIReqSidePane();
  const ai = useAIReq()!;
  const scopes = useContext(AIReqSidePaneMemoryContext);
  const available =
    ai.mainView !== "projectProgress" &&
    ai.mainView !== "ideas" &&
    ai.mainView !== "projectOverview" &&
    ai.mainView !== "proposals" &&
    (ai.mainView !== "chat" ||
      ai.requirementView !== "proposals" ||
      ai.proposalTask !== "overview") &&
    // 分析页的通用展开只会打开空启动页；有实际内容后才提供工作区入口。
    (ai.mainView !== "requirementAnalysis" || pane.tabs.some((tab) => tab.kind !== "launcher"));
  const isOpen = available && pane.isOpen;
  const fullView = isOpen && pane.fullView;
  const asideRef = useRef<HTMLElement>(null);
  const wasFullView = useRef(false);
  const { toggleFullView } = pane;
  useLayoutEffect(() => {
    if (ai.settingsOpen) return;
    // 进入完整视图会替换原图标按钮；退出也需要把焦点交还同一操作。
    if (fullView)
      asideRef.current
        ?.querySelector<HTMLButtonElement>("[data-testid='aireq-exit-full-view']")
        ?.focus();
    else if (wasFullView.current && isOpen)
      asideRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed='false']")?.focus();
    wasFullView.current = fullView;
  }, [fullView, isOpen, ai.settingsOpen]);
  useEffect(() => {
    if (!fullView || ai.settingsOpen) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Esc 优先交给上层交互浮层；不能关闭菜单的同时退出完整视图。
      const overlay = [
        ...document.querySelectorAll<HTMLElement>(
          "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-slot='popover-content']",
        ),
      ].some((element) => element.getClientRects().length && !element.closest("[hidden], [inert]"));
      if (overlay) return;
      event.preventDefault();
      toggleFullView();
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [fullView, ai.settingsOpen, toggleFullView]);
  // 同步约束在子面板 effect 中更新；过早 collapse 会读取旧的不可折叠约束并被忽略。
  // 复用原生同步 hook，收起必须归还实际宽度，进入概览、全局页面或提案列表仅隐藏而不清空 Tab。
  const { panelRef: panel } = useAnimatedResizablePanel({
    open: isOpen,
    expandedSize: "45%",
    rememberExpandedSize: true,
  });
  const currentScope = JSON.stringify([ai.selection.projectId ?? "", ai.releaseId]);
  const { locale } = useZCodeIntl();
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      layoutId="aireq-unified-side-pane-v1"
      panelIds={["aireq-primary", "aireq-side-pane"]}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      data-testid="aireq-side-pane-workspace"
    >
      <ResizablePanel id="aireq-primary" minSize="360px" defaultSize="55%">
        <div
          className="relative flex h-full min-h-0 min-w-0 flex-col"
          inert={fullView}
          aria-hidden={fullView || undefined}
        >
          {available &&
            !isOpen &&
            !(ai.mainView === "chat" && ai.requirementView === "proposals") && (
              <div className="absolute top-2 right-2 z-20">
                <WorkspaceSidePaneToggleButton
                  isSidePaneOpen={false}
                  onToggleSidePane={pane.toggle}
                />
              </div>
            )}
          {children}
        </div>
      </ResizablePanel>
      <ResizableHandle
        className={
          isOpen && !fullView
            ? WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME + " aria-[orientation=vertical]:w-[3px]"
            : "hidden"
        }
      />
      <ResizablePanel
        id="aireq-side-pane"
        panelRef={panel}
        defaultSize="45%"
        minSize="400px"
        maxSize="80%"
        // 与原生宿主一致：只有显式收起时允许折叠，拖动不能绕过门禁。
        collapsible={!isOpen}
        disabled={!isOpen || fullView}
        collapsedSize="0px"
        style={fullView ? { overflow: "visible" } : undefined}
      >
        <aside
          ref={asideRef}
          aria-label={locale === "zh-CN" ? "右侧工作区" : "Side workspace"}
          aria-hidden={!isOpen || ai.settingsOpen}
          inert={!isOpen || ai.settingsOpen}
          className={
            fullView
              ? "absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background"
              : "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background"
          }
          data-testid="aireq-side-pane"
          data-open={isOpen ? "true" : "false"}
        >
          <AIReqSidePaneTabs pane={pane} />
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            {Object.entries(scopes).flatMap(([key, scope]) =>
              scope.tabs.map((tab) => {
                const active =
                  key === currentScope &&
                  pane.activeTab?.id === tab.id &&
                  isOpen &&
                  !ai.settingsOpen;
                return (
                  <div
                    key={tab.id}
                    id={`aireq-content-${tab.id}`}
                    role="tabpanel"
                    aria-labelledby={`aireq-tab-${tab.id}`}
                    hidden={!active}
                    inert={!active}
                    aria-hidden={!active}
                    className={active ? "flex h-full min-h-0 min-w-0 flex-col" : "hidden"}
                    data-side-pane-tab-content={tab.id}
                  >
                    <TabContents tab={tab} active={active} />
                  </div>
                );
              }),
            )}
            {!pane.tabs.length && <Launcher />}
          </div>
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
