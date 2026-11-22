import { useZCodeIntl } from "@/i18n/IntlProvider.js";
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
import type { AIReqWorkflowTarget } from "../contract.js";
import type {
  AIReqSidePaneController,
  AIReqSidePaneGuard,
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
export function sidePaneTargetKey(target: AIReqSidePaneRequest): string {
  const s = target.selection;
  return JSON.stringify([target.kind, s.projectId, target.releaseId, s.irId, s.srId]);
}
const targetScope = (target: AIReqSidePaneRequest) =>
  JSON.stringify([target.selection.projectId ?? "", target.releaseId]);
export function AIReqSidePaneProvider({ children }: { children: ReactNode }) {
  const ai = useAIReq()!;
  const { locale } = useZCodeIntl();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const scopeKey = JSON.stringify([ai.selection.projectId ?? "", ai.releaseId]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const [scopes, setScopes] = useState<Record<string, PaneScope>>({});
  const scopesRef = useRef(scopes);
  const guards = useRef(new Map<string, Exclude<AIReqSidePaneGuard, null>>());
  const edit = useCallback((key: string, change: (current: PaneScope) => PaneScope) => {
    const current = scopesRef.current[key] ?? emptyScope();
    const next = change(current);
    if (next === current) return;
    const updated = { ...scopesRef.current, [key]: next };
    scopesRef.current = updated;
    setScopes(updated);
  }, []);
  const admit = useCallback((ids: string[], action: () => void) => {
    const key = scopeRef.current;
    const finish = () => {
      if (scopeRef.current === key) action();
    };
    const checks = [...new Set(ids)]
      .map((id) => guards.current.get(id))
      .filter((guard): guard is Exclude<AIReqSidePaneGuard, null> => Boolean(guard));
    const run = checks.reduceRight<() => void>((next, guard) => () => guard(next), finish);
    run();
  }, []);
  const registerGuard = useCallback((id: string, guard: AIReqSidePaneGuard) => {
    if (guard) guards.current.set(id, guard);
    else guards.current.delete(id);
  }, []);
  const open = useCallback(
    (request: AIReqSidePaneRequest, options?: { ifAbsent?: boolean }) => {
      const key = targetScope(request);
      // 目标来自当前范围；不能让后台Tab或迟到回调把别的项目面板浮到当前工作台。
      if (key !== scopeRef.current) return;
      const current = scopesRef.current[key] ?? emptyScope();
      const identity = sidePaneTargetKey(request);
      const existing = current.tabs.find(
        (tab) => tab.kind !== "launcher" && sidePaneTargetKey(tab) === identity,
      );
      if (existing && options?.ifAbsent) return;
      const apply = () =>
        edit(key, (state) => {
          const found = state.tabs.find(
            (tab) => tab.kind !== "launcher" && sidePaneTargetKey(tab) === identity,
          );
          const tab = found ? { ...found, ...request } : { ...request, id: createUuid() };
          return { ...state, ...activatePaneTab(state, tab), collapsed: false };
        });
      admit(
        // 收起已通过当前标签的离开门禁。隐藏的标签不能再次拦截显式打开操作。
        !current.collapsed && current.activeTabId && current.activeTabId !== existing?.id
          ? [current.activeTabId]
          : [],
        apply,
      );
    },
    [admit, edit],
  );
  const updateTab = useCallback(
    (id: string, selection: AIReqWorkflowTarget, releaseId?: string) => {
      // 后台内容仍归原集合；迟到完成只能更新原 Tab，不能写入当前项目的集合。
      const entry = Object.entries(scopesRef.current).find(([, state]) =>
        state.tabs.some((tab) => tab.id === id),
      );
      if (!entry) return;
      const [key, state] = entry;
      const tab = state.tabs.find((item) => item.id === id)!;
      const next = { ...tab, selection, releaseId: releaseId ?? tab.releaseId };
      if (targetScope(next) !== key || sidePaneTargetKey(next) !== sidePaneTargetKey(tab)) return;
      edit(key, (current) => ({
        ...current,
        tabs: current.tabs.map((item) => (item.id === id ? next : item)),
      }));
    },
    [edit],
  );
  const activate = useCallback(
    (id: string) => {
      const key = scopeRef.current,
        state = scopesRef.current[key];
      if (!state || state.activeTabId === id || !state.tabs.some((tab) => tab.id === id)) return;
      admit([state.activeTabId], () =>
        edit(key, (current) => ({ ...current, ...selectPaneTab(current, id), collapsed: false })),
      );
    },
    [admit, edit],
  );
  const remember = (state: PaneScope, closing: AIReqSidePaneTab[]) =>
    [
      ...closing.filter((tab) => tab.kind !== "launcher").reverse(),
      ...state.recentClosed.filter((tab) => !closing.some((closed) => closed.id === tab.id)),
    ].slice(0, 20);
  const close = useCallback(
    (id: string, options?: { others?: boolean }) => {
      const key = scopeRef.current,
        state = scopesRef.current[key];
      if (!state) return;
      const closing = state.tabs.filter((tab) => (options?.others ? tab.id !== id : tab.id === id));
      admit(
        closing.map((tab) => tab.id),
        () =>
          edit(key, (current) => {
            let next = current;
            for (const tab of closing)
              next = { ...next, ...(closePaneTab(next, tab.id) ?? { tabs: [], activeTabId: "" }) };
            return { ...next, recentClosed: remember(current, closing) };
          }),
      );
    },
    [admit, edit],
  );
  const closeAll = useCallback(() => {
    const key = scopeRef.current,
      state = scopesRef.current[key];
    if (!state) return;
    admit(
      state.tabs.map((tab) => tab.id),
      () =>
        edit(key, (current) => ({
          ...current,
          tabs: [],
          activeTabId: "",
          recentClosed: remember(current, current.tabs),
        })),
    );
  }, [admit, edit]);
  const newTab = useCallback(() => {
    const key = scopeRef.current,
      state = scopesRef.current[key] ?? emptyScope();
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    const request: AIReqSidePaneTab = {
      id: createUuid(),
      kind: "launcher",
      title: locale === "zh-CN" ? "新标签页" : "New tab",
      selection: { ...(active?.selection ?? aiRef.current.selection) },
      releaseId: aiRef.current.releaseId,
    };
    admit(state.activeTabId ? [state.activeTabId] : [], () =>
      edit(key, (current) => ({
        ...current,
        ...activatePaneTab(current, request),
        collapsed: false,
      })),
    );
  }, [admit, edit, locale]);
  const restore = useCallback(
    (id: string) => {
      const key = scopeRef.current,
        state = scopesRef.current[key];
      const tab = state?.recentClosed.find((entry) => entry.id === id);
      if (!tab) return;
      admit(state!.activeTabId ? [state!.activeTabId] : [], () =>
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
        }),
      );
    },
    [admit, edit],
  );
  const reorder = useCallback(
    (from: string, to: string) =>
      edit(scopeRef.current, (state) => ({ ...state, ...reorderPaneTab(state, from, to) })),
    [edit],
  );
  const collapse = useCallback(() => {
    const key = scopeRef.current,
      state = scopesRef.current[key];
    admit(state?.activeTabId ? [state.activeTabId] : [], () =>
      edit(key, (current) => ({ ...current, collapsed: true, fullView: false })),
    );
  }, [admit, edit]);
  const toggle = useCallback(() => {
    const key = scopeRef.current,
      state = scopesRef.current[key];
    if (state && !state.collapsed) collapse();
    else if (!state?.tabs.length) newTab();
    else edit(key, (current) => ({ ...current, collapsed: false }));
  }, [collapse, newTab, edit]);
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
      updateTab,
      activate,
      close,
      closeAll,
      newTab,
      restore,
      reorder,
      toggle,
      collapse,
      toggleFullView,
      registerGuard,
    }),
    [
      state,
      open,
      updateTab,
      activate,
      close,
      closeAll,
      newTab,
      restore,
      reorder,
      toggle,
      collapse,
      toggleFullView,
      registerGuard,
    ],
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
