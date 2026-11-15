import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";

/** 只投影 DOM 横向滚动状态；纵向滚动仍由所属页面负责。 */
export function TrackingTableScroll({
  children,
  label,
  className,
  viewportTestId,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  viewportTestId?: string;
}) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const overflowing = edges.left || edges.right;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
      const position = Math.max(0, Math.min(element.scrollLeft, maximum));
      const left = position > 1;
      const right = position < maximum - 1;
      setEdges((previous) =>
        previous.left === left && previous.right === right ? previous : { left, right },
      );
    };
    // 同时观测视口及表格，分栏调整、字号和内容尺寸变化均按实际几何更新。
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);

  const move = (direction: number) => {
    const element = viewport.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(160, element.clientWidth * 0.75) });
  };

  return (
    <div className={cn("min-w-0", className)}>
      {overflowing && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-2 py-1 text-ui-sm text-foreground-subtle">
          <p id={`${id}-hint`}>
            左右滚动查看其余列
            <span className="sr-only">，聚焦表格后可用左右方向键、Home 和 End 横向滚动。</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`向左滚动${label}`}
              aria-controls={id}
              disabled={!edges.left}
              onClick={() => move(-1)}
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" />
              左移
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`向右滚动${label}`}
              aria-controls={id}
              disabled={!edges.right}
              onClick={() => move(1)}
            >
              右移
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
      <div
        id={id}
        ref={viewport}
        role="region"
        aria-label={label}
        aria-describedby={overflowing ? `${id}-hint` : undefined}
        tabIndex={0}
        data-testid={viewportTestId}
        className="min-w-0 overflow-x-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onKeyDown={(event) => {
          // 不接管单元格内按钮、输入框或依赖链接的按键。
          if (
            event.target !== event.currentTarget ||
            !overflowing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          )
            return;
          const element = viewport.current;
          if (!element) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            move(event.key === "ArrowLeft" ? -1 : 1);
          } else if (event.key === "Home" || event.key === "End") {
            element.scrollTo({
              left: event.key === "Home" ? 0 : element.scrollWidth - element.clientWidth,
            });
          } else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
