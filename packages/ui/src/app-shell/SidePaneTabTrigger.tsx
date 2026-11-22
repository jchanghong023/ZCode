/* oxlint-disable eslint(max-lines) -- 侧栏 Tab trigger 集中维护拖拽、上下文菜单与各类图标，不为行数拆散既有交互。 */
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { XIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.js";
import { TabsTrigger } from "@/components/ui/tabs.js";
import { Button } from "@/components/ui/button.js";
import { SidePaneTabTitleTooltip } from "@/app-shell/SidePaneTabTitleTooltip.js";

export interface SidePaneTabPresentationProps {
  id: string;
  triggerId?: string;
  panelId?: string;
  title: string;
  accessibleTitle?: string;
  icon: ReactNode;
  badge?: ReactNode;
  /** 可见短种类前缀；不随对象名截断，完整语义仍在 accessibleTitle。 */
  titlePrefix?: string;
  closeTabLabel: string;
  closeTabMenuLabel: string;
  closeOtherTabsLabel: string;
  closeAllTabsLabel: string;
  moveTabLeftLabel?: string;
  moveTabRightLabel?: string;
  isActive: boolean;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseAllTabs: () => void;
  canCloseOtherTabs: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onMoveTab?: (tabId: string, direction: -1 | 1) => void;
}

/** 原生与业务 Tab 共用拖拽、关闭和上下文菜单，不绑定业务载荷。 */
export function SortableSidePaneTabPresentation({
  id,
  triggerId,
  panelId,
  title,
  accessibleTitle,
  icon,
  badge,
  titlePrefix,
  closeTabLabel,
  closeTabMenuLabel,
  closeOtherTabsLabel,
  closeAllTabsLabel,
  moveTabLeftLabel,
  moveTabRightLabel,
  isActive,
  onActivateTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  canCloseOtherTabs,
  canMoveLeft,
  canMoveRight,
  onMoveTab,
}: SidePaneTabPresentationProps) {
  const wasDraggingRef = useRef(false);
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const normalizedTransform = transform
    ? {
        ...transform,
        // 横向 tabs 是固定高度控件，拖拽时只允许水平位移。
        // dnd-kit 会携带 scale 信息；这里钳回 1，避免 tab 被临时压缩或拉伸。
        scaleX: 1,
        scaleY: 1,
      }
    : null;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(normalizedTransform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  if (isDragging) {
    wasDraggingRef.current = true;
  }

  const tabTrigger = (
    <TabsTrigger value={id} asChild>
      <div
        ref={setNodeRef}
        data-side-pane-tab-id={id}
        data-active={isActive ? "" : undefined}
        data-state={isActive ? "active" : "inactive"}
        style={style}
        {...listeners}
        // 只接指针拖拽监听；role/tabIndex 留给 Radix。不转发 dnd-kit 的拖拽角色与
        // 空格拾起说明：宿主只配置 PointerSensor，空格实际是激活 Tab，键盘排序走右键菜单。
        role="tab"
        {...(triggerId ? { id: triggerId } : {})}
        {...(panelId ? { "aria-controls": panelId } : {})}
        aria-selected={isActive}
        aria-label={accessibleTitle ?? title}
        onMouseDown={(event) => {
          // 只由显式激活回调接纳点击；避免 Radix 在 mousedown 提前触发第二次门禁。
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onActivateTab(id);
        }}
        onPointerDown={(event) => {
          listeners?.onPointerDown?.(event);
          // side pane tab 里有独立关闭按钮，外层不能再渲染成 button。
          // 否则会形成 button 嵌套 button，生产包里浏览器会修正 DOM，导致 tab/close/drag 事件错位。
          // 这里用 TabsTrigger asChild 承载 Radix 状态，真实 DOM 改成 div，关闭按钮继续保持原生 button。
          event.preventDefault();
        }}
        onClick={(event) => {
          // 浏览器可能同时派发 middle-click 的 click/auxclick；先在 click 阶段拦截，
          // 避免关闭前把 inactive tab 激活。
          if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            event.preventDefault();
            return;
          }

          onActivateTab(id);
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return;

          // Side Pane tab 之前只有左键激活和显式关闭按钮，middle-click 会触发
          // 浏览器默认自动滚动，且部分浏览器还会先触发 tab 激活。统一在 auxclick 阶段
          // 取消默认行为并关闭目标 tab，保持原 active tab 不变。
          event.preventDefault();
          event.stopPropagation();
          onCloseTab(id);
        }}
        className={cn(
          "group relative inline-flex items-center gap-1 [corner-shape:superellipse(1.5)]",
          "flex-[1_1_9.75rem] !h-7 min-w-15 max-w-39 justify-start overflow-hidden rounded-md border px-1.5 pr-2 text-ui-base font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
          "!border-transparent !bg-transparent text-foreground-subtle !rounded-lg",
          "hover:text-foreground focus-visible:!border-remote-foreground-muted",
          !isActive && "hover:!bg-hover",
          // TabsTrigger asChild 经过 ContextMenuTrigger 再包一层后，Radix 的 active 标记不会稳定落到真实 tab div。
          // 这里用受控的 isActive 同步补齐 data-active / data-state，保证 Tailwind 的 active variant 能命中。
          "data-active:!bg-selected data-active:text-foreground data-active:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.08)]",
          "cursor-default",
          isDragging && "cursor-grabbing shadow-md",
        )}
      >
        <SidePaneTabPresentationContent
          icon={icon}
          badge={badge}
          title={title}
          closeVisible={isActive}
          revealCloseOnHover
          titlePrefix={titlePrefix}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={closeTabLabel}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 rounded-md",
            !isActive &&
              "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          )}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            // 关闭按钮的 Enter/Space 不能冒泡成父 Tab 的激活动作。
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCloseTab(id);
          }}
        >
          <XIcon className="size-3" />
        </Button>
      </div>
    </TabsTrigger>
  );

  return (
    <ContextMenu>
      <SidePaneTabTitleTooltip isDragging={isDragging} title={accessibleTitle ?? title}>
        <ContextMenuTrigger asChild>{tabTrigger}</ContextMenuTrigger>
      </SidePaneTabTitleTooltip>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => onCloseTab(id)}>{closeTabMenuLabel}</ContextMenuItem>
        <ContextMenuItem disabled={!canCloseOtherTabs} onSelect={() => onCloseOtherTabs(id)}>
          {closeOtherTabsLabel}
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCloseAllTabs}>{closeAllTabsLabel}</ContextMenuItem>
        {onMoveTab && moveTabLeftLabel && moveTabRightLabel && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={!canMoveLeft} onSelect={() => onMoveTab(id, -1)}>
              {moveTabLeftLabel}
            </ContextMenuItem>
            <ContextMenuItem disabled={!canMoveRight} onSelect={() => onMoveTab(id, 1)}>
              {moveTabRightLabel}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SidePaneTabPresentationDragOverlay({
  title,
  titlePrefix,
  icon,
  badge,
}: {
  title: string;
  titlePrefix?: string;
  icon: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex !h-7 w-39 min-w-15 max-w-39 items-center justify-start gap-1.5 whitespace-nowrap rounded-lg border border-transparent bg-selected px-1.5 pr-1 text-ui-base font-medium text-foreground shadow-md",
        "cursor-grabbing [corner-shape:superellipse(1.5)]",
      )}
    >
      <SidePaneTabPresentationContent
        icon={icon}
        badge={badge}
        title={title}
        titlePrefix={titlePrefix}
      />
    </div>
  );
}

function SidePaneTabPresentationContent({
  icon,
  badge,
  title,
  titlePrefix,
  closeVisible = false,
  revealCloseOnHover = false,
}: {
  icon: ReactNode;
  badge?: ReactNode;
  title: string;
  titlePrefix?: string;
  closeVisible?: boolean;
  revealCloseOnHover?: boolean;
}) {
  return (
    <span
      data-side-pane-tab-content=""
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-var(--tab-fade-offset)-0.5rem),transparent_calc(100%-var(--tab-fade-offset)))]",
        closeVisible ? "[--tab-fade-offset:1.25rem]" : "[--tab-fade-offset:0px]",
        revealCloseOnHover &&
          "group-hover:[--tab-fade-offset:1.25rem] group-focus-within:[--tab-fade-offset:1.25rem]",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      {titlePrefix && (
        <span className="shrink-0 text-ui-sm font-normal text-foreground-subtle">
          {titlePrefix}
        </span>
      )}
      <span data-side-pane-tab-title="" className="shrink-0 whitespace-nowrap">
        {title}
      </span>
      {badge}
    </span>
  );
}

