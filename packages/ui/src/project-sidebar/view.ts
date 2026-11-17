import type {
  ProjectTask,
  ProjectTree,
  VirtualProject,
  WindowHostTaskAddress,
  WindowHostControllerTaskActivity,
} from "@/project-sidebar/contract.js";
import { attachTaskListRowActivity } from "@/v4/taskListRowActivity.js";
import { compareTaskListItemsByTime, compareZCodeTaskListItems } from "@/lib/taskListOrdering.js";
import { buildTaskEntityKey } from "@/lib/taskQueryCache.js";
import {
  areStabilizedValuesEquivalent,
  stabilizeTaskListItems,
} from "@/v4/taskListItemStabilization.js";

/** 活动态只覆盖已有行的 UI sidecar；Controller 快照不能替代项目树的行集合和事实。 */
export function applyProjectTaskActivities(
  tree: ProjectTree,
  activities: readonly {
    address: WindowHostTaskAddress;
    activity: WindowHostControllerTaskActivity;
  }[],
): ProjectTree {
  const byKey = new Map(
    activities.map(({ address, activity }) => [buildTaskEntityKey(address), activity]),
  );
  return {
    ...tree,
    tasks: tree.tasks.map((task) => {
      const activity = byKey.get(buildTaskEntityKey(task));
      return activity ? attachTaskListRowActivity(task, activity) : task;
    }),
  };
}

/** 复用等价对象以保留行 memo；组织变化和 activity 都参加比较，不把旧项目归属粘在行上。 */
export function stabilizeProjectTree(previous: ProjectTree, next: ProjectTree): ProjectTree {
  const previousProjects = new Map(
    previous.projects.map((project) => [projectKey(project), project]),
  );
  let sameProjects = previous.projects.length === next.projects.length;
  const projects = next.projects.map((project, index) => {
    const old = previousProjects.get(projectKey(project));
    const stable = old && areStabilizedValuesEquivalent(old, project) ? old : project;
    if (previous.projects[index] !== stable) sameProjects = false;
    return stable;
  });
  const tasks = stabilizeTaskListItems(previous.tasks, next.tasks);
  return sameProjects &&
    tasks === previous.tasks &&
    areStabilizedValuesEquivalent(previous.deletedTasks, next.deletedTasks)
    ? previous
    : { ...next, projects: sameProjects ? previous.projects : projects, tasks };
}

export type ProjectRowSelection =
  | { kind: "project"; projectId: string | null; hostId?: string }
  | { kind: "timeline" }
  | { kind: "unread" }
  | { kind: "pinned" };

/** 选择器和行列表共用同一比较器，避免时间线在渲染时又被运行优先覆盖。 */
export function compareProjectTaskRows(
  left: ProjectTask,
  right: ProjectTask,
  kind: ProjectRowSelection["kind"],
): number {
  return (
    (kind === "timeline" || kind === "unread"
      ? compareTaskListItemsByTime(left, right, "updated")
      : compareZCodeTaskListItems(left, right, "updated")) ||
    JSON.stringify([right.hostId, buildTaskEntityKey(right)]).localeCompare(
      JSON.stringify([left.hostId, buildTaskEntityKey(left)]),
    )
  );
}
/** 只从 Host 已提交的行派生显示；相同 cwd 不代表相同项目。 */
export function selectProjectRows(
  tree: ProjectTree,
  selection: ProjectRowSelection,
): ProjectTask[] {
  if (selection.kind === "unread")
    return selectUnreadProjectRows(tree).sort((left, right) =>
      compareProjectTaskRows(left, right, selection.kind),
    );
  return tree.tasks
    .filter((task) => {
      if (selection.kind === "pinned") return task.pinned && !task.archived;
      if (selection.kind === "timeline") return !task.archived;
      return (
        task.projectId === selection.projectId &&
        (!selection.hostId || task.hostId === selection.hostId) &&
        !task.archived &&
        !task.pinned
      );
    })
    .sort((left, right) => compareProjectTaskRows(left, right, selection.kind));
}

export function projectHasUnread(
  tree: ProjectTree,
  project: Pick<VirtualProject, "id" | "hostId">,
): boolean {
  // 置顶只改变显示位置，不改变项目归属；不能只从截断/排除置顶的可见行汇总。
  return tree.tasks.some(
    (task) =>
      task.projectId === project.id &&
      task.hostId === project.hostId &&
      !task.archived &&
      Boolean(task.unreadAt),
  );
}

/**
 * 任务栏/Dock 角标的未读计数：与侧栏蓝点同源（项目树），过滤条件与 projectHasUnread 一致
 * （非归档 + 有 unreadAt），按 workspace+task 去重。不能改读 renderer 的
 * taskListCache/taskQueryCache：它们只装载活跃 workspace 的列表，背景工作区有蓝点时这两份
 * 缓存是空的，角标会丢数。
 *
 * 角标语义是「本次 app 运行新增的未读」：启动时已有的历史未读不点亮，基线用任务身份
 * （key）而不是时间比较——身份比较全程同源（同一棵树的两次读取），无时钟偏差。
 * spec 见 相邻实现。
 */

/** 启动基线：任务身份 → 首次成功读取时的 unreadAt。进程内存，不落盘、不回写。 */
export type UnreadAtBaseline = Map<string, number>;

/** 幂等合并：只为尚未建基线的任务快照，已建基线的任务不覆盖。 */
export function mergeUnreadBaseline(tree: ProjectTree, baseline: UnreadAtBaseline): void {
  for (const task of tree.tasks) {
    if (task.unreadAt == null) continue;
    const key = unreadTaskKey(task);
    // 同 key 保留首次值即可：基线只取「快照时刻的 marker」，重复行不改变语义。
    if (!baseline.has(key)) baseline.set(key, task.unreadAt);
  }
}

export function countUnreadTasksSinceBaseline(
  tree: ProjectTree,
  baseline: UnreadAtBaseline,
): number {
  let count = 0;
  for (const task of selectUnreadProjectRows(tree)) {
    if (task.unreadAt == null) continue;
    const baselineAt = baseline.get(unreadTaskKey(task));
    // key 不在基线 = 读取成功后新出现的未读；unreadAt 与基线不同 = 基线任务再次完成。
    if (baselineAt === undefined || baselineAt !== task.unreadAt) count += 1;
  }
  return count;
}

function unreadTaskKey(task: ProjectTask): string {
  return JSON.stringify([task.workspaceIdentity?.trim() || task.workspacePath, task.taskId]);
}

/** 筛选与角标共用同一集合，避免未读列表显示无法对应角标的历史孤儿任务。 */
function selectUnreadProjectRows(tree: ProjectTree): ProjectTask[] {
  // 只统计侧边栏实际渲染的项目（非软删）：孤儿任务（项目不存在）与已删项目的
  // 未读在界面上没有蓝点落点，计入只会产生「有角标没蓝点」的幽灵提醒。
  const renderedProjectIds = new Set(
    tree.projects.filter((project) => !project.deleted).map((project) => project.id),
  );
  const seen = new Set<string>();
  const rows: ProjectTask[] = [];
  for (const task of tree.tasks) {
    if (task.archived || !task.unreadAt) {
      continue;
    }

    // 可见性对齐渲染分区：置顶区跨项目渲染；无项目任务区只渲染 null-project 任务；
    // 其余任务必须归属渲染项目。
    const visible = task.pinned || task.projectId == null || renderedProjectIds.has(task.projectId);
    if (!visible) {
      continue;
    }

    const key = unreadTaskKey(task);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(task);
  }

  return rows;
}

export function projectKey(project: Pick<VirtualProject, "id" | "hostId">): string {
  return JSON.stringify([project.hostId, project.id]);
}

/** Host position 仅作为控制端首次初始化的种子；实际显示顺序由侧栏偏好覆盖。 */
export function selectSortedProjects(tree: Pick<ProjectTree, "projects">): VirtualProject[] {
  return tree.projects
    .filter((project) => !project.deleted)
    .sort((a, b) => a.position - b.position);
}

/** 内部错误码只用于判断；展示边界翻译已知状态，保留未知服务错误的诊断信息。 */
export function formatProjectError(
  cause: unknown,
  formatMessage: (descriptor: { id: string }) => string,
): string {
  const code = cause instanceof Error ? cause.message : String(cause);
  if (code === "project.connection-unavailable")
    return formatMessage({ id: "project.connectionUnavailable" });
  if (code === "project.data-session-running")
    return formatMessage({ id: "project.dataSessionRunning" });
  if (code === "project.data-session-referenced")
    return formatMessage({ id: "project.dataSessionReferenced" });
  if (code === "project.data-delete-failed")
    return formatMessage({ id: "project.dataDeleteFailed" });
  if (code === "project.data-unavailable") return formatMessage({ id: "project.dataUnavailable" });
  return String(cause);
}
