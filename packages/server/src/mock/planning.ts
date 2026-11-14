// 模拟项目与规划类服务：项目目录、任务分组、受管 worktree、
// 窗口任务列表、Source Server、闲时任务、Bots、会话分享、附件暂存、Onboarding。
// 方法签名统一从对应服务接口派生（Parameters/ReturnType）。
import { Emitter } from "@zcode/rpc";
import type { WindowHostControllerFrame } from "@zcode/services";
import type { ProjectTask, VirtualProject } from "@zcode/services";
import { createUuid } from "@zcode/shared";
import type {
  IBotsService,
  IConversationShareService,
  IHighspeedCardService,
  IManagedWorktreeService,
  IOffPeakTaskService,
  IOnboardingRecordService,
  IPromptAttachmentTransferService,
  IProjectService,
  ISourceServerManagementService,
  ISourceServerWorkspaceService,
  ITaskGroupService,
  IWindowControllerService,
  IWindowProjectChangesService,
} from "@zcode/services";
import { isListedSession, type MockRuntime } from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type R<M> = M extends (...args: never) => unknown ? M : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 复杂 result 的空实现统一经 unknown 收敛；字段缺失由 UI 空集合兜底。 */
function asResult<T>(value: unknown): T {
  return value as T;
}

// ── 项目（虚拟项目目录：一个「演示项目」） ──

export class MockProjectService implements IProjectService {
  constructor(private readonly runtime: MockRuntime) {}

  private demoProject(): VirtualProject {
    return {
      id: "project_demo",
      hostId: "local",
      name: "ZCode Web Demo",
      nameOverridden: false,
      roots: [{ rootPath: this.runtime.workspacePath, position: 0, isPrimary: true }],
      position: 0,
      pinned: false,
      deleted: false,
      createdAt: this.runtime.startedAt,
      updatedAt: this.runtime.startedAt,
    };
  }

  async readDirectory(
    params?: P<IProjectService["readDirectory"]>,
  ): Promise<AR<IProjectService["readDirectory"]>> {
    const path = params?.path ?? this.runtime.workspacePath;
    return asResult({ path, entries: [] });
  }

  async readProjects(
    _params?: P<IProjectService["readProjects"]>,
  ): Promise<AR<IProjectService["readProjects"]>> {
    return [this.demoProject()];
  }

  async readTree(
    _params?: P<IProjectService["readTree"]>,
  ): Promise<AR<IProjectService["readTree"]>> {
    // 树投影：项目 + 任务；任务行镜像会话运行时的 task 记录。
    const tasks: ProjectTask[] = [...this.runtime.tasks.values()]
      .filter((record) => {
        const session = this.runtime.sessions.get(record.sessionId);
        return !session || isListedSession(session);
      })
      .map((record) => ({
        taskId: record.sessionId,
        traceId: `trace_${record.sessionId}`,
        title: record.title || "新任务",
        workspacePath: record.workspacePath,
        createdAt: record.createdAt,
        updatedAt: record.lastActivityAt,
        mode: "build" as const,
        provider: "glm" as const,
        projectId: null,
        hostId: "local",
        pinned: record.pinned,
        archived: record.archived,
      }));
    return { projects: [this.demoProject()], tasks };
  }

  async saveProject(
    input: P<IProjectService["saveProject"]>,
  ): Promise<AR<IProjectService["saveProject"]>> {
    void input;
    return this.demoProject();
  }

  async deleteProject(_id: string): Promise<void> {}

  async restoreProject(_id: string): Promise<AR<IProjectService["restoreProject"]>> {
    return this.demoProject();
  }

  async moveTask(_input: P<IProjectService["moveTask"]>): Promise<void> {}

  async reorderProjects(_ids: string[]): Promise<void> {}

  async prepareSession(
    _params?: P<IProjectService["prepareSession"]>,
  ): Promise<AR<IProjectService["prepareSession"]>> {
    return asResult({
      workspacePath: this.runtime.workspacePath,
      additionalDirectories: [],
      projectId: null,
    });
  }

  async measureProjectData(_ids: string[]): Promise<AR<IProjectService["measureProjectData"]>> {
    return asResult({ projects: [] });
  }

  async deleteProjectData(_id: string): Promise<AR<IProjectService["deleteProjectData"]>> {
    return asResult({ deletedBytes: 0 });
  }

  async resolveSessionDirectories(
    _task: P<IProjectService["resolveSessionDirectories"]>,
  ): Promise<AR<IProjectService["resolveSessionDirectories"]>> {
    return asResult({
      workspacePath: this.runtime.workspacePath,
      additionalDirectories: [],
      projectId: null,
    });
  }
}

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

export class MockWindowControllerService implements IWindowControllerService {
  private readonly topicsBySubscription = new Map<string, string>();

  constructor(private readonly runtime: MockRuntime) {}

  private readonly frameEmitter = new Emitter<WindowHostControllerFrame>();
  private readonly unreadSignalEmitter = new Emitter<never>();
  private readonly tasksRemovedEmitter = new Emitter<never>();
  private workspacesOrdinal = 0;
  private tasksOrdinal = 0;

  /** workspaces topic 快照帧（单 workspace：本进程虚拟工作区）。 */
  private emitWorkspacesSnapshot(subscriptionId: string): void {
    this.workspacesOrdinal += 1;
    const frame: WindowHostControllerFrame = {
      topic: "controller/workspaces",
      subscriptionId,
      logEpoch: "ctrl-epoch-1",
      fromSeq: 0,
      toSeq: this.workspacesOrdinal,
      sentAt: Date.now(),
      payload: {
        kind: "snapshot",
        snapshot: {
          protocolVersion: 1,
          logEpoch: "ctrl-epoch-1",
          workspaces: [
            {
              workspacePath: this.runtime.workspacePath,
              sourceAvailability: "online",
              connectionState: "online",
            },
          ],
        },
      },
    } as unknown as WindowHostControllerFrame;
    this.frameEmitter.fire(frame);
  }

  /** tasks-index topic 快照帧（任务行由会话事件驱动刷新；mock 初始为空）。 */
  private emitTasksSnapshot(subscriptionId: string): void {
    this.tasksOrdinal += 1;
    const frame: WindowHostControllerFrame = {
      topic: "controller/tasks-index",
      subscriptionId,
      logEpoch: "ctrl-epoch-1",
      fromSeq: 0,
      toSeq: this.tasksOrdinal,
      sentAt: Date.now(),
      payload: {
        kind: "snapshot",
        snapshot: {
          protocolVersion: 1,
          logEpoch: "ctrl-epoch-1",
          tasks: [],
        },
      },
    } as unknown as WindowHostControllerFrame;
    this.frameEmitter.fire(frame);
  }

  async previewArchivedTaskDeletion(
    _params: P<IWindowControllerService["previewArchivedTaskDeletion"]>,
  ): Promise<AR<IWindowControllerService["previewArchivedTaskDeletion"]>> {
    return asResult({ sessions: [], totalBytes: 0 });
  }

  async permanentlyDeleteArchivedTask(
    _params: P<IWindowControllerService["permanentlyDeleteArchivedTask"]>,
  ): Promise<AR<IWindowControllerService["permanentlyDeleteArchivedTask"]>> {
    return { deletedSessionIds: [], failedSessionIds: [] } as unknown as AR<
      IWindowControllerService["permanentlyDeleteArchivedTask"]
    >;
  }

  async deleteArchivedTask(_params: { address: unknown }): Promise<boolean> {
    return false;
  }

  async deleteArchivedTasks(
    _params: P<IWindowControllerService["deleteArchivedTasks"]>,
  ): Promise<AR<IWindowControllerService["deleteArchivedTasks"]>> {
    return { deleted: [], failed: [] } as unknown as AR<
      IWindowControllerService["deleteArchivedTasks"]
    >;
  }

  async listTaskList(
    _params: P<IWindowControllerService["listTaskList"]>,
  ): Promise<AR<IWindowControllerService["listTaskList"]>> {
    return asResult({ items: [], total: 0, hasMore: false });
  }

  async getTaskMeta(
    _params: P<IWindowControllerService["getTaskMeta"]>,
  ): Promise<AR<IWindowControllerService["getTaskMeta"]>> {
    return null;
  }

  async mutateTask(
    _params: P<IWindowControllerService["mutateTask"]>,
  ): Promise<AR<IWindowControllerService["mutateTask"]>> {
    return null;
  }

  async subscribeControllerV4(
    params: P<IWindowControllerService["subscribeControllerV4"]>,
  ): Promise<AR<IWindowControllerService["subscribeControllerV4"]>> {
    const subscriptionId = `ctrl_${createUuid()}`;
    this.topicsBySubscription.set(subscriptionId, params.topic);
    if (params.topic === "controller/workspaces") {
      this.emitWorkspacesSnapshot(subscriptionId);
    } else {
      this.emitTasksSnapshot(subscriptionId);
    }
    return asResult({ ack: { subscriptionId, mode: "snapshot", logEpoch: "ctrl-epoch-1" } });
  }

  async resyncControllerV4(
    params: P<IWindowControllerService["resyncControllerV4"]>,
  ): Promise<AR<IWindowControllerService["resyncControllerV4"]>> {
    // resync 重发当前快照；mock 数据不变，帧内容与订阅时一致。
    const subscriptionId = params.subscriptionId;
    const topic = this.topicsBySubscription.get(subscriptionId) ?? "controller/tasks-index";
    if (topic === "controller/workspaces") {
      this.emitWorkspacesSnapshot(subscriptionId);
    } else {
      this.emitTasksSnapshot(subscriptionId);
    }
    return asResult({ ack: { subscriptionId, mode: "snapshot", logEpoch: "ctrl-epoch-1" } });
  }

  async unsubscribeControllerV4(
    _params: P<IWindowControllerService["unsubscribeControllerV4"]>,
  ): Promise<void> {}

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

// ── 闲时任务 / Bots ──

export class MockOffPeakTaskService implements IOffPeakTaskService {
  async getCodingPlanSupport(): Promise<AR<IOffPeakTaskService["getCodingPlanSupport"]>> {
    return asResult({ supported: false, reasonCode: "mock" });
  }

  async getTakeNumberAvailability(): Promise<AR<IOffPeakTaskService["getTakeNumberAvailability"]>> {
    return asResult({ available: false, remaining: 0 });
  }

  async createTask(
    _params: P<IOffPeakTaskService["createTask"]>,
  ): Promise<AR<IOffPeakTaskService["createTask"]>> {
    throw new Error("mock: 闲时任务未启用");
  }

  async cancelTask(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["cancelTask"]>> {
    return null;
  }

  async pauseTask(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["pauseTask"]>> {
    return null;
  }

  async continueTask(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["continueTask"]>> {
    return null;
  }

  async deleteTask(_offPeakTaskId: string): Promise<void> {}

  async deleteHistory(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["deleteHistory"]>> {
    return null;
  }

  async updateTask(
    _params: P<IOffPeakTaskService["updateTask"]>,
  ): Promise<AR<IOffPeakTaskService["updateTask"]>> {
    return null;
  }

  async list(): Promise<AR<IOffPeakTaskService["list"]>> {
    return [];
  }

  async get(_offPeakTaskId: string): Promise<AR<IOffPeakTaskService["get"]>> {
    return null;
  }
}

export class MockBotsService implements IBotsService {
  constructor(private readonly runtime: MockRuntime) {}

  async syncAppRuntimePreferences(
    _preferences: P<IBotsService["syncAppRuntimePreferences"]>,
  ): Promise<void> {}

  async getStatus(): Promise<AR<IBotsService["getStatus"]>> {
    void this.runtime;
    return asResult({ enabled: false, providers: [] });
  }

  async getConfig(): Promise<AR<IBotsService["getConfig"]>> {
    return asResult({ bots: [], channels: {} });
  }

  async saveConfig(config: P<IBotsService["saveConfig"]>): Promise<AR<IBotsService["saveConfig"]>> {
    return asResult(config);
  }

  async listWorkspaceRefs(
    _params?: P<IBotsService["listWorkspaceRefs"]>,
  ): Promise<AR<IBotsService["listWorkspaceRefs"]>> {
    return [];
  }

  async getUserConfigOptions(
    _params: P<IBotsService["getUserConfigOptions"]>,
  ): Promise<AR<IBotsService["getUserConfigOptions"]>> {
    return [];
  }

  async beginFeishuRegistration(
    _params: P<IBotsService["beginFeishuRegistration"]>,
  ): Promise<AR<IBotsService["beginFeishuRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async pollFeishuRegistration(
    _params: P<IBotsService["pollFeishuRegistration"]>,
  ): Promise<AR<IBotsService["pollFeishuRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async beginWeixinRegistration(): Promise<AR<IBotsService["beginWeixinRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async pollWeixinRegistration(
    _params: P<IBotsService["pollWeixinRegistration"]>,
  ): Promise<AR<IBotsService["pollWeixinRegistration"]>> {
    throw new Error("mock: Bot 注册未启用");
  }

  async listBots(): Promise<AR<IBotsService["listBots"]>> {
    return [];
  }

  async saveBot(_params: P<IBotsService["saveBot"]>): Promise<AR<IBotsService["saveBot"]>> {
    throw new Error("mock: Bot 保存未启用");
  }

  async removeBotSecret(_botId: string): Promise<AR<IBotsService["removeBotSecret"]>> {
    throw new Error("mock: Bot 保存未启用");
  }

  async deleteBot(_botId: string): Promise<void> {}

  async testBot(_botId: string): Promise<AR<IBotsService["testBot"]>> {
    return asResult({ ok: false, message: "mock: Bot 测试未启用" });
  }

  async createBindCode(
    _params: P<IBotsService["createBindCode"]>,
  ): Promise<AR<IBotsService["createBindCode"]>> {
    throw new Error("mock: Bot 绑定未启用");
  }

  async getBotStates(): Promise<AR<IBotsService["getBotStates"]>> {
    return [];
  }

  async resetBotState(_params: P<IBotsService["resetBotState"]>): Promise<void> {}

  async watchAutomationRun(_params: P<IBotsService["watchAutomationRun"]>): Promise<void> {}

  async handleInboundMessage(
    _message: P<IBotsService["handleInboundMessage"]>,
  ): Promise<AR<IBotsService["handleInboundMessage"]>> {
    return [];
  }

  async handleProviderCallback(
    _provider: string,
    _payload: unknown,
  ): Promise<AR<IBotsService["handleProviderCallback"]>> {
    return [];
  }

  async handleProviderCallbackResponse(
    _provider: string,
    _payload: unknown,
  ): Promise<AR<IBotsService["handleProviderCallbackResponse"]>> {
    return asResult({ ok: false, status: 400, replies: [] });
  }
}

// ── 会话分享 / 附件暂存 / Onboarding / 加速卡 ──

export class MockConversationShareService implements IConversationShareService {
  async getCapabilities(): Promise<AR<IConversationShareService["getCapabilities"]>> {
    return asResult({ publish: false, import: false });
  }

  async preflight(
    _input: P<IConversationShareService["preflight"]>,
  ): Promise<AR<IConversationShareService["preflight"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async publish(
    _input: P<IConversationShareService["publish"]>,
  ): Promise<AR<IConversationShareService["publish"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  onDynamicPublishProgress(
    _operationId: string,
  ): ReturnType<IConversationShareService["onDynamicPublishProgress"]> {
    return new Emitter<never>().event as unknown as ReturnType<
      IConversationShareService["onDynamicPublishProgress"]
    >;
  }

  async importShare(
    _input: P<IConversationShareService["importShare"]>,
  ): Promise<AR<IConversationShareService["importShare"]>> {
    throw new Error("mock: 会话导入未启用");
  }

  onDynamicImportProgress(
    _operationId: string,
  ): ReturnType<IConversationShareService["onDynamicImportProgress"]> {
    return new Emitter<never>().event as unknown as ReturnType<
      IConversationShareService["onDynamicImportProgress"]
    >;
  }

  async getImportedConversation(
    _input: P<IConversationShareService["getImportedConversation"]>,
  ): Promise<AR<IConversationShareService["getImportedConversation"]>> {
    throw new Error("mock: 会话导入未启用");
  }

  async getPreview(_shareCode: string): Promise<AR<IConversationShareService["getPreview"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async getContinuation(
    _input: P<IConversationShareService["getContinuation"]>,
  ): Promise<AR<IConversationShareService["getContinuation"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async listManagedShares(
    _input: P<IConversationShareService["listManagedShares"]>,
  ): Promise<AR<IConversationShareService["listManagedShares"]>> {
    return asResult({ items: [], nextCursor: null });
  }

  async revokeManagedShare(
    _shareId: string,
  ): Promise<AR<IConversationShareService["revokeManagedShare"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async restoreManagedShare(
    _shareId: string,
  ): Promise<AR<IConversationShareService["restoreManagedShare"]>> {
    throw new Error("mock: 会话分享未启用");
  }

  async deleteManagedShare(_shareId: string): Promise<void> {}
}

export class MockPromptAttachmentTransferService implements IPromptAttachmentTransferService {
  private readonly progressEmitter = new Emitter<never>();

  async stage(
    _params: P<IPromptAttachmentTransferService["stage"]>,
  ): Promise<AR<IPromptAttachmentTransferService["stage"]>> {
    throw new Error("mock: 附件暂存未启用");
  }

  async adopt(_operationId: string): Promise<void> {}

  async cancel(_operationId: string): Promise<void> {}

  async cleanup(_operationId: string): Promise<void> {}

  onDynamicProgress(
    _operationId: string,
  ): ReturnType<IPromptAttachmentTransferService["onDynamicProgress"]> {
    return this.progressEmitter.event as unknown as ReturnType<
      IPromptAttachmentTransferService["onDynamicProgress"]
    >;
  }
}

export class MockOnboardingRecordService implements IOnboardingRecordService {
  async appendRecord(
    _deviceMid: string,
    _entry: Parameters<IOnboardingRecordService["appendRecord"]>[1],
  ): Promise<void> {}

  async shouldOnboard(_deviceMid: string): Promise<boolean> {
    return false;
  }

  async dismissOnboarding(_deviceMid: string): Promise<void> {}

  async claimAnonymousRecord(): Promise<void> {}

  async getLatestEntry(): Promise<AR<IOnboardingRecordService["getLatestEntry"]>> {
    return null;
  }

  async syncSettingsFromRecord(): Promise<AR<IOnboardingRecordService["syncSettingsFromRecord"]>> {
    return null;
  }

  async updateRecordPreferences(
    _params: P<IOnboardingRecordService["updateRecordPreferences"]>,
  ): Promise<void> {}

  async getRecords(): Promise<AR<IOnboardingRecordService["getRecords"]>> {
    return null;
  }

  async clearRecords(): Promise<void> {}
}

export class MockHighspeedCardService implements IHighspeedCardService {
  async prepareTurn(
    _params: P<IHighspeedCardService["prepareTurn"]>,
  ): Promise<AR<IHighspeedCardService["prepareTurn"]>> {
    throw new Error("mock: 加速卡未启用");
  }

  async getSnapshot(): Promise<AR<IHighspeedCardService["getSnapshot"]>> {
    return asResult({ cards: [], revision: 0 });
  }

  async invalidateCard(_cardId: string): Promise<boolean> {
    return false;
  }

  async getCurrentOwnerKey(): Promise<string | null> {
    return null;
  }

  async healthy(
    _cardId: string,
    _ownerKey?: string,
  ): Promise<AR<IHighspeedCardService["healthy"]>> {
    return null;
  }
}
