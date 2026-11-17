import { describe, expect, it } from "vitest";
import {
  activatePaneTab,
  closePaneTab,
  reorderPaneTab,
  selectPaneTab,
} from "../../packages/ui/src/lib/workspaceSidePane.js";

function pane(activeTabId = "report") {
  return {
    tabs: [
      { id: "material", title: "材料" },
      { id: "report", title: "报告" },
      { id: "history", title: "历史" },
    ],
    activeTabId,
  };
}

describe("AIReq side pane tab transitions", () => {
  it("opens the first tab and appends a different target as active", () => {
    const first = activatePaneTab(null, { id: "material", title: "材料" });
    expect(first).toEqual({ tabs: [{ id: "material", title: "材料" }], activeTabId: "material" });
    expect(activatePaneTab(first, { id: "report", title: "报告" })).toEqual({
      tabs: [
        { id: "material", title: "材料" },
        { id: "report", title: "报告" },
      ],
      activeTabId: "report",
    });
    expect(first).toEqual({ tabs: [{ id: "material", title: "材料" }], activeTabId: "material" });
  });

  it("reuses an existing target in place and refreshes its content", () => {
    const state = pane("history");
    const original = structuredClone(state);
    expect(activatePaneTab(state, { id: "report", title: "更新后的报告" })).toEqual({
      tabs: [state.tabs[0], { id: "report", title: "更新后的报告" }, state.tabs[2]],
      activeTabId: "report",
    });
    expect(state).toEqual(original);
  });

  it.each([
    ["material", "report"],
    ["report", "history"],
    ["history", "report"],
  ])("selects the adjacent surviving tab when closing active %s", (closed, activeTabId) => {
    const state = pane(closed);
    const original = structuredClone(state);
    expect(closePaneTab(state, closed)).toEqual({
      tabs: state.tabs.filter((tab) => tab.id !== closed),
      activeTabId,
    });
    expect(state).toEqual(original);
  });

  it("keeps the active target when closing a background tab and clears the last tab", () => {
    expect(closePaneTab(pane(), "material")?.activeTabId).toBe("report");
    expect(closePaneTab({ tabs: [{ id: "report" }], activeTabId: "report" }, "report")).toBeNull();
  });

  it("selects an existing tab without changing the tab collection", () => {
    const state = pane();
    expect(selectPaneTab(state, "history")).toEqual({ ...state, activeTabId: "history" });
    expect(state.activeTabId).toBe("report");
  });

  it.each([
    ["material", "history", ["report", "history", "material"]],
    ["history", "material", ["history", "material", "report"]],
  ])("reorders %s toward %s while preserving active target", (from, to, order) => {
    const state = pane();
    const next = reorderPaneTab(state, from, to);
    expect(next?.tabs.map((tab) => tab.id)).toEqual(order);
    expect(next?.activeTabId).toBe("report");
    expect(state.tabs.map((tab) => tab.id)).toEqual(["material", "report", "history"]);
  });

  it("ignores invalid operations without damaging existing state", () => {
    const state = pane();
    expect(closePaneTab(state, "unknown")).toBe(state);
    expect(selectPaneTab(state, "unknown")).toBe(state);
    expect(reorderPaneTab(state, "unknown", "report")).toBe(state);
    expect(reorderPaneTab(state, "report", "unknown")).toBe(state);
    expect(reorderPaneTab(state, "report", "report")).toBe(state);
    expect(activatePaneTab(null, { id: "material" }).activeTabId).toBe("material");
    expect(closePaneTab(null, "unknown")).toBeNull();
    expect(selectPaneTab(null, "unknown")).toBeNull();
    expect(reorderPaneTab(null, "unknown", "report")).toBeNull();
  });
});
