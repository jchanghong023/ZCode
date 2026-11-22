import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/lib/utils.js";
import {
  AnnotationNumber,
  type AnnotationNumberVariant,
} from "@/selection-comment/AnnotationNumber.js";
import {
  getSelectionLineRects,
  resolveSelectionTextAnchor,
} from "@/selection-comment/textAnchor.js";
import type { ConversationAnnotationMarksProps } from "@/selection-comment/contract.js";

interface MarkLayout {
  id: string;
  number: number;
  variant: AnnotationNumberVariant;
  lines: { left: number; top: number; width: number; height: number }[];
}

/** 时间线消息层（relative、随内容滚动）；标记挂在这里就不用跟着 scroll 事件重算位置。 */
const MESSAGE_LAYER_SELECTOR = '[data-v4-timeline-message-layer="true"]';
const OVERLAY_ATTRIBUTE = "data-conversation-annotation-marks";

function sameLayouts(a: readonly MarkLayout[], b: readonly MarkLayout[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 正文里的注释标记：选区下划线 + 末尾编号气泡。
 *
 * 不改 Markdown 渲染树：标记是消息层上的绝对定位覆盖层，坐标由文字锚点还原出的 Range 计算。
 * 这样流式输出、虚拟滚动卸载/重挂、主题切换都不需要改动行组件；行没挂载或文字对不上时就不画。
 * 只有待发引用编号接收悬停事件；编号和正文标记均不可编辑。
 */
export function ConversationAnnotationMarks({
  rootRef,
  items,
  hoveredId,
  onHover,
}: ConversationAnnotationMarksProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [layouts, setLayouts] = useState<readonly MarkLayout[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    frameRef.current = null;
    const root = rootRef.current;
    const nextHost = root?.querySelector<HTMLElement>(MESSAGE_LAYER_SELECTOR) ?? null;
    setHost((current) => (current === nextHost ? current : nextHost));
    if (!root || !nextHost) {
      setLayouts((current) => (current.length === 0 ? current : []));
      return;
    }
    const hostRect = nextHost.getBoundingClientRect();
    const next: MarkLayout[] = [];
    for (const item of itemsRef.current) {
      const row = root.querySelector<HTMLElement>(`[data-row-id="${item.rowId}"]`);
      const range = row ? resolveSelectionTextAnchor(row, item.anchor, item.text) : null;
      const lines = range ? getSelectionLineRects(range) : [];
      if (lines.length === 0) continue;
      next.push({
        id: item.id,
        number: item.number,
        variant: item.variant,
        lines: lines.map((line) => ({
          left: line.left - hostRect.left,
          top: line.top - hostRect.top,
          width: line.right - line.left,
          height: line.bottom - line.top,
        })),
      });
    }
    setLayouts((current) => (sameLayouts(current, next) ? current : next));
  }, [rootRef]);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    measure();
  }, [items, measure]);

  const active = items.length > 0;
  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return;
    // 流式 delta、虚拟行挂载/位移、表格展开都会改变文字位置；合并到下一帧重算一次。
    // 覆盖层自身的更新也在 root 子树里，必须过滤掉，否则会自我触发死循环。
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(
              record.target instanceof Element ? record.target : record.target.parentElement
            )?.closest(`[${OVERLAY_ATTRIBUTE}]`),
        )
      ) {
        schedule();
      }
    });
    mutations.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class", "open", "data-state"],
    });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(root);
    const layer = root.querySelector(MESSAGE_LAYER_SELECTOR);
    if (layer) resize?.observe(layer);
    window.addEventListener("resize", schedule);
    return () => {
      mutations.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [active, rootRef, schedule]);

  if (!host || layouts.length === 0) return null;
  return createPortal(
    <div
      {...{ [OVERLAY_ATTRIBUTE]: "true" }}
      aria-hidden="false"
      className="pointer-events-none absolute inset-0 select-none"
    >
      {layouts.map((layout) => {
        const sent = layout.variant === "sent-comment" || layout.variant === "sent-quote";
        const solid = layout.variant === "comment" || layout.variant === "sent-comment";
        const highlighted = hoveredId === layout.id && !sent;
        const last = layout.lines[layout.lines.length - 1];
        if (!last) return null;
        return (
          <div key={layout.id} data-annotation-mark={layout.id}>
            {layout.lines.map((line, index) => (
              <div
                key={index}
                className={cn(
                  "absolute",
                  highlighted && "rounded-[2px] bg-icon-blue/15",
                )}
                style={{ left: line.left, top: line.top, width: line.width, height: line.height }}
              >
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 border-b-[1.5px]",
                    solid ? "border-solid" : "border-dotted",
                    sent ? "border-foreground-subtlest" : "border-icon-blue",
                  )}
                />
              </div>
            ))}
            {sent ? (
              <span
                className="absolute"
                style={{ left: last.left + last.width + 1, top: last.top - 6 }}
              >
                <AnnotationNumber value={layout.number} variant={layout.variant} />
              </span>
            ) : (
              <span
                role="img"
                data-annotation-mark-id={layout.id}
                data-annotation-mark-number={layout.number}
                aria-label={String(layout.number)}
                className="pointer-events-auto absolute flex rounded-full"
                style={{ left: last.left + last.width + 1, top: last.top - 6 }}
                onMouseEnter={() => onHover(layout.id)}
                onMouseLeave={() => onHover(null)}
              >
                <AnnotationNumber
                  value={layout.number}
                  variant={layout.variant}
                  highlighted={highlighted}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>,
    host,
  );
}
