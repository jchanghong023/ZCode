import type { ProjectTree, VirtualProject } from "@/project-sidebar/contract.js";
import { projectKey } from "@/project-sidebar/view.js";

const DAY = 86_400_000;
/** 空项目创建后的宽限期：刚建的项目还没来得及开会话，不算不再使用。 */
const EMPTY_GRACE_DAYS = 7;
const IDLE_DAYS = 90;

export type ProjectUnusedReason = "missing" | "empty" | "idle";
export type ProjectManagementFilter = "all" | "unused";
export type ProjectManagementSort = "lastActive" | "name" | "sessions";
/** delete = 软删除；null = 本页不能移除（legacy 单 root）。 */
export type ProjectRemoval = "delete" | null;

export interface ProjectManagementRow {
  key: string;
  project: VirtualProject;
  sessions: number;
  lastActiveAt: number | null;
  reason?: ProjectUnusedReason;
  idleMonths?: number;
  removal: ProjectRemoval;
}

/** 只从共享项目树派生，不读取额外目录，也不保存副本。 */
export function buildProjectManagementRows(input: {
  tree: ProjectTree;
  now: number;
}): ProjectManagementRow[] {
  const stats = new Map<string, { sessions: number; lastActiveAt: number | null }>();
  for (const task of input.tree.tasks) {
    if (!task.projectId) continue;
    const key = projectKey({ id: task.projectId, hostId: task.hostId });
    const current = stats.get(key) ?? { sessions: 0, lastActiveAt: null };
    current.sessions++;
    current.lastActiveAt = Math.max(current.lastActiveAt ?? 0, task.updatedAt);
    stats.set(key, current);
  }
  return input.tree.projects
    .filter((project) => !project.deleted)
    .map((project) => {
      const key = projectKey(project);
      const fact = stats.get(key) ?? { sessions: 0, lastActiveAt: null };
      const removal: ProjectRemoval = project.legacySingleRoot ? null : "delete";
      return {
        key,
        project,
        sessions: fact.sessions,
        lastActiveAt: fact.lastActiveAt,
        removal,
        // 建议只针对本页能移除的行；置顶表示用户明确要保留。
        ...(removal && !project.pinned ? unusedReason(project, fact, input.now) : {}),
      };
    });
}

function unusedReason(
  project: VirtualProject,
  fact: { sessions: number; lastActiveAt: number | null },
  now: number,
): Pick<ProjectManagementRow, "reason" | "idleMonths"> {
  if (project.primaryRootStatus === "missing") return { reason: "missing" };
  if (!fact.sessions)
    return project.createdAt > 0 && now - project.createdAt > EMPTY_GRACE_DAYS * DAY
      ? { reason: "empty" }
      : {};
  const idleDays = (now - (fact.lastActiveAt ?? now)) / DAY;
  return idleDays > IDLE_DAYS ? { reason: "idle", idleMonths: Math.floor(idleDays / 30) } : {};
}

export function selectProjectManagementRows(
  rows: readonly ProjectManagementRow[],
  options: { query: string; filter: ProjectManagementFilter; sort: ProjectManagementSort },
): ProjectManagementRow[] {
  const query = options.query.trim().toLowerCase();
  const byName = (left: ProjectManagementRow, right: ProjectManagementRow) =>
    left.project.name.localeCompare(right.project.name) || left.key.localeCompare(right.key);
  return rows
    .filter((row) => options.filter === "all" || row.reason)
    .filter(
      (row) =>
        !query ||
        [row.project.name, ...row.project.roots.map((r) => r.rootPath)].some((text) =>
          text.toLowerCase().includes(query),
        ),
    )
    .sort((left, right) => {
      if (options.sort === "sessions") return right.sessions - left.sessions || byName(left, right);
      if (options.sort === "lastActive")
        return (right.lastActiveAt ?? -1) - (left.lastActiveAt ?? -1) || byName(left, right);
      return byName(left, right);
    });
}

export function summarizeUnusedProjects(rows: readonly ProjectManagementRow[]) {
  const count = (reason: ProjectUnusedReason) => rows.filter((row) => row.reason === reason).length;
  const summary = { missing: count("missing"), empty: count("empty"), idle: count("idle") };
  return { total: summary.missing + summary.empty + summary.idle, ...summary };
}

/** 确认对话框里的后果汇总；本地项目独占全部行。 */
export function summarizeProjectRemoval(rows: readonly ProjectManagementRow[]) {
  return { sessions: rows.reduce((sum, row) => sum + row.sessions, 0) };
}

/** 可恢复的只有软删除项目；legacy 单 root 不支持恢复入口。 */
export function selectRemovedProjects(tree: ProjectTree): VirtualProject[] {
  return tree.projects
    .filter((project) => project.deleted && !project.legacySingleRoot)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
}

/** 简易 intl 不支持复数；数量为 1 时改用 `<id>One` 文案，其余共用 `{count}` 文案。 */
export function formatCountMessage(
  intl: {
    formatMessage(descriptor: { id: string }, values?: Record<string, string | number>): string;
  },
  id: string,
  count: number,
  values: Record<string, string | number> = {},
): string {
  return intl.formatMessage({ id: count === 1 ? `${id}One` : id }, { count, ...values });
}
