import { Children, type ReactNode } from "react";

function isText(child: ReactNode): child is string | number {
  return typeof child === "string" || typeof child === "number";
}

function markText(child: ReactNode) {
  return isText(child) ? (
    <span data-aireq-control-label="" className="contents">
      {child}
    </span>
  ) : (
    child
  );
}

/** 图文并排时同步移动标题；由多段文字拼成的标签保持原排版。 */
export function controlMotionLabel(children: ReactNode) {
  if (Array.isArray(children) && children.filter(isText).length === 1) {
    return Children.map(children, markText);
  }
  return markText(children);
}
