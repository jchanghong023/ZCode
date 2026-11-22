import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** 选区浮层统一定位：优先放在选区上方居中，放不下翻到下方，并钳在视口内。 */
function useSelectionAnchoredPosition(
  ref: RefObject<HTMLElement | null>,
  anchor: { center: number; top: number; bottom: number },
  layoutKey: string,
) {
  const { center, top, bottom } = anchor;
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const position = () => {
      const gap = 8;
      const rect = menu.getBoundingClientRect();
      const left = Math.max(
        12,
        Math.min(window.innerWidth - rect.width - 12, center - rect.width / 2),
      );
      menu.style.left = `${left}px`;
      const above = top - rect.height - gap >= 12;
      const preferredTop = above ? top - rect.height - gap : bottom + gap;
      menu.style.top = `${Math.max(12, Math.min(window.innerHeight - rect.height - 12, preferredTop))}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(menu);
    return () => observer?.disconnect();
  }, [ref, center, top, bottom, layoutKey]);
}

// 问题原因：Markdown 曾复制一份固定宽度的竖排菜单，与对话流逐渐分叉。
// 两处只传选区位置与动作，共用展示和尺寸测量，避免再次出现样式差异。
export function SelectionActionMenu({
  center,
  top,
  bottom,
  singleLimit,
  onAddToCurrentTask,
}: {
  center: number;
  top: number;
  bottom: number;
  singleLimit?: boolean;
  onAddToCurrentTask: () => void;
}) {
  const { intl, locale } = useZCodeIntl();
  const ref = useRef<HTMLDivElement>(null);
  useSelectionAnchoredPosition(ref, { center, top, bottom }, `${String(singleLimit)}:${locale}`);
  return createPortal(
    <div
      ref={ref}
      data-conversation-selection-tooltip="true"
      style={{
        width: "max-content",
        maxWidth: Math.min(576, window.innerWidth - 24),
        left: 12,
        top: 12,
      }}
      className="fixed z-50 flex overflow-hidden rounded-lg border border-popover-border bg-menu text-ui-sm text-foreground shadow-md"
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {singleLimit ? (
        <div className="px-2.5 py-1.5 text-[var(--color-warning)]">
          {intl.formatMessage({ id: "chat.selections.limit.single" })}
        </div>
      ) : (
        <button
          type="button"
          data-conversation-selection-action="add-to-task"
          className="min-w-0 px-2.5 py-1.5 hover:bg-menu-hover"
          onClick={onAddToCurrentTask}
        >
          {intl.formatMessage({ id: "chat.selections.addToTask" })}
        </button>
      )}
    </div>,
    document.body,
  );
}
