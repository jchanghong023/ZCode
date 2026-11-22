import { useEffect, useMemo, useState } from "react";
import type { WebProjectTree } from "@zcode/services";
import type { ZCodeProvider } from "@zcode/shared";
import { buildSessionMentionMarkdown } from "@/mentions/mentionMarkdown.js";
import { filterMentionItemsWithOptions } from "@/mentions/mentionSearch.js";
import type { MentionCategoryResult, MentionItem } from "@/mentions/mentionTypes.js";
import type { SessionMentionWorkspaceScope } from "@/mentions/mentionPanelRouting.js";
import { getWorkspaceKey } from "@/lib/workspaceKey.js";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";

type SessionMentionTask = Omit<WebProjectTree["tasks"][number], "projectId">;

interface SessionMentionItem extends MentionItem {
  /** 只在候选聚合阶段分桶，不写入 Lexical node 或 canonical mention。 */
  workspaceKey: string;
}

function compareSessionTasks(
  left: SessionMentionTask,
  right: SessionMentionTask,
  currentWorkspaceKey?: string,
) {
  if (currentWorkspaceKey) {
    const leftCurrent =
      getWorkspaceKey(left.workspacePath, left.workspaceIdentity) === currentWorkspaceKey;
    const rightCurrent =
      getWorkspaceKey(right.workspacePath, right.workspaceIdentity) === currentWorkspaceKey;
    if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
  }
  if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
  if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt;
  return left.title.localeCompare(right.title);
}

function getSessionLabel(task: SessionMentionTask): string {
  const title = task.title.replace(/^#(?:sess|session)_[a-zA-Z0-9._-]+\s*/, "").trim();
  return title || "Untitled session";
}

function getWorkspaceLabel(task: SessionMentionTask): string {
  const raw = task.workspacePath.trim() || task.workspaceIdentity?.trim() || "";
  return raw.split(/[\\/]/).filter(Boolean).at(-1) ?? raw;
}

function mapTaskToMentionItem(task: SessionMentionTask, provider: ZCodeProvider): SessionMentionItem {
  const sessionId = task.taskId;
  return {
    id: `session:${task.taskId}`,
    category: "sessions",
    label: getSessionLabel(task),
    description: getWorkspaceLabel(task),
    value: sessionId,
    markdown: buildSessionMentionMarkdown(sessionId, getSessionLabel(task)),
    keywords: [
      task.title,
      task.taskId,
      task.workspacePath,
      task.workspaceIdentity ?? "",
      provider,
    ],
    workspaceKey: getWorkspaceKey(task.workspacePath, task.workspaceIdentity),
  };
}

export function collectSessionMentionItems(
  tasks: SessionMentionTask[],
  provider: ZCodeProvider,
  options: {
    workspacePath?: string;
    workspaceIdentity?: string;
  } = {},
): SessionMentionItem[] {
  const currentWorkspaceKey = options.workspacePath
    ? getWorkspaceKey(options.workspacePath, options.workspaceIdentity)
    : undefined;
  const taskBySessionId = new Map<string, SessionMentionTask>();
  for (const task of tasks) {
    const sessionId = task.taskId;
    const current = taskBySessionId.get(sessionId);
    if (!current || task.updatedAt > current.updatedAt) {
      taskBySessionId.set(sessionId, task);
    }
  }

  return [...taskBySessionId.values()]
    .sort((left, right) => compareSessionTasks(left, right, currentWorkspaceKey))
    .map((task) => mapTaskToMentionItem(task, provider));
}

export function useSessionsMentionProvider(
  provider: ZCodeProvider,
  workspacePath: string,
  workspaceIdentity: string | undefined,
  query: string,
  enabled: boolean,
  workspaceScope: SessionMentionWorkspaceScope,
  emptyText: string,
  title: string,
  unclassifiedTitle = title,
): MentionCategoryResult {
  const { services } = useWorkspaceServicesResolution(workspacePath, undefined, workspaceIdentity);
  const [snapshot, setSnapshot] = useState<{
    services: typeof services;
    tree: WebProjectTree;
    error: Error | null;
    loading: boolean;
  } | null>(null);
  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      return;
    }
    let current = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      setSnapshot({ services, tree: { projects: [], tasks: [] }, error: null, loading: true });
      try {
        if (!services.projectService) throw new Error("project.service-unavailable");
        // 候选行由 Host 组织态与 CLI 镜像决定；不能让缺席的 sessions-index 或 tab 隐藏历史任务。
        const tree = await services.projectService.readTree();
        if (current && request === generation)
          setSnapshot({ services, tree, error: null, loading: false });
      } catch (error) {
        if (current && request === generation)
          setSnapshot({
            services,
            tree: { projects: [], tasks: [] },
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          });
      }
    };
    const listener = services.broadcastService.onMessage((event) => {
      if (event.channel === "state:projects") void refresh();
    });
    void refresh();
    return () => {
      current = false;
      listener.dispose();
    };
  }, [enabled, services]);
  const tree = snapshot?.services === services ? snapshot.tree : null;
  const groups = useMemo(() => {
    if (!tree) return [];
    const currentKey = getWorkspaceKey(workspacePath, workspaceIdentity);
    const visibleTasks = tree.tasks.filter(
      (task) =>
        workspaceScope !== "current-workspace" ||
        getWorkspaceKey(task.workspacePath, task.workspaceIdentity) === currentKey,
    );
    const buckets = new Map<string, { id: string; title: string; tasks: SessionMentionTask[] }>();
    for (const task of visibleTasks) {
      const id =
        workspaceScope === "current-workspace" ? "sessions" : JSON.stringify(task.projectId);
      const project = tree.projects.find((project) => project.id === task.projectId);
      const bucket = buckets.get(id) ?? {
        id,
        title:
          workspaceScope === "current-workspace" ? title : (project?.name ?? unclassifiedTitle),
        tasks: [],
      };
      bucket.tasks.push(task);
      buckets.set(id, bucket);
    }
    return [...buckets.values()].map((bucket) => ({
      id: bucket.id,
      title: bucket.title,
      items: filterMentionItemsWithOptions(
        collectSessionMentionItems(bucket.tasks, provider),
        query,
        {
          limit: workspaceScope === "current-workspace" ? Number.POSITIVE_INFINITY : 20,
          requireQuery: false,
        },
      ),
    }));
  }, [
    tree,
    workspacePath,
    workspaceIdentity,
    workspaceScope,
    title,
    unclassifiedTitle,
    provider,
    query,
  ]);
  return {
    items: enabled ? groups.flatMap((group) => group.items) : [],
    groups: enabled && workspaceScope !== "current-workspace" ? groups : undefined,
    loading: enabled && (!snapshot || snapshot.services !== services || snapshot.loading),
    error: snapshot?.services === services ? snapshot.error : null,
    emptyText,
    title,
  };
}
