import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectTree, ProjectTaskRef } from "@/project-sidebar/contract.js";
import { stabilizeProjectTree, applyProjectTaskActivities } from "@/project-sidebar/view.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { onTaskNavigationCommitted } from "@/store/zcodeSessionStoreNavigation.js";
import { useWorkspaceSessionsIndexItems } from "@/v4/useWorkspaceSessionsIndexItems.js";
import { getTaskListRowActivity } from "@/v4/taskListRowActivity.js";
import { getWindowControllerTaskListRegistry } from "@/v4/windowControllerTaskListRegistry.js";
import { logger } from "@/logger.js";
import { useProjectUnreadSignals } from "@/project-sidebar/useProjectUnreadSignals.js";

const subscribeToNothing = () => () => {};
const zeroRevision = () => 0;
const EMPTY: ProjectTree = { projects: [], tasks: [] };

export function useProjectTree() {
  const services = useBaseWorkspaceServices();
  // 远端 bridge 的 base 服务属于 Source；侧栏读写与失效流必须整组来自窗口目录。
  const directoryServices = services.windowProjectDirectory ?? services;
  const service = directoryServices.projectService;
  const projectChanges = services.windowProjectDirectory?.changesService;
  const controller = services.windowControllerService;
  const registry = useMemo(
    () => (controller ? getWindowControllerTaskListRegistry(controller) : null),
    [controller],
  );
  const revision = useSyncExternalStore(
    registry?.subscribe ?? subscribeToNothing,
    registry?.getRevision ?? zeroRevision,
    registry?.getRevision ?? zeroRevision,
  );
  const directoryRevision = registry?.getDirectoryRevision() ?? 0;
  const sourceRevision = registry?.getSourceRevision() ?? 0;
  const tabs = useTabStore((state) => state.tabs);
  const version = useZCodeSessionStore((state) =>
    Object.values(state.workspaces).reduce((n, workspace) => n + workspace.taskListVersion, 0),
  );
  const [tree, setTree] = useState<ProjectTree>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const serial = useRef(0);
  const reads = useMemo(() => ({ flight: null as Promise<void> | null, dirty: false }), [service]);
  const pendingCommits = useRef(
    new Set<{
      target: ProjectTaskRef;
      commit(): void;
      organize?(): Promise<void>;
      finish(error?: unknown): void;
    }>(),
  );
  const removeTaskState = useZCodeSessionStore((state) => state.removeTaskState);
  const accepted = useRef<{ service: typeof service; tree: ProjectTree } | null>(null);
  const readOnce = useCallback(async () => {
    const request = serial.current;
    // 读取在途期间被导航打开的任务（workspaceKey + taskId），见下方归档清理的修复说明。
    const navigatedDuringRead = new Set<string>();
    const navigation = onTaskNavigationCommitted((target) =>
      navigatedDuringRead.add(
        JSON.stringify([target.workspaceIdentity?.trim() || target.workspacePath, target.taskId]),
      ),
    );
    try {
      if (!service) throw new Error("project.service-unavailable");
      const result = await service.readTree({ includeDeleted: true, includeDeletedTasks: true });
      if (request === serial.current) {
        const previous = accepted.current;
        if (previous?.service === service) {
          for (const project of result.projects) {
            const before = previous.tree.projects.find(
              (item) => item.id === project.id && item.hostId === project.hostId,
            );
            if (before && before.primaryRootStatus !== project.primaryRootStatus) {
              logger.debug("[project-sidebar] 项目主目录状态变化", {
                projectId: project.id,
                hostId: project.hostId,
                previous: before.primaryRootStatus,
                current: project.primaryRootStatus,
              });
            }
          }
        }
        accepted.current = { service, tree: result };
        // Bugfix: 自动归档只改 Host archived，未执行手动归档的 UI 清理，导致列表消失而详情残留。
        // 只处理已接受快照中的明确状态转换；首次已归档与迟到响应都不是归档事件。
        if (previous?.service === service) {
          const key = (task: ProjectTree["tasks"][number]) =>
            JSON.stringify([
              task.hostId,
              task.workspaceIdentity?.trim() || task.workspacePath,
              task.taskId,
            ]);
          const before = new Map(previous.tree.tasks.map((task) => [key(task), task]));
          for (const task of result.tasks) {
            if (task.archived && before.get(key(task))?.archived === false) {
              // 修复原因（PLM-EXT-P3C 运行时证据）：读取是 single-flight，读取期间的新变化只排到下一轮，
              // 这里接受的快照可能已经过期。插件在约 10ms 内「归档 → 取消归档 → 打开」：readTree 读在
              // 归档与取消归档之间（archived=true），快照在「打开」提交之后才被接受，清理把刚打开的会话
              // 撤出窗格，下一轮读到 archived=false 也撤不回来。之后的导航是更新的意图，这一轮不清理；
              // 任务确实仍是归档态时，就和显式打开归档历史一样照常显示。
              const navigated = JSON.stringify([
                task.workspaceIdentity?.trim() || task.workspacePath,
                task.taskId,
              ]);
              if (navigatedDuringRead.has(navigated)) {
                logger.info("[project-sidebar] 读取期间已打开该任务，跳过归档清理", {
                  taskId: task.taskId,
                  workspacePath: task.workspacePath,
                  workspaceIdentity: task.workspaceIdentity,
                });
                continue;
              }
              logger.info("[project-sidebar] 归档后清理任务展示", {
                taskId: task.taskId,
                workspacePath: task.workspacePath,
                workspaceIdentity: task.workspaceIdentity,
              });
              removeTaskState(task.workspacePath, task.taskId, task.workspaceIdentity);
            }
          }
        }
        const ready = [...pendingCommits.current].filter(({ target }) =>
          result.tasks.some(
            (task) =>
              task.taskId === target.taskId &&
              (task.workspaceIdentity?.trim() || task.workspacePath) ===
                (target.workspaceIdentity?.trim() || target.workspacePath),
          ),
        );
        // 根因：把组织 RPC 放进共享读取屏障后，一个无回包请求会卡住整棵目录和所有首发。
        // 真实行确认后独立提交组织动作；目录发布、详情提升和导航取消都不等待它。
        for (const pending of ready) {
          if (pending.organize)
            void Promise.resolve()
              .then(pending.organize)
              .catch((cause) => logger.error("[project-sidebar] 首发组织提交失败", cause));
        }
        const commit = () => {
          setTree((previous) => stabilizeProjectTree(previous, result));
          setError(null);
          for (const pending of ready) {
            try {
              pending.commit();
              logger.info("[project-sidebar] 首发目录与详情提交", pending.target);
              pending.finish();
            } catch (cause) {
              pending.finish(cause);
              throw cause;
            }
          }
        };
        // Bug 根因：目录是 React state，详情绑定是外部 store；首发只靠事件先后不能
        // 保证同一可见帧。真实行到达后在这里一起提交，沿用原首发回调。
        if (ready.length) flushSync(commit);
        else commit();
      }
    } catch (cause) {
      if (request === serial.current) {
        setError(String(cause));
        for (const pending of pendingCommits.current) pending.finish(cause);
        logger.error("[project-sidebar] 读取项目树失败", cause);
      }
    } finally {
      navigation.dispose();
      if (request === serial.current) setLoading(false);
    }
  }, [service, removeTaskState]);
  const refresh = useCallback(() => {
    reads.dirty = true;
    if (reads.flight) return reads.flight;
    const generation = serial.current;
    const flight = (async () => {
      // 事实变化只标记下一次读取，不能反复废弃当前结果，否则连续变化会饿死列表。
      while (reads.dirty && generation === serial.current) {
        reads.dirty = false;
        await readOnce();
      }
    })().finally(() => {
      if (reads.flight === flight) reads.flight = null;
    });
    reads.flight = flight;
    return flight;
  }, [readOnce, reads]);
  const commitCreatedTask = useCallback(
    (
      target: ProjectTaskRef,
      commit: () => void,
      signal?: AbortSignal,
      organize?: () => Promise<void>,
    ) => {
      if (signal?.aborted && !organize) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const complete = (error?: unknown) => {
          signal?.removeEventListener("abort", cancel);
          if (error) reject(error);
          else resolve();
        };
        const cancel = () => {
          // 导航取消立即结束 UI 等待；尚未确认的组织意图保留到真实行到达，不丢掉已 accepted 的 placement。
          if (!organize) pendingCommits.current.delete(pending);
          complete();
        };
        const pending = {
          target,
          organize,
          commit: () => {
            if (!signal?.aborted) commit();
          },
          finish(error?: unknown) {
            pendingCommits.current.delete(pending);
            complete(error);
          },
        };
        pendingCommits.current.add(pending);
        if (signal?.aborted) cancel();
        else signal?.addEventListener("abort", cancel, { once: true });
        void refresh();
      });
    },
    [refresh],
  );
  useEffect(
    () => () => {
      serial.current++;
      reads.flight = null;
      for (const pending of pendingCommits.current) pending.finish();
    },
    [reads],
  );
  useEffect(() => {
    void refresh();
  }, [refresh, version, tabs, directoryRevision]);
  const scopes = useMemo(() => {
    const byKey = new Map<string, { workspacePath: string; workspaceIdentity?: string }>();
    for (const task of tree.tasks) byKey.set(task.workspaceIdentity || task.workspacePath, task);
    for (const project of tree.projects)
      for (const root of project.roots) byKey.set(root.rootPath, { workspacePath: root.rootPath });
    for (const tab of tabs)
      if (isWorkspaceTab(tab) && !tab.workspaceIdentity && !tab.remoteSessionId)
        byKey.set(tab.workspacePath, { workspacePath: tab.workspacePath });
    return [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { workspacePath, workspaceIdentity }]) => ({
        workspacePath,
        ...(workspaceIdentity ? { workspaceIdentity } : {}),
      }));
  }, [tree, tabs]);
  const scopeKey = JSON.stringify(scopes);
  useProjectUnreadSignals(scopes, refresh);
  const observeSources = useCallback(async () => {
    if (!registry || !scopes.length) return;
    // 原来活动 revision 反复注册观察并重读目录；观察只随 scope 换代。
    // 返回行不进入项目树，显式刷新仍能重试失败的注册。
    await registry
      .list(
        "project-sidebar-activity",
        {
          controllerRevision: sourceRevision,
          taskListVersionSignature: scopeKey,
        },
        {
          kind: "timeline",
          workspaceScopes: JSON.parse(scopeKey),
          sortBy: "updated",
          limit: 0,
        },
      )
      .catch((cause) => logger.warn("[project-sidebar] Controller 活动订阅失败", cause));
  }, [registry, scopeKey, sourceRevision]);
  useEffect(() => {
    void observeSources();
  }, [observeSources]);
  const refreshDirectory = useCallback(async () => {
    await Promise.all([refresh(), observeSources()]);
  }, [refresh, observeSources]);
  useEffect(() => {
    // Finder/终端移走或恢复目录不会产生项目写事件；回到窗口时重新检查并恢复观察。
    const onFocus = () => void refreshDirectory();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshDirectory]);
  useEffect(() => {
    const subscriptions = (registry ? [] : scopes).map((scope) =>
      services.zcodeTaskService.onDynamicWorkspaceEvent(scope)((event) => {
        if (event.type === "workspace_task_list_changed") void refresh();
      }),
    );
    const broadcast = projectChanges
      ? projectChanges.onDidChange(() => void refresh())
      : services.broadcastService.onMessage((event) => {
          if (event.channel === "state:projects") void refresh();
        });
    return () => {
      subscriptions.forEach((subscription) => subscription.dispose());
      broadcast.dispose();
    };
  }, [scopeKey, services, projectChanges, refresh, registry]);
  const activity = useWorkspaceSessionsIndexItems(registry ? [] : scopes);
  const lastDisplay = useRef<ProjectTree>(EMPTY);
  const displayedTree = useMemo(() => {
    const activities = registry
      ? registry.readActivities()
      : activity.items.flatMap((task) => {
          const live = getTaskListRowActivity(task);
          return live
            ? [
                {
                  address: {
                    taskId: task.taskId,
                    workspacePath: task.workspacePath,
                    workspaceIdentity: task.workspaceIdentity,
                  },
                  activity: live,
                },
              ]
            : [];
        });
    const next = applyProjectTaskActivities(tree, activities);
    lastDisplay.current = stabilizeProjectTree(lastDisplay.current, next);
    return lastDisplay.current;
  }, [tree, activity.items, registry, revision]);
  return useMemo(
    () => ({
      tree: displayedTree,
      factTree: tree,
      service,
      refresh: refreshDirectory,
      commitCreatedTask,
      error,
      loading,
    }),
    [displayedTree, tree, service, refreshDirectory, commitCreatedTask, error, loading],
  );
}
