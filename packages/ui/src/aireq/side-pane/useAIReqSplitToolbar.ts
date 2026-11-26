import { useCallback } from "react";
import { useAIReq } from "../AIReqContext.js";
import { useAIReqSidePane } from "./AIReqSidePaneContext.js";

/** 左侧标题、操作或筛选条件换行时，仅让右栏跟随其高度，避免两栏相互撑高。 */
export function useAIReqSplitToolbar(view: "chat" | "proposals") {
  const ai = useAIReq()!;
  const pane = useAIReqSidePane();
  const active = ai.mainView === view && !ai.settingsOpen && pane.isOpen && !pane.fullView;

  return useCallback(
    (toolbar: HTMLElement | null) => {
      if (!active || !toolbar) return;
      const group = toolbar.closest<HTMLElement>("[data-aireq-split]");
      if (!group) return;
      const property = "--aireq-pane-toolbar-height";
      const observer = new ResizeObserver(([entry]) => {
        const height = entry?.borderBoxSize[0]?.blockSize ?? toolbar.offsetHeight;
        group.style.setProperty(property, `${height}px`);
      });
      observer.observe(toolbar, { box: "border-box" });
      return () => {
        observer.disconnect();
        group.style.removeProperty(property);
      };
    },
    [active],
  );
}
