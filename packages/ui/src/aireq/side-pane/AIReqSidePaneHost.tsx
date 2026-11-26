import { useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME,
} from "@/components/ui/resizable.js";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useAIReq } from "../AIReqContext.js";
import { AIReqRequirementDetailsContent } from "../proposals/AIReqRequirementDetailsContent.js";
import { AIReqMaterialsPane } from "../documents/AIReqMaterialsPane.js";
import { AIReqDetailScope } from "./AIReqDetailScope.js";
import { AIReqSidePaneTabs } from "./AIReqSidePaneTabs.js";
import { AIReqSidePaneMemoryContext, useAIReqSidePane } from "./AIReqSidePaneContext.js";
import type { AIReqSidePaneTab } from "./contract.js";

function TabContents({ tab, active }: { tab: AIReqSidePaneTab; active: boolean }) {
  const { locale } = useZCodeIntl();
  if (tab.kind === "original" && tab.selection.projectId && tab.selection.irId) {
    return (
      <AIReqRequirementDetailsContent
        originalOnly
        active={active}
        projectId={tab.selection.projectId}
        irId={tab.selection.irId}
        zh={locale === "zh-CN"}
      />
    );
  }
  return (
    <AIReqDetailScope target={tab.selection} releaseId={tab.releaseId} active={active}>
      {(detail) => (
        <AIReqMaterialsPane
          {...detail}
          key={tab.openSequence}
          initialPath={tab.initialPath}
          initialVersion={tab.initialVersion}
          selection={tab.selection}
          releaseId={tab.releaseId}
          active={active}
        />
      )}
    </AIReqDetailScope>
  );
}

export function AIReqSidePaneHost({ children }: { children: ReactNode }) {
  const pane = useAIReqSidePane();
  const ai = useAIReq()!;
  const scopes = useContext(AIReqSidePaneMemoryContext);
  const { collapse } = pane;
  const { mainView } = ai;
  const previousView = useRef(mainView);
  useLayoutEffect(() => {
    // 从会话返回列表时收起会话打开的文档，保留标签和阅读位置。
    if (previousView.current === "chat" && mainView === "proposals") collapse();
    previousView.current = mainView;
  }, [collapse, mainView]);
  const isOpen = (mainView === "chat" || mainView === "proposals") && pane.isOpen;
  const fullView = isOpen && pane.fullView;
  const asideRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const previousOpener = useRef<HTMLElement | null>(null);
  const returnFocus = useRef(false);
  const wasFullView = useRef(false);
  const { toggleFullView } = pane;
  useLayoutEffect(() => {
    if (isOpen || !returnFocus.current) return;
    returnFocus.current = false;
    const main = mainRef.current;
    const previous = previousOpener.current;
    const opener = main?.querySelector<HTMLElement>("[data-aireq-open-agent-documents]");
    (
      opener ?? (previous?.isConnected && !previous.closest("[hidden], [inert]") ? previous : main)
    )?.focus();
  }, [isOpen]);
  useLayoutEffect(() => {
    if (ai.settingsOpen) return;
    // 进入完整视图会替换原图标按钮；退出也需要把焦点交还同一操作。
    if (fullView)
      asideRef.current
        ?.querySelector<HTMLButtonElement>("[data-testid='aireq-exit-full-view']")
        ?.focus();
    else if (wasFullView.current && isOpen)
      asideRef.current
        ?.querySelector<HTMLButtonElement>("[data-testid='aireq-enter-full-view']")
        ?.focus();
    wasFullView.current = fullView;
  }, [fullView, isOpen, ai.settingsOpen]);
  useEffect(() => {
    if (!fullView || ai.settingsOpen) return;
    const exit = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !asideRef.current?.contains(document.activeElement)
      )
        return;
      // Esc 优先交给上层交互浮层；不能关闭菜单的同时退出完整视图。
      const overlay = [
        ...document.querySelectorAll<HTMLElement>(
          "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-slot='popover-content']",
        ),
      ].some(
        (element) =>
          element.getClientRects().length &&
          !element.closest("[hidden], [inert], [data-state='closed']"),
      );
      if (overlay) return;
      event.preventDefault();
      toggleFullView();
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [fullView, ai.settingsOpen, toggleFullView]);
  const panel = useRef<PanelImperativeHandle>(null);
  const layout = mainView === "chat" ? "chat" : "list";
  const widths = useRef({ list: (100 * 5) / 12, chat: 50 });
  const openLayout = useRef<typeof layout>(undefined);
  useEffect(() => {
    // 下一帧才有最新的可折叠约束。先保存实际宽度再应用目标布局，
    // 直接从列表进入会话也能分别记住拖动宽度，不重建会话和文档。
    const frame = requestAnimationFrame(() => {
      const current = panel.current;
      if (!current) return;
      if (openLayout.current) {
        const width = current.getSize().asPercentage;
        if (width > 0) widths.current[openLayout.current] = width;
      }
      if (isOpen) current.resize(`${widths.current[layout]}%`);
      else current.collapse();
      openLayout.current = isOpen ? layout : undefined;
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, layout]);
  const currentScope = ai.selection.projectId ?? "";
  const { locale } = useZCodeIntl();
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      layoutId="aireq-unified-side-pane-v2"
      panelIds={["aireq-primary", "aireq-side-pane"]}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      data-testid="aireq-side-pane-workspace"
    >
      <ResizablePanel id="aireq-primary" minSize="360px" defaultSize="58.3333%">
        <div
          ref={mainRef}
          tabIndex={-1}
          className="relative flex h-full min-h-0 min-w-0 flex-col"
          inert={fullView}
          aria-hidden={fullView || undefined}
        >
          {children}
        </div>
      </ResizablePanel>
      <ResizableHandle
        className={
          isOpen && !fullView
            ? WORKSPACE_VERTICAL_RESIZE_HANDLE_CLASS_NAME + " aria-[orientation=vertical]:w-4"
            : "hidden"
        }
      />
      <ResizablePanel
        id="aireq-side-pane"
        panelRef={panel}
        defaultSize="41.6667%"
        minSize="400px"
        maxSize="80%"
        // 与原生宿主一致：只有显式收起时允许折叠，拖动不能绕过门禁。
        collapsible={!isOpen}
        disabled={!isOpen || fullView}
        collapsedSize="0px"
        style={fullView ? { overflow: "visible" } : undefined}
      >
        <aside
          id="aireq-document-workspace"
          ref={asideRef}
          onFocusCapture={(event) => {
            const previous = event.relatedTarget;
            if (previous instanceof HTMLElement && mainRef.current?.contains(previous)) {
              previousOpener.current = previous;
            }
          }}
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
          {isOpen && !ai.settingsOpen && (
            <AIReqSidePaneTabs
              pane={pane}
              onCollapse={() => {
                returnFocus.current = true;
                collapse();
              }}
            />
          )}
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
            {!pane.tabs.length && (
              <p role="status" className="px-6 py-5 text-ui-base text-foreground-subtle">
                {locale === "zh-CN" ? "没有打开的文档。" : "No open documents."}
              </p>
            )}
          </div>
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
