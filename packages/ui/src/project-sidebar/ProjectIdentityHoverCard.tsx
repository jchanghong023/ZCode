import { useEffect, useRef, useState, type ReactElement, type PointerEvent } from "react";
import { HoverCard as HoverCardPrimitive } from "radix-ui";
import { Anchor, createPopperScope } from "@radix-ui/react-popper";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

const useHoverCardScope = HoverCardPrimitive.createHoverCardScope();
const usePopperScope = createPopperScope();

/** 项目入口只读项目及其目录，悬停结束即关闭，不保存点击锁定状态。 */
export function ProjectIdentityHoverCard({
  title,
  paths,
  anchorToMenu = false,
  contentClassName,
  children,
}: {
  title: string;
  paths: readonly string[];
  anchorToMenu?: boolean;
  contentClassName?: string;
  children: ReactElement;
}) {
  const { intl } = useZCodeIntl();
  const scope = useHoverCardScope(undefined);
  const popperScope = usePopperScope(scope.__scopeHoverCard);
  const trigger = useRef<HTMLAnchorElement>(null);
  // 固定偏移会把不存在的滚动条也算进去；让定位器直接读取菜单外沿，仍以行高确定纵向位置。
  const menuAnchor = useRef({
    get contextElement() {
      return trigger.current ?? undefined;
    },
    getBoundingClientRect() {
      const row = trigger.current;
      if (!row) return new DOMRect();
      const bounds = row.getBoundingClientRect();
      const menu = row.closest('[role="menu"]')?.getBoundingClientRect();
      return menu ? new DOMRect(menu.left, bounds.top, menu.width, bounds.height) : bounds;
    },
  });
  const [open, setOpen] = useState(false);
  const details = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const overDetails = useRef(false);
  const changeOpen = (next: boolean) => {
    clearTimeout(openTimer.current);
    setOpen(next);
  };
  const scheduleOpen = () => {
    // 菜单的指针进入会同时触发聚焦；只保留一个打开任务，避免离开后旧任务再次打开浮层。
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), 300);
  };
  const leave = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      (trigger.current?.contains(next) || details.current?.contains(next))
    )
      return;
    changeOpen(false);
  };
  useEffect(() => {
    clearTimeout(openTimer.current);
    setOpen(false);
    overDetails.current = false;
    return () => clearTimeout(openTimer.current);
  }, [title]);
  const msg = (id: string) => intl.formatMessage({ id });
  return (
    <HoverCard {...scope} open={open} onOpenChange={changeOpen}>
      <HoverCardTrigger
        {...scope}
        ref={trigger}
        asChild
        onPointerEnter={(event) => {
          event.preventDefault();
          if (event.pointerType !== "touch") scheduleOpen();
        }}
        onPointerLeave={leave}
        onFocus={(event) => {
          event.preventDefault();
          // 触屏点击也会聚焦；只有键盘焦点打开详情，避免点击后留下 hover 浮层。
          if (event.target.matches(":focus-visible")) scheduleOpen();
        }}
        onBlur={(event) => {
          event.preventDefault();
          // 菜单移出条目时会把焦点收回容器，这不是离开详情；关闭交给指针移出处理，
          // 同时阻止 Radix 默认失焦关闭，否则鼠标进入详情后仍会被菜单的焦点回收关闭。
          const menu = event.currentTarget.closest('[role="menu"]');
          if (menu && event.relatedTarget === menu) return;
          // 点击详情文字会让按钮失焦但没有新焦点；仍在详情内时保留选择和复制。
          if (event.relatedTarget || !overDetails.current) changeOpen(false);
        }}
      >
        {children}
      </HoverCardTrigger>
      {anchorToMenu && open ? <Anchor {...popperScope} virtualRef={menuAnchor} /> : null}
      <HoverCardContent
        {...scope}
        ref={details}
        data-testid="project-identity-details"
        role="tooltip"
        side="right"
        align="start"
        onPointerEnter={(event) => {
          event.preventDefault();
          overDetails.current = true;
          clearTimeout(openTimer.current);
        }}
        onPointerLeave={(event) => {
          overDetails.current = false;
          leave(event);
        }}
        // 窄屏左右空间都不足时，固定宽度会溢出；按定位器的实际可用空间换行和滚动。
        className={cn(
          "w-80 max-w-(--radix-hover-card-content-available-width) rounded-xl p-0 text-ui-sm data-closed:hidden data-closed:animate-none before:absolute before:inset-y-0 before:w-1 data-[side=right]:before:-left-1 data-[side=left]:before:-right-1",
          contentClassName,
        )}
      >
        {/* 4px 间隙由透明命中区连接，滚动放在内层，移入复制不再依赖关闭延时。 */}
        <div className="@container/project-details max-h-(--radix-hover-card-content-available-height) overflow-y-auto p-3">
          <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
            <strong className="min-w-0 flex-1 break-words font-medium">{title}</strong>
          </div>
          {/* 菜单旁可用空间很窄时，横向标签会把路径挤成一字一行；改为上下排列。 */}
          <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 @min-[16rem]/project-details:grid-cols-[auto_minmax(0,1fr)]">
            {/* 标题已展示项目名，正文只保留目录，避免重复。 */}
            <dt className="text-remote-foreground-muted">{msg("workspaceSidebar.projectPath")}</dt>
            <dd className="min-w-0 break-all font-mono">
              {paths.length ? paths.map((path) => <div key={path}>{path}</div>) : "—"}
            </dd>
          </dl>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
