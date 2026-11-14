// 模拟项目领域：任务分组、受管 worktree、窗口控制器 topic、Source Server 快照。
// 窗口控制器 topic 的水位（logEpoch/seq）与任务投影都取自 MockRuntime 权威状态。
import { Emitter } from "@zcode/rpc";
import type { WindowHostControllerFrame } from "@zcode/services";
import { createUuid } from "@zcode/shared";
import {
  windowHostControllerTaskFrameSchema,
  windowHostControllerWorkspaceFrameSchema,
  type WindowHostControllerTaskDelta,
  type WindowHostControllerTaskRow,
  type WindowHostTaskAddress,
} from "@zcode/shared/zcode-protocol-v4";
import {
  IManagedWorktreeService,
  ISourceServerManagementService,
  ISourceServerWorkspaceService,
  ITaskGroupService,
  IWindowControllerService,
  IWindowProjectChangesService,
} from "@zcode/services";
import { isListedSession, type MockRuntime, type MockTaskRecord } from "../runtime.js";
import { toTaskMeta } from "../zcodeTask.js";
import type { MockServiceRegistrar } from "./contract.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type R<M> = M extends (...args: never) => unknown ? M : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 复杂 result 的空实现统一经 unknown 收敛；字段缺失由 UI 空集合兜底。 */
function asResult<T>(value: unknown): T {
  return value as T;
}

// ── 项目（虚拟项目目录：一个「演示项目」） ──

export class MockTaskGroupService implements ITaskGroupService {
  async read(): Promise<AR<ITaskGroupService["read"]>> {
    return asResult({ groups: [], members: [], order: [] });
  }

  async save(input: P<ITaskGroupService["save"]>): Promise<AR<ITaskGroupService["save"]>> {
    const now = Date.now();
    return asResult({
      id: input.id ?? `group_${createUuid()}`,
      title: input.title ?? "新分组",
      color: input.color ?? "blue",
      createdAt: now,
      updatedAt: now,
    });
  }

  async ungroup(_id: string): Promise<void> {}

  async move(_input: P<ITaskGroupService["move"]>): Promise<void> {}

  async admit(_input: P<ITaskGroupService["admit"]>): Promise<void> {}
}

export class MockManagedWorktreeService implements IManagedWorktreeService {
  async startNewTask(
    _input: P<IManagedWorktreeService["startNewTask"]>,
  ): Promise<AR<IManagedWorktreeService["startNewTask"]>> {
    throw new Error("mock: 受管 worktree 未启用");
  }

  async forkToWorktree(
    _input: P<IManagedWorktreeService["forkToWorktree"]>,
  ): Promise<AR<IManagedWorktreeService["forkToWorktree"]>> {
    throw new Error("mock: 受管 worktree 未启用");
  }

  async retryCreation(_params: { creationId: string }): Promise<void> {}

  async continueWithoutWorktree(_params: { creationId: string }): Promise<void> {}

  async dismissCreation(_params: { creationId: string }): Promise<void> {}

  get onDidChangeCreations(): R<IManagedWorktreeService["onDidChangeCreations"]> {
    return new Emitter<never>().event as R<IManagedWorktreeService["onDidChangeCreations"]>;
  }

  get onDidSettleCreation(): R<IManagedWorktreeService["onDidSettleCreation"]> {
    return new Emitter<never>().event as R<IManagedWorktreeService["onDidSettleCreation"]>;
  }

  async listCreations(): Promise<AR<IManagedWorktreeService["listCreations"]>> {
    return [];
  }

  async listWorktrees(_params: {
    projectId: string;
  }): Promise<AR<IManagedWorktreeService["listWorktrees"]>> {
    return asResult({ groups: [] });
  }

  async removeWorktree(
    _params: P<IManagedWorktreeService["removeWorktree"]>,
  ): Promise<AR<IManagedWorktreeService["removeWorktree"]>> {
    throw new Error("mock: 受管 worktree 未启用");
  }

  async pruneWorktrees(_params: P<IManagedWorktreeService["pruneWorktrees"]>): Promise<void> {}

  async listStartRefs(_params: {
    projectId: string;
  }): Promise<AR<IManagedWorktreeService["listStartRefs"]>> {
    return null;
  }

  async isWorktreeAvailable(_params: { worktreeRoot: string }): Promise<boolean> {
    return false;
  }

  supportsWorktreeCwd(
    _params: P<IManagedWorktreeService["supportsWorktreeCwd"]>,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export class MockWindowProjectChangesService implements IWindowProjectChangesService {
  private readonly changeEmitter = new Emitter<never>();

  async getCapabilities(): Promise<AR<IWindowProjectChangesService["getCapabilities"]>> {
    return { version: 1 as const };
  }

  get onDidChange(): R<IWindowProjectChangesService["onDidChange"]> {
    return this.changeEmitter.event as unknown as R<IWindowProjectChangesService["onDidChange"]>;
  }
}

const CONTROLLER_WORKSPACES_TOPIC = "controller/workspaces" as const;
const CONTROLLER_TASKS_INDEX_TOPIC = "controller/tasks-index" as const;
type ControllerTopic = typeof CONTROLLER_WORKSPACES_TOPIC | typeof CONTROLLER_TASKS_INDEX_TOPIC;

/** tasks-index 行：meta 与 task 服务同源，liveStatus/activity 取自会话权威状态。 */
function controllerTaskRow(
  runtime: MockRuntime,
  record: MockTaskRecord,
): WindowHostControllerTaskRow {
  const session = runtime.sessions.get(record.sessionId);
  const phase = session?.phase;
  const liveStatus: WindowHostControllerTaskRow["liveStatus"] =
    phase === "running"
      ? "running"
      : session && session.pendingInteractions.length > 0
        ? "waiting"
        : phase === "completedSuccess"
          ? "completed"
          : phase === "completedInterrupted"
            ? "error"
            : "idle";
  return {
    address: {
      workspacePath: record.workspacePath,
      ...(record.workspaceIdentity ? { workspaceIdentity: record.workspaceIdentity } : {}),
      taskId: record.sessionId,
    },
    meta: toTaskMeta(record),
    membership: { pinned: record.pinned, archived: record.archived, active: !record.archived },
    sourceAvailability: "online",
    liveStatus,
    ...(session
      ? {
          activity: {
            phase: session.phase,
            lastActivityAt: record.lastActivityAt,
            hasBackgroundWork: false,
          },
        }
      : {}),
  };
}

function matchesControllerMembership(
  membership: WindowHostControllerTaskRow["membership"],
  kind: P<IWindowControllerService["listTaskList"]>["kind"],
): boolean {
  switch (kind) {
    case "pinned":
      return membership.pinned && !membership.archived;
    case "archived":
      return membership.archived;
    case "timeline":
      return !membership.pinned && !membership.archived;
    case "active":
      return !membership.archived;
    case "all":
      return true;
    default:
      return true;
  }
}

export class MockWindowControllerService implements IWindowControllerService {
  private readonly frameEmitter = new Emitter<WindowHostControllerFrame>();
  private readonly unreadSignalEmitter = new Emitter<never>();
  private readonly tasksRemovedEmitter = new Emitter<never>();
  private readonly subscriptions = new Map<string, ControllerTopic>();
  /** 已下发的 tasks-index 行；delta 只针对真实变化，避免整表重发。 */
  private lastTaskRows = new Map<string, WindowHostControllerTaskRow>();

  constructor(private readonly runtime: MockRuntime) {
    this.lastTaskRows = this.snapshotTaskRows();
    this.runtime.onWorkspaceTaskListChanged.event(() => this.publishTaskChanges());
  }

  private snapshotTaskRows(): Map<string, WindowHostControllerTaskRow> {
    const rows = new Map<string, WindowHostControllerTaskRow>();
    for (const record of this.runtime.tasks.values()) {
      // controller 只投影本进程的 workspace 事实（workspaces 快照也只列这一个）。
      if (record.workspacePath !== this.runtime.workspacePath) continue;
      const session = this.runtime.sessions.get(record.sessionId);
      // draft 会话是纯内存态，不属于任务索引（与 sessions-index 的列表口径一致）。
      if (session && !isListedSession(session)) continue;
      rows.set(record.sessionId, controllerTaskRow(this.runtime, record));
    }
    return rows;
  }

  private emitWorkspaceSnapshot(subscriptionId: string): void {
    const position = this.runtime.topics.position(CONTROLLER_WORKSPACES_TOPIC);
    const frame = windowHostControllerWorkspaceFrameSchema.parse({
      topic: CONTROLLER_WORKSPACES_TOPIC,
      subscriptionId,
      logEpoch: position.logEpoch,
      fromSeq: 0,
      toSeq: position.seq,
      sentAt: Date.now(),
      payload: {
        kind: "snapshot",
        snapshot: {
          protocolVersion: 1,
          logEpoch: position.logEpoch,
          workspaces: [
            {
              workspacePath: this.runtime.workspacePath,
              sourceAvailability: "online",
              connectionState: "online",
            },
          ],
        },
      },
    });
    this.frameEmitter.fire(frame);
  }

  private emitTaskSnapshot(subscriptionId: string): void {
    const position = this.runtime.topics.position(CONTROLLER_TASKS_INDEX_TOPIC);
    this.lastTaskRows = this.snapshotTaskRows();
    const frame = windowHostControllerTaskFrameSchema.parse({
      topic: CONTROLLER_TASKS_INDEX_TOPIC,
      subscriptionId,
      logEpoch: position.logEpoch,
      fromSeq: 0,
      toSeq: position.seq,
      sentAt: Date.now(),
      payload: {
        kind: "snapshot",
        snapshot: {
          protocolVersion: 1,
          logEpoch: position.logEpoch,
          tasks: [...this.lastTaskRows.values()],
        },
      },
    });
    this.frameEmitter.fire(frame);
  }

  /** 任务索引变化 → 一条 delta 帧；没有变化或没有订阅者时不推进 topic 水位。 */
  private publishTaskChanges(): void {
    const next = this.snapshotTaskRows();
    const deltas: WindowHostControllerTaskDelta[] = [];
    for (const [taskId, row] of next) {
      if (JSON.stringify(this.lastTaskRows.get(taskId)) !== JSON.stringify(row)) {
        deltas.push({ op: "task.upserted", task: row });
      }
    }
    for (const [taskId, row] of this.lastTaskRows) {
      if (!next.has(taskId)) deltas.push({ op: "task.removed", address: row.address });
    }
    this.lastTaskRows = next;
    if (deltas.length === 0) return;
    const subscriptionIds = [...this.subscriptions]
      .filter(([, topic]) => topic === CONTROLLER_TASKS_INDEX_TOPIC)
      .map(([subscriptionId]) => subscriptionId);
    if (subscriptionIds.length === 0) return;
    const position = this.runtime.topics.advance(CONTROLLER_TASKS_INDEX_TOPIC);
    for (const subscriptionId of subscriptionIds) {
      const frame = windowHostControllerTaskFrameSchema.parse({
        topic: CONTROLLER_TASKS_INDEX_TOPIC,
        subscriptionId,
        logEpoch: position.logEpoch,
        fromSeq: position.fromSeq,
        toSeq: position.toSeq,
        sentAt: Date.now(),
        payload: { kind: "deltas", deltas },
      });
      this.frameEmitter.fire(frame);
    }
  }

  private taskRecord(address: WindowHostTaskAddress): MockTaskRecord | undefined {
    const record = this.runtime.tasks.get(address.taskId);
    if (!record || record.workspacePath !== address.workspacePath) return undefined;
    if ((record.workspaceIdentity ?? undefined) !== (address.workspaceIdentity ?? undefined)) {
      return undefined;
    }
    return record;
  }

  async previewArchivedTaskDeletion(
    _params: P<IWindowControllerService["previewArchivedTaskDeletion"]>,
  ): Promise<AR<IWindowControllerService["previewArchivedTaskDeletion"]>> {
    throw new Error("mock: controller 归档删除不可用");
  }

  async permanentlyDeleteArchivedTask(
    _params: P<IWindowControllerService["permanentlyDeleteArchivedTask"]>,
  ): Promise<AR<IWindowControllerService["permanentlyDeleteArchivedTask"]>> {
    throw new Error("mock: controller 归档删除不可用");
  }

  async deleteArchivedTask(
    _params: P<IWindowControllerService["deleteArchivedTask"]>,
  ): Promise<boolean> {
    throw new Error("mock: controller 归档删除不可用");
  }

  async deleteArchivedTasks(
    _params: P<IWindowControllerService["deleteArchivedTasks"]>,
  ): Promise<AR<IWindowControllerService["deleteArchivedTasks"]>> {
    throw new Error("mock: controller 归档删除不可用");
  }

  async listTaskList(
    params: P<IWindowControllerService["listTaskList"]>,
  ): Promise<AR<IWindowControllerService["listTaskList"]>> {
    const scopes = params.workspaceScopes;
    const search = params.search?.trim().toLowerCase();
    const rows = [...this.snapshotTaskRows().values()].filter((row) => {
      if (scopes !== "host") {
        const matched = scopes.some(
          (scope) =>
            scope.workspacePath === row.address.workspacePath &&
            (scope.workspaceIdentity?.trim() || undefined) === row.address.workspaceIdentity,
        );
        if (!matched) return false;
      }
      if (params.taskIds && !params.taskIds.includes(row.address.taskId)) return false;
      if (!matchesControllerMembership(row.membership, params.kind)) return false;
      if (search && !row.meta.title.toLowerCase().includes(search)) return false;
      return true;
    });
    rows.sort((left, right) =>
      params.sortBy === "created"
        ? right.meta.createdAt - left.meta.createdAt
        : right.meta.updatedAt - left.meta.updatedAt,
    );
    const limit = params.limit ?? rows.length;
    const page = rows.slice(0, limit);
    const items = page.map((row) => ({
      ...row.meta,
      sourceAvailability: row.sourceAvailability,
      liveStatus: row.liveStatus,
      ...(row.activity ? { activity: row.activity } : {}),
    }));
    return asResult({ items, total: rows.length, hasMore: rows.length > page.length });
  }

  async getTaskMeta(
    params: P<IWindowControllerService["getTaskMeta"]>,
  ): Promise<AR<IWindowControllerService["getTaskMeta"]>> {
    const record = this.taskRecord(params.address);
    return record ? toTaskMeta(record) : null;
  }

  async mutateTask(
    params: P<IWindowControllerService["mutateTask"]>,
  ): Promise<AR<IWindowControllerService["mutateTask"]>> {
    const record = this.taskRecord(params.address);
    if (!record) return null;
    const { mutation } = params;
    switch (mutation.kind) {
      case "rename":
        record.title = mutation.title;
        record.titleSource = "custom";
        record.lastActivityAt = Date.now();
        break;
      case "pin":
        record.pinned = mutation.pinned;
        break;
      case "archive":
        record.archived = mutation.archived;
        break;
      case "mark-read":
        record.unread = false;
        break;
      case "mark-unread":
        record.unread = true;
        break;
      case "delete":
      case "delete-archived":
        // 删除由会话生命周期所有者处理；controller 不再跨域移除正在执行的会话。
        throw new Error("mock: controller 任务删除不可用");
      case "open":
      case "resume":
        return toTaskMeta(record);
    }
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: record.workspacePath,
      type: "workspace_task_list_changed",
    });
    return toTaskMeta(record);
  }

  async subscribeControllerV4(
    params: P<IWindowControllerService["subscribeControllerV4"]>,
  ): Promise<AR<IWindowControllerService["subscribeControllerV4"]>> {
    const subscriptionId = `ctrl_${createUuid()}`;
    this.subscriptions.set(subscriptionId, params.topic);
    if (params.topic === CONTROLLER_WORKSPACES_TOPIC) this.emitWorkspaceSnapshot(subscriptionId);
    else this.emitTaskSnapshot(subscriptionId);
    const position = this.runtime.topics.position(params.topic);
    return asResult({
      ack: { subscriptionId, mode: "snapshot", logEpoch: position.logEpoch },
    });
  }

  async resyncControllerV4(
    params: P<IWindowControllerService["resyncControllerV4"]>,
  ): Promise<AR<IWindowControllerService["resyncControllerV4"]>> {
    const topic = this.subscriptions.get(params.subscriptionId);
    if (!topic) throw new Error("fault.subscription.unknownSubscription");
    if (topic === CONTROLLER_WORKSPACES_TOPIC) this.emitWorkspaceSnapshot(params.subscriptionId);
    else this.emitTaskSnapshot(params.subscriptionId);
    const position = this.runtime.topics.position(topic);
    return asResult({
      ack: { subscriptionId: params.subscriptionId, mode: "snapshot", logEpoch: position.logEpoch },
    });
  }

  async unsubscribeControllerV4(
    params: P<IWindowControllerService["unsubscribeControllerV4"]>,
  ): Promise<void> {
    this.subscriptions.delete(params.subscriptionId);
  }

  onDynamicControllerFrame(): ReturnType<IWindowControllerService["onDynamicControllerFrame"]> {
    return this.frameEmitter.event as unknown as ReturnType<
      IWindowControllerService["onDynamicControllerFrame"]
    >;
  }

  onDynamicTaskUnreadSignal(): ReturnType<IWindowControllerService["onDynamicTaskUnreadSignal"]> {
    return this.unreadSignalEmitter.event as unknown as ReturnType<
      IWindowControllerService["onDynamicTaskUnreadSignal"]
    >;
  }

  onDynamicTasksRemovedSignal(): ReturnType<
    IWindowControllerService["onDynamicTasksRemovedSignal"]
  > {
    return this.tasksRemovedEmitter.event as unknown as ReturnType<
      IWindowControllerService["onDynamicTasksRemovedSignal"]
    >;
  }
}

// ── Source Server（模拟后端无远端概念；返回本地单 profile 快照） ──

export class MockSourceServerWorkspaceService implements ISourceServerWorkspaceService {
  async resolveWorkspace(
    params: P<ISourceServerWorkspaceService["resolveWorkspace"]>,
  ): Promise<AR<ISourceServerWorkspaceService["resolveWorkspace"]>> {
    const workspacePath = (params as { workspacePath?: string }).workspacePath ?? "";
    return asResult({ workspacePath, sourceServerId: "local-mock" });
  }

  async getFailedPathCount(): Promise<number> {
    return 0;
  }

  async getAbandonedPathCount(): Promise<number> {
    return 0;
  }

  async listMigrationReports(): Promise<AR<ISourceServerWorkspaceService["listMigrationReports"]>> {
    return asResult({ reports: [] });
  }

  async abandonFailedWorkspace(
    _request: P<ISourceServerWorkspaceService["abandonFailedWorkspace"]>,
  ): Promise<AR<ISourceServerWorkspaceService["abandonFailedWorkspace"]>> {
    return asResult({ reports: [] });
  }

  async retryWorkspaceMigration(
    _request: P<ISourceServerWorkspaceService["retryWorkspaceMigration"]>,
  ): Promise<AR<ISourceServerWorkspaceService["retryWorkspaceMigration"]>> {
    return asResult({ reports: [] });
  }
}

export class MockSourceServerManagementService implements ISourceServerManagementService {
  private readonly stateDeltaEmitter = new Emitter<never>();
  private readonly directoryDeltaEmitter = new Emitter<never>();
  private readonly operationLogEmitter = new Emitter<never>();

  readonly onDidChangeState: R<ISourceServerManagementService["onDidChangeState"]> = this
    .stateDeltaEmitter.event as unknown as R<ISourceServerManagementService["onDidChangeState"]>;
  readonly onDidChangeDirectory: R<ISourceServerManagementService["onDidChangeDirectory"]> = this
    .directoryDeltaEmitter.event as unknown as R<
    ISourceServerManagementService["onDidChangeDirectory"]
  >;
  readonly onDidAppendOperationLog: R<
    NonNullable<ISourceServerManagementService["onDidAppendOperationLog"]>
  > = this.operationLogEmitter.event as unknown as R<
    NonNullable<ISourceServerManagementService["onDidAppendOperationLog"]>
  >;

  async getSnapshot(
    _params?: P<ISourceServerManagementService["getSnapshot"]>,
  ): Promise<AR<ISourceServerManagementService["getSnapshot"]>> {
    return asResult({ profiles: [], sources: [], preferredProfileId: null });
  }

  async getRecentOperationLogs(
    _profileId: string,
  ): Promise<AR<ISourceServerManagementService["getRecentOperationLogs"]>> {
    return [];
  }

  async connectProfile(
    _params: P<ISourceServerManagementService["connectProfile"]>,
  ): Promise<AR<ISourceServerManagementService["connectProfile"]>> {
    throw new Error("mock: Source Server 连接未启用");
  }

  async confirmIdentityChange(
    _profileId: string,
  ): Promise<AR<ISourceServerManagementService["confirmIdentityChange"]>> {
    return this.getSnapshot();
  }

  async disconnectSource(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["disconnectSource"]>> {
    return this.getSnapshot();
  }

  async ensureConversationWorkspace(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["ensureConversationWorkspace"]>> {
    return asResult({ workspacePath: "", created: false });
  }

  async updateSource(
    _input: P<ISourceServerManagementService["updateSource"]>,
  ): Promise<AR<ISourceServerManagementService["updateSource"]>> {
    throw new Error("mock: Source Server 更新未启用");
  }

  async cancelSourceUpdate(
    _profileId: string,
  ): Promise<AR<ISourceServerManagementService["cancelSourceUpdate"]>> {
    return asResult({ canceled: false });
  }

  async stopSource(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["stopSource"]>> {
    return this.getSnapshot();
  }

  async restartSource(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["restartSource"]>> {
    return this.getSnapshot();
  }

  async getSourceRunningTasks(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["getSourceRunningTasks"]>> {
    return asResult({ tasks: [] });
  }

  async renameSource(
    _sourceServerId: string,
    _displayName: string,
  ): Promise<AR<ISourceServerManagementService["renameSource"]>> {
    return this.getSnapshot();
  }

  async renameProfile(
    _profileId: string,
    _displayName: string,
  ): Promise<AR<ISourceServerManagementService["renameProfile"]>> {
    return this.getSnapshot();
  }

  async updateProfile(
    _input: P<ISourceServerManagementService["updateProfile"]>,
  ): Promise<AR<ISourceServerManagementService["updateProfile"]>> {
    return this.getSnapshot();
  }

  async setPreferredProfile(
    _params: P<ISourceServerManagementService["setPreferredProfile"]>,
  ): Promise<AR<ISourceServerManagementService["setPreferredProfile"]>> {
    return this.getSnapshot();
  }

  async removeProfile(
    _profileId: string,
  ): Promise<AR<ISourceServerManagementService["removeProfile"]>> {
    return this.getSnapshot();
  }

  async removeSourceServer(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["removeSourceServer"]>> {
    return this.getSnapshot();
  }

  async getMigrationReport(
    _sourceServerId: string,
  ): Promise<AR<ISourceServerManagementService["getMigrationReport"]>> {
    return asResult({ reports: [] });
  }

  async exportMigrationReport(_sourceServerId: string): Promise<string> {
    return "{}";
  }

  async abandonWorkspaceMigration(
    _params: P<ISourceServerManagementService["abandonWorkspaceMigration"]>,
  ): Promise<AR<ISourceServerManagementService["abandonWorkspaceMigration"]>> {
    return asResult({ reports: [] });
  }

  async retryWorkspaceMigration(
    _params: P<ISourceServerManagementService["retryWorkspaceMigration"]>,
  ): Promise<AR<ISourceServerManagementService["retryWorkspaceMigration"]>> {
    return asResult({ reports: [] });
  }
}

export function registerProjectsMockServices(
  services: MockServiceRegistrar,
  runtime: MockRuntime,
): void {
  services.register(ITaskGroupService, new MockTaskGroupService());
  services.register(IManagedWorktreeService, new MockManagedWorktreeService());
  services.register(IWindowProjectChangesService, new MockWindowProjectChangesService());
  services.register(IWindowControllerService, new MockWindowControllerService(runtime));
  services.register(ISourceServerWorkspaceService, new MockSourceServerWorkspaceService());
  services.register(ISourceServerManagementService, new MockSourceServerManagementService());
}
