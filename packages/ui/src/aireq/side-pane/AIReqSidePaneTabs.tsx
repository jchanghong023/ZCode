import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import {
  ChartNoAxesCombined,
  ChevronsDown,
  FileText,
  Files,
  History,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Plus,
  X,
} from "lucide-react";
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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { AIReqSidePaneController, AIReqSidePaneKind, AIReqSidePaneTab } from "./contract.js";

const icons = {
  launcher: FileText,
  report: ChartNoAxesCombined,
  materials: Files,
  history: History,
  analysis: ChartNoAxesCombined,
} satisfies Record<AIReqSidePaneKind, typeof FileText>;

/** 仅持有拖拽与搜索展示状态；Tab 接纳、顺序及关闭门禁均由 pane owner 处理。 */
export function AIReqSidePaneTabs({ pane }: { pane: AIReqSidePaneController }) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [draggingId, setDraggingId] = useState<string>();
  const viewport = useRef<HTMLDivElement | null>(null);
  const activeId = pane.activeTab?.id ?? "";
  const tabCount = pane.tabs.length;
  const accessibleKinds = zh
    ? { report: "进度报告", materials: "需求材料", history: "讨论与评审历史", analysis: "分析报告" }
    : {
        report: "Progress report",
        materials: "Requirement materials",
        history: "Discussion and review history",
        analysis: "Analysis report",
      };
  // 同对象多 Tab 只靠图标区分时用户必须回忆图标含义；可见短前缀让种类先于对象名被读到。
  const kindPrefixes = zh
    ? { report: "进度｜", materials: "材料｜", history: "历史｜", analysis: "分析｜" }
    : {
        report: "Report · ",
        materials: "Materials · ",
        history: "History · ",
        analysis: "Analysis · ",
      };
  const moveTab = (id: string, direction: -1 | 1) => {
    const index = pane.tabs.findIndex((tab) => tab.id === id);
    const neighbor = pane.tabs[index + direction];
    if (neighbor) pane.reorder(id, neighbor.id);
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const draggingTab = pane.tabs.find((tab) => tab.id === draggingId);
  const fullViewLabel = pane.fullView
    ? zh
      ? "退出完整视图"
      : "Exit full view"
    : zh
      ? "完整视图"
      : "Full view";

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

  const tool = (label: string, Icon: typeof Plus, action: () => void, pressed?: boolean) => (
    <ControlHintTooltip title={label} side="bottom">
      <Button
        type="button"
        variant="ghost"
        size="icon-md"
        className="shrink-0 focus-visible:border-remote-foreground-muted"
        aria-label={label}
        aria-pressed={pressed}
        onClick={action}
      >
        <Icon className="size-4" aria-hidden="true" />
      </Button>
    </ControlHintTooltip>
  );

  return (
    <Tabs
      value={activeId}
      activationMode="manual"
      onValueChange={pane.activate}
      className="min-w-0 shrink-0 gap-0"
      data-testid="aireq-side-pane-tabs"
    >
      <TabsList
        className="flex !h-12 w-full justify-start overflow-hidden rounded-none border-0 border-b border-border/50 bg-transparent p-0 shadow-none"
        aria-label={zh ? "右侧工作区标签" : "Side pane tabs"}
      >
        <div className="flex h-full shrink-0 items-center p-2">
          <AIReqTabOverview pane={pane} />
        </div>
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
                  const Icon = icons[tab.kind];
                  const accessibleTitle =
                    tab.kind === "launcher"
                      ? tab.title
                      : `${tab.title} · ${accessibleKinds[tab.kind]} · ${[tab.selection.irId, tab.selection.srId].filter(Boolean).join(" / ")}`;
                  return (
                    <SortableSidePaneTabPresentation
                      key={tab.id}
                      id={tab.id}
                      triggerId={`aireq-tab-${tab.id}`}
                      panelId={`aireq-content-${tab.id}`}
                      title={tab.title}
                      accessibleTitle={accessibleTitle}
                      icon={<Icon className="size-3.5" aria-hidden="true" />}
                      titlePrefix={tab.kind === "launcher" ? undefined : kindPrefixes[tab.kind]}
                      isActive={activeId === tab.id}
                      closeTabLabel={zh ? `关闭 ${accessibleTitle}` : `Close ${accessibleTitle}`}
                      closeTabMenuLabel={zh ? "关闭标签" : "Close tab"}
                      closeOtherTabsLabel={zh ? "关闭其他标签" : "Close other tabs"}
                      closeAllTabsLabel={zh ? "关闭全部标签" : "Close all tabs"}
                      moveTabLeftLabel={zh ? "左移标签" : "Move tab left"}
                      moveTabRightLabel={zh ? "右移标签" : "Move tab right"}
                      onActivateTab={pane.activate}
                      onCloseTab={pane.close}
                      onCloseOtherTabs={(id) => pane.close(id, { others: true })}
                      onCloseAllTabs={pane.closeAll}
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
                title={draggingTab.title}
                titlePrefix={
                  draggingTab.kind === "launcher" ? undefined : kindPrefixes[draggingTab.kind]
                }
                icon={(() => {
                  const Icon = icons[draggingTab.kind];
                  return <Icon className="size-3.5" />;
                })()}
              />
            )}
          </DragOverlay>
        </DndContext>
      </TabsList>
      <div className="flex min-w-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <p
          className="min-w-0 flex-1 break-words text-ui-sm [overflow-wrap:anywhere]"
          data-testid="aireq-side-pane-active-title"
        >
          {pane.activeTab &&
            (pane.activeTab.kind === "launcher"
              ? pane.activeTab.title
              : accessibleKinds[pane.activeTab.kind])}
        </p>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {tool(zh ? "新建标签页" : "New tab", Plus, pane.newTab)}
          {pane.fullView ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={pane.toggleFullView}
              data-testid="aireq-exit-full-view"
            >
              <Minimize2 className="size-4" aria-hidden="true" />
              {zh ? "退出完整视图" : "Exit full view"}
              <kbd className="text-ui-sm text-foreground-subtle">Esc</kbd>
            </Button>
          ) : (
            tool(
              fullViewLabel,
              pane.fullView ? Minimize2 : Maximize2,
              pane.toggleFullView,
              pane.fullView,
            )
          )}
          {tool(zh ? "收起右侧栏" : "Collapse side pane", PanelRightClose, pane.collapse)}
        </div>
      </div>
    </Tabs>
  );
}

function AIReqTabOverview({ pane }: { pane: AIReqSidePaneController }) {
  const { locale } = useZCodeIntl();
  const zh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const kinds: Record<AIReqSidePaneKind, string> = zh
    ? {
        launcher: "新标签页",
        report: "进度报告",
        materials: "材料",
        history: "历史",
        analysis: "分析报告",
      }
    : {
        launcher: "New tab",
        report: "Progress report",
        materials: "Materials",
        history: "History",
        analysis: "Analysis report",
      };
  const items = (tabs: AIReqSidePaneTab[]) =>
    filterAndRankSearchItems(
      tabs.map((tab) => ({
        tab,
        searchFields: buildSearchFields(
          tab.title,
          `${tab.selection.irId ?? ""} ${tab.selection.srId ?? ""} ${tab.runId ?? ""}`,
          kinds[tab.kind],
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
  };
  const group = (label: string, rows: ReturnType<typeof items>, restoring: boolean) =>
    rows.length > 0 && (
      <CommandGroup heading={label} className="border-b border-border p-1 last:border-b-0">
        {rows.map(({ tab }) => {
          const Icon = icons[tab.kind];
          return (
            <CommandItem
              key={tab.id}
              value={`${restoring ? "closed" : "open"}:${tab.id}`}
              className={`min-h-8 gap-2 px-2 text-ui-base ${!restoring && pane.activeTab?.id === tab.id ? "bg-selected data-selected:bg-selected" : ""}`}
              onSelect={() => choose(tab, restoring)}
            >
              <Icon className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere]">
                {tab.title}
              </span>
              <span className="shrink-0 text-ui-xs text-foreground-subtle">{kinds[tab.kind]}</span>
              {!restoring && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 focus-visible:border-remote-foreground-muted"
                  aria-label={zh ? `关闭 ${tab.title}` : `Close ${tab.title}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pane.close(tab.id);
                  }}
                >
                  <X className="size-3" />
                </Button>
              )}
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
          type="button"
          variant="ghost"
          size="icon-md"
          className="shrink-0 focus-visible:border-remote-foreground-muted"
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
