import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createUuid } from "@zcode/shared";
import {
  activatePaneTab,
  closePaneTab,
  reorderPaneTab,
  selectPaneTab,
} from "@/lib/workspaceSidePane.js";
import { useAIReq } from "../AIReqContext.js";
import type {
  AIReqSidePaneController,
  AIReqSidePaneRequest,
  AIReqSidePaneTab,
} from "./contract.js";

interface PaneScope {
  tabs: AIReqSidePaneTab[];
  activeTabId: string;
  collapsed: boolean;
  fullView: boolean;
  recentClosed: AIReqSidePaneTab[];
}
const emptyScope = (): PaneScope => ({
  tabs: [],
  activeTabId: "",
  collapsed: true,
  fullView: false,
  recentClosed: [],
});
const Context = createContext<AIReqSidePaneController | null>(null);
export function useAIReqSidePane(): AIReqSidePaneController {
  const value = useContext(Context);
  if (!value) throw new Error("Side Pane provider is required");
  return value;
}
function sidePaneTargetKey(target: AIReqSidePaneRequest): string {
  const s = target.selection;
  return JSON.stringify([s.projectId, target.releaseId, s.irId, s.srId, target.kind]);
}
const targetScope = (target: AIReqSidePaneRequest) => target.selection.projectId ?? "";
export function AIReqSidePaneProvider({ children }: { children: ReactNode }) {
  const ai = useAIReq()!;
  const scopeKey = ai.selection.projectId ?? "";
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const [scopes, setScopes] = useState<Record<string, PaneScope>>({});
  const scopesRef = useRef(scopes);
  const edit = useCallback((key: string, change: (current: PaneScope) => PaneScope) => {
    const current = scopesRef.current[key] ?? emptyScope();
    const next = change(current);
    if (next === current) return;
    const updated = { ...scopesRef.current, [key]: next };
    scopesRef.current = updated;
    setScopes(updated);
  }, []);
  const open = useCallback(
    (request: AIReqSidePaneRequest) => {
      const key = targetScope(request);
      // 迟到的打开回调不能将其他范围的标签浮到当前工作台。
      if (key !== scopeRef.current) return;
      const identity = sidePaneTargetKey(request);
      edit(key, (state) => {
        const existing = state.tabs.find((tab) => sidePaneTargetKey(tab) === identity);
        const tab = existing
          ? { ...existing, ...request, openSequence: existing.openSequence + 1 }
          : { ...request, id: createUuid(), openSequence: 0 };
        return {
          ...state,
          ...activatePaneTab(state, tab),
          collapsed: false,
          recentClosed: state.recentClosed.filter((entry) => sidePaneTargetKey(entry) !== identity),
        };
      });
    },
    [edit],
  );
  const activate = useCallback(
    (id: string) => {
      const key = scopeRef.current,
        state = scopesRef.current[key];
      if (!state || state.activeTabId === id || !state.tabs.some((tab) => tab.id === id)) return;
      edit(key, (current) => ({ ...current, ...selectPaneTab(current, id), collapsed: false }));
    },
    [edit],
  );
  const remember = (state: PaneScope, closing: AIReqSidePaneTab[]) =>
    [
      ...[...closing].reverse(),
      ...state.recentClosed.filter((tab) => !closing.some((closed) => closed.id === tab.id)),
    ].slice(0, 20);
  const close = useCallback(
    (id: string, options?: { others?: boolean }) => {
      const key = scopeRef.current,
        state = scopesRef.current[key];
      if (!state) return;
      const closing = state.tabs.filter((tab) => (options?.others ? tab.id !== id : tab.id === id));
      edit(key, (current) => {
        let next = current;
        for (const tab of closing)
          next = { ...next, ...(closePaneTab(next, tab.id) ?? { tabs: [], activeTabId: "" }) };
        return { ...next, recentClosed: remember(current, closing) };
      });
    },
    [edit],
  );
  const closeAll = useCallback(() => {
    edit(scopeRef.current, (current) => ({
      ...current,
      tabs: [],
      activeTabId: "",
      recentClosed: remember(current, current.tabs),
    }));
  }, [edit]);
  const restore = useCallback(
    (id: string) => {
      const key = scopeRef.current,
        state = scopesRef.current[key];
      const tab = state?.recentClosed.find((entry) => entry.id === id);
      if (!tab) return;
      edit(key, (current) => {
        const found = current.tabs.find(
          (entry) => sidePaneTargetKey(entry) === sidePaneTargetKey(tab),
        );
        return {
          ...current,
          ...activatePaneTab(current, found ?? tab),
          collapsed: false,
          recentClosed: current.recentClosed.filter((entry) => entry.id !== id),
        };
      });
    },
    [edit],
  );
  const reorder = useCallback(
    (from: string, to: string) =>
      edit(scopeRef.current, (state) => ({ ...state, ...reorderPaneTab(state, from, to) })),
    [edit],
  );
  const collapse = useCallback(() => {
    edit(scopeRef.current, (current) =>
      current.collapsed ? current : { ...current, collapsed: true, fullView: false },
    );
  }, [edit]);
  const expand = useCallback(() => {
    edit(scopeRef.current, (current) => ({ ...current, collapsed: false }));
  }, [edit]);
  const toggleFullView = useCallback(
    () =>
      edit(scopeRef.current, (state) => ({
        ...state,
        fullView: !state.fullView,
        collapsed: false,
      })),
    [edit],
  );
  const state = scopes[scopeKey] ?? emptyScope();
  const value = useMemo<AIReqSidePaneController>(
    () => ({
      tabs: state.tabs,
      activeTab: state.tabs.find((tab) => tab.id === state.activeTabId),
      isOpen: !state.collapsed,
      fullView: state.fullView && !state.collapsed,
      recentClosed: state.recentClosed,
      open,
      activate,
      close,
      closeAll,
      restore,
      reorder,
      expand,
      collapse,
      toggleFullView,
    }),
    [state, open, activate, close, closeAll, restore, reorder, expand, collapse, toggleFullView],
  );
  // 所有已打开scope保存在宿主组件内；host通过此同一集合维持非活动Tab的组件状态。
  return (
    <Context.Provider value={value}>
      <AIReqSidePaneMemoryContext.Provider value={scopes}>
        {children}
      </AIReqSidePaneMemoryContext.Provider>
    </Context.Provider>
  );
}
export const AIReqSidePaneMemoryContext = createContext<Record<string, PaneScope>>({});
