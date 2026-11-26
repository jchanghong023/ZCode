import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { ChevronsDown, Files, Maximize2, Minimize2, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Tabs, TabsList } from "@/components/ui/tabs.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import {
  SortableSidePaneTabPresentation,
  SidePaneTabPresentationDragOverlay,
} from "@/app-shell/SidePaneTabTrigger.js";
import {
  buildSearchFields,
  filterAndRankSearchItems,
  normalizeSearchQuery,
} from "@/app-shell/sidePaneTabSearch.js";
import { useAIReq } from "../AIReqContext.js";
import { releaseIRTitle } from "../projects/releaseOverviewData.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { AIReqSidePaneController, AIReqSidePaneTab } from "./contract.js";

/** 仅持有拖拽与搜索展示状态；Tab 接纳、顺序和关闭均由 pane owner 处理。 */
export function AIReqSidePaneTabs({
  pane,
  onCollapse,
}: {
  pane: AIReqSidePaneController;
  onCollapse(): void;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [draggingId, setDraggingId] = useState<string>();
  const viewport = useRef<HTMLDivElement | null>(null);
  const overview = useRef<HTMLButtonElement>(null);
  const focusAfterClose = useRef(false);
  const ai = useAIReq()!;
  function visibleTitle(tab: AIReqSidePaneTab) {
    // 当前讨论页头已展示版本；跨需求标签仍需要完整标题来区分对象。
    if (
      ai.mainView !== "chat" ||
      tab.selection.projectId !== ai.selection.projectId ||
      tab.selection.irId !== ai.selection.irId
    )
      return tab.title;
    const release = ai.view?.releases.find(
      (r) => r.projectId === tab.selection.projectId && r.id === tab.releaseId,
    );
    return releaseIRTitle(tab.title, release?.title ?? "") || tab.title;
  }
  const activeId = pane.activeTab?.id ?? "";
  const tabCount = pane.tabs.length;
  const documentLabel = zh ? "需求文档" : "Requirement documents";
  const moveTab = (id: string, direction: -1 | 1) => {
    const index = pane.tabs.findIndex((tab) => tab.id === id);
    const neighbor = pane.tabs[index + direction];
    if (neighbor) pane.reorder(id, neighbor.id);
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const draggingTab = pane.tabs.find((tab) => tab.id === draggingId);
  useLayoutEffect(() => {
    if (!focusAfterClose.current) return;
    focusAfterClose.current = false;
    (
      viewport.current?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']") ??
      overview.current
    )?.focus();
  }, [activeId, tabCount]);
  useEffect(() => {
    const element = viewport.current;
    const revealActive = () => {
      const selected = [
        ...(element?.querySelectorAll<HTMLElement>("[data-side-pane-tab-id]") ?? []),
      ].find((item) => item.dataset.sidePaneTabId === activeId);
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    revealActive();
    // 调整窗口或面板宽度不改变 activeId，仍须把当前标签保持在横向可视区。
    const observer = new ResizeObserver(revealActive);
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [activeId, tabCount]);

  return (
    <Tabs
      value={activeId}
      activationMode="manual"
      onValueChange={pane.activate}
      className="min-w-0 shrink-0 gap-0"
      data-testid="aireq-side-pane-tabs"
    >
      <div className="flex min-h-[var(--aireq-pane-toolbar-height,0px)] min-w-0 items-center border-b border-border/50 px-2">
        {(tabCount > 1 || pane.recentClosed.length > 0) && (
          <AIReqTabOverview pane={pane} triggerRef={overview} />
        )}
        <TabsList
          className="flex !h-12 min-w-0 flex-1 justify-start overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none"
          aria-label={zh ? "文档标签" : "Document tabs"}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setDraggingId(String(active.id))}
            onDragCancel={() => setDraggingId(undefined)}
            onDragEnd={({ active, over }) => {
              setDraggingId(undefined);
              if (over && active.id !== over.id) pane.reorder(String(active.id), String(over.id));
            }}
          >
            <div
              ref={viewport}
              data-side-pane-tabs-viewport=""
              className="!scrollbar-hide h-12 min-w-0 flex-1 overflow-x-auto"
            >
              {/* 共享 Tab 可缩至 60px；业务对象需要保留阅读宽度，溢出交由标签条横滚。 */}
              <div
                data-side-pane-tabs-content=""
                className="flex w-full gap-1 py-2.5 [&_[data-side-pane-tab-id]]:min-w-52 [&_[data-side-pane-tab-id]]:shrink-0 [&_[data-side-pane-tab-id]]:max-w-64"
              >
                <SortableContext
                  items={pane.tabs.map((tab) => tab.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {pane.tabs.map((tab, tabIndex) => {
                    const kindLabel =
                      tab.kind === "original" ? (zh ? "云龙原文" : "Original IR") : documentLabel;
                    const accessibleTitle = `${tab.title} · ${kindLabel}`;
                    return (
                      <SortableSidePaneTabPresentation
                        key={tab.id}
                        id={tab.id}
                        triggerId={`aireq-tab-${tab.id}`}
                        panelId={`aireq-content-${tab.id}`}
                        titlePrefix={
                          tab.kind === "original" ? (zh ? "原文" : "IR") : zh ? "文档" : "Docs"
                        }
                        title={visibleTitle(tab)}
                        accessibleTitle={accessibleTitle}
                        icon={<Files className="size-3.5" aria-hidden="true" />}
                        isActive={activeId === tab.id}
                        closeTabLabel={zh ? `关闭 ${accessibleTitle}` : `Close ${accessibleTitle}`}
                        closeTabMenuLabel={zh ? "关闭标签" : "Close tab"}
                        closeOtherTabsLabel={zh ? "关闭其他标签" : "Close other tabs"}
                        closeAllTabsLabel={zh ? "关闭全部标签" : "Close all tabs"}
                        moveTabLeftLabel={zh ? "左移标签" : "Move tab left"}
                        moveTabRightLabel={zh ? "右移标签" : "Move tab right"}
                        onActivateTab={pane.activate}
                        onCloseTab={(id) => {
                          focusAfterClose.current = true;
                          pane.close(id);
                        }}
                        onCloseOtherTabs={(id) => pane.close(id, { others: true })}
                        onCloseAllTabs={() => {
                          focusAfterClose.current = true;
                          pane.closeAll();
                        }}
                        canCloseOtherTabs={pane.tabs.length > 1}
                        canMoveLeft={tabIndex > 0}
                        canMoveRight={tabIndex < pane.tabs.length - 1}
                        onMoveTab={moveTab}
                      />
                    );
                  })}
                </SortableContext>
              </div>
            </div>
            <DragOverlay dropAnimation={null}>
              {draggingTab && (
                <SidePaneTabPresentationDragOverlay
                  title={visibleTitle(draggingTab)}
                  icon={<Files className="size-3.5" aria-hidden="true" />}
                />
              )}
            </DragOverlay>
          </DndContext>
        </TabsList>
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {pane.fullView ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={pane.toggleFullView}
              data-testid="aireq-exit-full-view"
            >
              <Minimize2 className="size-4" aria-hidden="true" />
              {zh ? "退出完整视图" : "Exit full view"}
              <kbd className="text-ui-sm text-foreground-subtle">Esc</kbd>
            </Button>
          ) : (
            <ControlHintTooltip title={zh ? "完整视图" : "Full view"} side="bottom">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={zh ? "完整视图" : "Full view"}
                onClick={pane.toggleFullView}
                data-testid="aireq-enter-full-view"
              >
                <Maximize2 className="size-4" aria-hidden="true" />
              </Button>
            </ControlHintTooltip>
          )}
          <ControlHintTooltip title={zh ? "收起文档" : "Collapse documents"} side="bottom">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={zh ? "收起文档" : "Collapse documents"}
              aria-expanded={true}
              aria-controls="aireq-document-workspace"
              onClick={onCollapse}
            >
              <PanelRightClose className="size-4" aria-hidden="true" />
            </Button>
          </ControlHintTooltip>
        </div>
      </div>
    </Tabs>
  );
}

function AIReqTabOverview({
  pane,
  triggerRef,
}: {
  pane: AIReqSidePaneController;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const items = (tabs: AIReqSidePaneTab[]) =>
    filterAndRankSearchItems(
      tabs.map((tab) => ({
        tab,
        searchFields: buildSearchFields(
          tab.title,
          `${tab.selection.irId ?? ""} ${tab.selection.srId ?? ""}`,
          tab.kind === "original" ? (zh ? "云龙原文" : "Original IR") : zh ? "文档" : "Documents",
        ),
      })),
      normalizeSearchQuery(query),
    );
  const current = items(pane.tabs);
  const closed = items(pane.recentClosed);
  const title = zh ? "标签总览" : "Tab overview";
  const choose = (tab: AIReqSidePaneTab, restoring: boolean) => {
    if (restoring) pane.restore(tab.id);
    else pane.activate(tab.id);
    setOpen(false);
    if (restoring && pane.tabs.length === 0 && pane.recentClosed.length === 1) {
      requestAnimationFrame(() => document.getElementById(`aireq-tab-${tab.id}`)?.focus());
    }
  };
  const group = (label: string, rows: ReturnType<typeof items>, restoring: boolean) =>
    rows.length > 0 && (
      <CommandGroup heading={label} className="border-b border-border p-1 last:border-b-0">
        {rows.map(({ tab }) => {
          return (
            <CommandItem
              key={tab.id}
              value={`${restoring ? "closed" : "open"}:${tab.id}`}
              className={`min-h-8 gap-2 px-2 text-ui-base ${!restoring && pane.activeTab?.id === tab.id ? "bg-selected data-selected:bg-selected" : ""}`}
              onSelect={() => choose(tab, restoring)}
            >
              <Files className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere]">
                {tab.kind === "original" ? (zh ? "原文" : "IR") : zh ? "文档" : "Docs"} ·{" "}
                {tab.title}
              </span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon-lg"
          className="mr-1 shrink-0"
          aria-label={title}
        >
          <ChevronsDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] gap-0 bg-menu p-0">
        <Command shouldFilter={false} className="bg-transparent p-0 text-foreground">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={zh ? "搜索标签…" : "Search tabs…"}
            className="h-8"
          />
          <CommandList className="max-h-80">
            {current.length + closed.length === 0 && (
              <CommandEmpty className="px-4 py-5 text-foreground-subtle">
                {zh ? "没有匹配的标签" : "No matching tabs"}
              </CommandEmpty>
            )}
            {group(zh ? "已打开" : "Open tabs", current, false)}
            {group(zh ? "最近关闭" : "Recently closed", closed, true)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
