// 模拟任务索引与会话门面服务：tasks-index 的内存镜像，与 v4 会话共享同一份运行时状态。
// 方法签名统一从 IZCodeTaskService / IZCodeSessionService 派生。
import { Emitter, Event } from "@zcode/rpc";
import type { ZCodeTaskMeta } from "@zcode/shared";
import type { IZCodeSessionService, IZCodeTaskService } from "@zcode/services";
import {
  isListedSession,
  workspaceKeyOf,
  type MockRuntime,
  type MockTaskRecord,
} from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type R<M> = M extends (...args: never) => unknown ? M : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 任务记录 → 任务 meta；task 服务与 controller tasks-index 共用同一投影。 */
export function toTaskMeta(record: MockTaskRecord): ZCodeTaskMeta {
  return {
    taskId: record.sessionId,
    // 确定性 traceId：同一任务多次读取必须得到同一 meta，否则 delta 对比会永远“有变化”。
    traceId: `trace_${record.sessionId}`,
    title: record.title || "新任务",
    ...(record.titleSource === "custom" ? { titleOverridden: true } : {}),
    workspacePath: record.workspacePath,
    ...(record.workspaceIdentity ? { workspaceIdentity: record.workspaceIdentity } : {}),
    createdAt: record.createdAt,
    updatedAt: record.lastActivityAt,
    ...(record.unread ? { unreadAt: record.lastActivityAt } : {}),
    mode: "build" as const,
    provider: "glm" as const,
  };
}

function matchTask(
  record: MockTaskRecord,
  params: { workspacePath: string; workspaceIdentity?: string },
): boolean {
  if (record.archived) return false;
  if (record.workspacePath !== params.workspacePath) return false;
  const identity = params.workspaceIdentity?.trim();
  if (identity && record.workspaceIdentity !== identity) return false;
  return true;
}

export class MockZCodeTaskService implements IZCodeTaskService {
  private readonly workspaceEventEmitter = new Emitter<{ type: string; workspacePath: string }>();

  constructor(private readonly runtime: MockRuntime) {
    this.runtime.onWorkspaceTaskListChanged.event((event) => {
      this.workspaceEventEmitter.fire({ type: event.type, workspacePath: event.workspacePath });
    });
  }

  async initialize(
    _params: P<IZCodeTaskService["initialize"]>,
  ): Promise<AR<IZCodeTaskService["initialize"]>> {
    return { available: true, version: "3.18.2-mock" };
  }

  async releaseWorkspacePreparation(
    _params: P<IZCodeTaskService["releaseWorkspacePreparation"]>,
  ): Promise<void> {}

  async checkCodexConnectivity(): Promise<AR<IZCodeTaskService["checkCodexConnectivity"]>> {
    return { reachable: false, reason: "mock" } as unknown as AR<
      IZCodeTaskService["checkCodexConnectivity"]
    >;
  }

  async createTask(
    _params: P<IZCodeTaskService["createTask"]>,
  ): Promise<AR<IZCodeTaskService["createTask"]>> {
    // v4 主链路由 createSession 命令创建会话；这里只为旧调用边界返回确定性失败占位。
    throw new Error("mock: createTask 由 v4 createSession 命令承担");
  }

  async sendPrompt(
    _params: P<IZCodeTaskService["sendPrompt"]>,
  ): Promise<AR<IZCodeTaskService["sendPrompt"]>> {
    throw new Error("mock: task sendPrompt 由 v4 sendConversationCommandV4 承担");
  }

  async deliverSessionMessage(
    _request: P<IZCodeTaskService["deliverSessionMessage"]>,
  ): Promise<AR<IZCodeTaskService["deliverSessionMessage"]>> {
    throw new Error("mock: deliverSessionMessage 未实现");
  }

  async sendSessionMessageDeliveryResult(
    _result: P<IZCodeTaskService["sendSessionMessageDeliveryResult"]>,
  ): Promise<void> {}

  async enqueueTaskCommand(
    _params: P<IZCodeTaskService["enqueueTaskCommand"]>,
  ): Promise<AR<IZCodeTaskService["enqueueTaskCommand"]>> {
    throw new Error("mock: enqueueTaskCommand 未实现");
  }

  async promoteTaskCommand(
    _params: P<IZCodeTaskService["promoteTaskCommand"]>,
  ): Promise<AR<IZCodeTaskService["promoteTaskCommand"]>> {
    throw new Error("mock: promoteTaskCommand 未实现");
  }

  async cancelTaskCommand(
    _params: P<IZCodeTaskService["cancelTaskCommand"]>,
  ): Promise<AR<IZCodeTaskService["cancelTaskCommand"]>> {
    return { canceled: false } as unknown as AR<IZCodeTaskService["cancelTaskCommand"]>;
  }

  async stopGeneration(params: P<IZCodeTaskService["stopGeneration"]>): Promise<void> {
    const session = this.runtime.sessions.get(params.taskId);
    session?.activeTurn?.abort();
  }

  async compactSession(
    _params: P<IZCodeTaskService["compactSession"]>,
  ): Promise<AR<IZCodeTaskService["compactSession"]>> {
    return { status: "noop" } as unknown as AR<IZCodeTaskService["compactSession"]>;
  }

  async goalSession(
    _params: P<IZCodeTaskService["goalSession"]>,
  ): Promise<AR<IZCodeTaskService["goalSession"]>> {
    return { status: "noop" } as unknown as AR<IZCodeTaskService["goalSession"]>;
  }

  async respondPermission(_params: P<IZCodeTaskService["respondPermission"]>): Promise<boolean> {
    return false;
  }

  async respondElicitation(_params: P<IZCodeTaskService["respondElicitation"]>): Promise<boolean> {
    return false;
  }

  async resumeTask(
    params: P<IZCodeTaskService["resumeTask"]>,
  ): Promise<AR<IZCodeTaskService["resumeTask"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    if (record) return toTaskMeta(record);
    throw new Error(`mock: task not found ${params.taskId}`);
  }

  async listTasks(
    params: P<IZCodeTaskService["listTasks"]>,
  ): Promise<AR<IZCodeTaskService["listTasks"]>> {
    return [...this.runtime.tasks.values()]
      .filter((record) => matchTask(record, params))
      .filter((record) => {
        const session = this.runtime.sessions.get(record.sessionId);
        return !session || isListedSession(session);
      })
      .map((record) => toTaskMeta(record));
  }

  async listPinnedTaskIds(): Promise<AR<IZCodeTaskService["listPinnedTaskIds"]>> {
    return [...this.runtime.tasks.values()]
      .filter((record) => record.pinned && !record.archived)
      .map((record) => record.sessionId);
  }

  async listPinnedTasks(
    params: P<IZCodeTaskService["listPinnedTasks"]>,
  ): Promise<AR<IZCodeTaskService["listPinnedTasks"]>> {
    return [...this.runtime.tasks.values()]
      .filter((record) => record.pinned && matchTask(record, params))
      .filter((record) => {
        const session = this.runtime.sessions.get(record.sessionId);
        return !session || isListedSession(session);
      })
      .map((record) => toTaskMeta(record));
  }

  async listDeletedTaskIds(
    _params: P<IZCodeTaskService["listDeletedTaskIds"]>,
  ): Promise<AR<IZCodeTaskService["listDeletedTaskIds"]>> {
    return [];
  }

  async listActiveTaskIds(
    _params: P<IZCodeTaskService["listActiveTaskIds"]>,
  ): Promise<AR<IZCodeTaskService["listActiveTaskIds"]>> {
    return [...this.runtime.sessions.values()]
      .filter(
        (session) =>
          session.activeTurn && workspaceKeyOf(session.workspaceRef) === workspaceKeyOf(_params),
      )
      .map((session) => session.sessionId);
  }

  async listTaskList(
    query: P<IZCodeTaskService["listTaskList"]>,
  ): Promise<AR<IZCodeTaskService["listTaskList"]>> {
    const scopes = query.workspaceScopes ?? [];
    const tasks: ZCodeTaskMeta[] = [];
    for (const scope of scopes) {
      const workspace =
        typeof scope === "string"
          ? { workspacePath: scope }
          : {
              workspacePath: scope.workspacePath,
              ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
            };
      tasks.push(...(await this.listTasks(workspace)));
    }
    return {
      items: tasks,
      total: tasks.length,
      hasMore: false,
    } as AR<IZCodeTaskService["listTaskList"]>;
  }

  async listArchivedTasks(
    params: P<IZCodeTaskService["listArchivedTasks"]>,
  ): Promise<AR<IZCodeTaskService["listArchivedTasks"]>> {
    return [...this.runtime.tasks.values()]
      .filter((record) => record.archived && record.workspacePath === params.workspacePath)
      .map((record) => toTaskMeta(record));
  }

  async getTaskSnapshot(
    params: P<IZCodeTaskService["getTaskSnapshot"]>,
  ): Promise<AR<IZCodeTaskService["getTaskSnapshot"]>> {
    void params;
    return null;
  }

  async getTaskSnapshotWithEtag(
    params: P<IZCodeTaskService["getTaskSnapshotWithEtag"]>,
  ): Promise<AR<IZCodeTaskService["getTaskSnapshotWithEtag"]>> {
    void params;
    return { snapshot: null, etag: '"mock-empty"', notModified: false } as unknown as AR<
      IZCodeTaskService["getTaskSnapshotWithEtag"]
    >;
  }

  async getTaskSnapshotBody(
    _params: P<IZCodeTaskService["getTaskSnapshotBody"]>,
  ): Promise<AR<IZCodeTaskService["getTaskSnapshotBody"]>> {
    return null;
  }

  async getTaskSnapshotRef(
    _params: P<IZCodeTaskService["getTaskSnapshotRef"]>,
  ): Promise<AR<IZCodeTaskService["getTaskSnapshotRef"]>> {
    return null;
  }

  async getTaskSnapshotToolCallsSlice(
    _params: P<IZCodeTaskService["getTaskSnapshotToolCallsSlice"]>,
  ): Promise<AR<IZCodeTaskService["getTaskSnapshotToolCallsSlice"]>> {
    return { toolCalls: [], hasMore: false } as unknown as AR<
      IZCodeTaskService["getTaskSnapshotToolCallsSlice"]
    >;
  }

  async getTaskMeta(
    params: P<IZCodeTaskService["getTaskMeta"]>,
  ): Promise<AR<IZCodeTaskService["getTaskMeta"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    return record ? toTaskMeta(record) : null;
  }

  async getTaskConfigOptions(
    _params: P<IZCodeTaskService["getTaskConfigOptions"]>,
  ): Promise<AR<IZCodeTaskService["getTaskConfigOptions"]>> {
    return [];
  }

  async getTaskModelSelection(
    _params: P<IZCodeTaskService["getTaskModelSelection"]>,
  ): Promise<AR<IZCodeTaskService["getTaskModelSelection"]>> {
    return null;
  }

  async setAssistantMessageFeedback(
    _params: P<IZCodeTaskService["setAssistantMessageFeedback"]>,
  ): Promise<AR<IZCodeTaskService["setAssistantMessageFeedback"]>> {
    throw new Error("mock: 消息反馈由 v4 setAssistantFeedback 命令承担");
  }

  async syncTaskSessionBinding(
    _params: P<IZCodeTaskService["syncTaskSessionBinding"]>,
  ): Promise<AR<IZCodeTaskService["syncTaskSessionBinding"]>> {
    throw new Error("mock: 会话绑定未启用");
  }

  async switchAgent(
    _params: P<IZCodeTaskService["switchAgent"]>,
  ): Promise<AR<IZCodeTaskService["switchAgent"]>> {
    throw new Error("mock: provider 切换未启用");
  }

  async scanImportableClaudeSessions(
    _params: P<IZCodeTaskService["scanImportableClaudeSessions"]>,
  ): Promise<AR<IZCodeTaskService["scanImportableClaudeSessions"]>> {
    return { sessions: [] } as unknown as AR<IZCodeTaskService["scanImportableClaudeSessions"]>;
  }

  async importClaudeSessions(
    _params: P<IZCodeTaskService["importClaudeSessions"]>,
  ): Promise<AR<IZCodeTaskService["importClaudeSessions"]>> {
    return { imported: 0, failed: 0 } as unknown as AR<IZCodeTaskService["importClaudeSessions"]>;
  }

  async setMode(_params: P<IZCodeTaskService["setMode"]>): Promise<void> {}

  async setConfigOption(
    _params: P<IZCodeTaskService["setConfigOption"]>,
  ): Promise<AR<IZCodeTaskService["setConfigOption"]>> {
    return [];
  }

  async setModel(
    _params: P<IZCodeTaskService["setModel"]>,
  ): Promise<AR<IZCodeTaskService["setModel"]>> {
    return [];
  }

  async setAutomationSessionConfig(
    _params: P<IZCodeTaskService["setAutomationSessionConfig"]>,
  ): Promise<AR<IZCodeTaskService["setAutomationSessionConfig"]>> {
    return [];
  }

  async getWorkspaceProviderConfigFile(
    _params: P<IZCodeTaskService["getWorkspaceProviderConfigFile"]>,
  ): Promise<AR<IZCodeTaskService["getWorkspaceProviderConfigFile"]>> {
    return { provider: _params.provider ?? "glm", path: "", exists: false } as unknown as AR<
      IZCodeTaskService["getWorkspaceProviderConfigFile"]
    >;
  }

  async getTaskNativeSessionLogFile(
    _params: P<IZCodeTaskService["getTaskNativeSessionLogFile"]>,
  ): Promise<AR<IZCodeTaskService["getTaskNativeSessionLogFile"]>> {
    return { path: null, content: null } as unknown as AR<
      IZCodeTaskService["getTaskNativeSessionLogFile"]
    >;
  }

  async getModelTrajectory(
    _params: P<IZCodeTaskService["getModelTrajectory"]>,
  ): Promise<AR<IZCodeTaskService["getModelTrajectory"]>> {
    return null as unknown as AR<IZCodeTaskService["getModelTrajectory"]>;
  }

  async getTaskTokenUsage(
    _params: P<IZCodeTaskService["getTaskTokenUsage"]>,
  ): Promise<AR<IZCodeTaskService["getTaskTokenUsage"]>> {
    return {
      taskId: _params.taskId,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelRequestCount: 0,
      modelErrorCount: 0,
    } as unknown as AR<IZCodeTaskService["getTaskTokenUsage"]>;
  }

  async getTaskSessionFilePath(
    _params: P<IZCodeTaskService["getTaskSessionFilePath"]>,
  ): Promise<AR<IZCodeTaskService["getTaskSessionFilePath"]>> {
    return { path: null } as unknown as AR<IZCodeTaskService["getTaskSessionFilePath"]>;
  }

  async restartWorkspaceProcess(
    _params: P<IZCodeTaskService["restartWorkspaceProcess"]>,
  ): Promise<void> {}

  async previewArchivedTaskDeletion(
    _params: P<IZCodeTaskService["previewArchivedTaskDeletion"]>,
  ): Promise<AR<IZCodeTaskService["previewArchivedTaskDeletion"]>> {
    return { sessions: [], totalBytes: 0 } as unknown as AR<
      IZCodeTaskService["previewArchivedTaskDeletion"]
    >;
  }

  async permanentlyDeleteArchivedTask(
    _params: P<IZCodeTaskService["permanentlyDeleteArchivedTask"]>,
  ): Promise<AR<IZCodeTaskService["permanentlyDeleteArchivedTask"]>> {
    return { deletedSessionIds: [], failedSessionIds: [] } as unknown as AR<
      IZCodeTaskService["permanentlyDeleteArchivedTask"]
    >;
  }

  async deleteTask(params: P<IZCodeTaskService["deleteTask"]>): Promise<void> {
    const record = this.runtime.tasks.get(params.taskId);
    if (!record) return;
    const session = this.runtime.sessions.get(params.taskId);
    if (session) {
      session.activeTurn?.abort();
      this.runtime.sessions.delete(params.taskId);
    }
    this.runtime.tasks.delete(params.taskId);
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: record.workspacePath,
      type: "workspace_task_list_changed",
    });
  }

  async deleteArchivedTask(
    params: P<IZCodeTaskService["deleteArchivedTask"]>,
  ): Promise<AR<IZCodeTaskService["deleteArchivedTask"]>> {
    await this.deleteTask(params);
    return true;
  }

  async deleteArchivedTasks(
    _params: P<IZCodeTaskService["deleteArchivedTasks"]>,
  ): Promise<AR<IZCodeTaskService["deleteArchivedTasks"]>> {
    return { deleted: [], failed: [] } as unknown as AR<IZCodeTaskService["deleteArchivedTasks"]>;
  }

  async renameTask(
    params: P<IZCodeTaskService["renameTask"]>,
  ): Promise<AR<IZCodeTaskService["renameTask"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    if (record) {
      record.title = params.title;
      record.titleSource = "custom";
      record.lastActivityAt = Date.now();
    }
    const session = this.runtime.sessions.get(params.taskId);
    if (session) {
      session.meta = { title: params.title, titleSource: "custom" };
    }
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: record?.workspacePath ?? this.runtime.workspacePath,
      type: "workspace_task_list_changed",
    });
    if (record) return toTaskMeta(record);
    throw new Error("mock: task not found");
  }

  async setTaskPinned(
    params: P<IZCodeTaskService["setTaskPinned"]>,
  ): Promise<AR<IZCodeTaskService["setTaskPinned"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    if (record) record.pinned = params.pinned;
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: record?.workspacePath ?? this.runtime.workspacePath,
      type: "workspace_task_list_changed",
    });
    if (record) return toTaskMeta(record);
    throw new Error("mock: task not found");
  }

  async setTaskUnread(
    params: P<IZCodeTaskService["setTaskUnread"]>,
  ): Promise<AR<IZCodeTaskService["setTaskUnread"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    if (record) record.unread = params.unread;
    if (record) return toTaskMeta(record);
    throw new Error("mock: task not found");
  }

  async archiveTask(
    params: P<IZCodeTaskService["archiveTask"]>,
  ): Promise<AR<IZCodeTaskService["archiveTask"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    if (record) {
      record.archived = true;
      record.pinned = false;
    }
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: record?.workspacePath ?? this.runtime.workspacePath,
      type: "workspace_task_list_changed",
    });
    if (record) return toTaskMeta(record);
    throw new Error("mock: task not found");
  }

  async unarchiveTask(
    params: P<IZCodeTaskService["unarchiveTask"]>,
  ): Promise<AR<IZCodeTaskService["unarchiveTask"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    if (record) record.archived = false;
    this.runtime.onWorkspaceTaskListChanged.fire({
      workspacePath: record?.workspacePath ?? this.runtime.workspacePath,
      type: "workspace_task_list_changed",
    });
    if (record) return toTaskMeta(record);
    throw new Error("mock: task not found");
  }

  async branchTaskFromPrompt(
    _params: P<IZCodeTaskService["branchTaskFromPrompt"]>,
  ): Promise<AR<IZCodeTaskService["branchTaskFromPrompt"]>> {
    throw new Error("mock: branchTaskFromPrompt 未实现");
  }

  onDynamicStreamEvent(_taskId: string): ReturnType<IZCodeTaskService["onDynamicStreamEvent"]> {
    return Event.None as unknown as ReturnType<IZCodeTaskService["onDynamicStreamEvent"]>;
  }

  onDynamicTaskTerminalOutcome(
    _taskId: string,
  ): ReturnType<IZCodeTaskService["onDynamicTaskTerminalOutcome"]> {
    return Event.None as unknown as ReturnType<IZCodeTaskService["onDynamicTaskTerminalOutcome"]>;
  }

  onDynamicTaskReady(_taskId: string): ReturnType<IZCodeTaskService["onDynamicTaskReady"]> {
    return Event.None as unknown as ReturnType<IZCodeTaskService["onDynamicTaskReady"]>;
  }

  onDynamicTaskEvent(
    _params: P<IZCodeTaskService["onDynamicTaskEvent"]>,
  ): ReturnType<IZCodeTaskService["onDynamicTaskEvent"]> {
    return Event.None as unknown as ReturnType<IZCodeTaskService["onDynamicTaskEvent"]>;
  }

  onDynamicWorkspaceEvent(
    _params: P<IZCodeTaskService["onDynamicWorkspaceEvent"]>,
  ): ReturnType<IZCodeTaskService["onDynamicWorkspaceEvent"]> {
    return this.workspaceEventEmitter.event as unknown as ReturnType<
      IZCodeTaskService["onDynamicWorkspaceEvent"]
    >;
  }

  get onError(): R<IZCodeTaskService["onError"]> {
    return Event.None as unknown as R<IZCodeTaskService["onError"]>;
  }
}

/** 会话门面：v4 时代仅剩恢复/展示读取路径仍被 UI 调用。 */
export class MockZCodeSessionService implements IZCodeSessionService {
  async initializeWorkspace(
    _params: P<IZCodeSessionService["initializeWorkspace"]>,
  ): Promise<AR<IZCodeSessionService["initializeWorkspace"]>> {
    throw new Error("mock: workspace 初始化由模拟运行时承担");
  }

  async getWorkspaceRuntimeIdentity(
    _params: P<IZCodeSessionService["getWorkspaceRuntimeIdentity"]>,
  ): Promise<AR<IZCodeSessionService["getWorkspaceRuntimeIdentity"]>> {
    return {
      generation: 1,
      identity: "mock",
      workspaceKey: workspaceKeyOf(_params),
    } as unknown as AR<IZCodeSessionService["getWorkspaceRuntimeIdentity"]>;
  }

  async readWorkspacePresentation(
    _params: P<IZCodeSessionService["readWorkspacePresentation"]>,
  ): Promise<AR<IZCodeSessionService["readWorkspacePresentation"]>> {
    return { items: [], generatedAt: Date.now() } as unknown as AR<
      IZCodeSessionService["readWorkspacePresentation"]
    >;
  }

  async createSession(
    _params: P<IZCodeSessionService["createSession"]>,
  ): Promise<AR<IZCodeSessionService["createSession"]>> {
    throw new Error("mock: session createSession 由 v4 命令承担");
  }

  async resumeSession(
    _params: P<IZCodeSessionService["resumeSession"]>,
  ): Promise<AR<IZCodeSessionService["resumeSession"]>> {
    throw new Error("mock: session resumeSession 由 v4 订阅承担");
  }

  async listSessions(
    _params: P<IZCodeSessionService["listSessions"]>,
  ): Promise<AR<IZCodeSessionService["listSessions"]>> {
    return [];
  }

  async readSession(
    _params: P<IZCodeSessionService["readSession"]>,
  ): Promise<AR<IZCodeSessionService["readSession"]>> {
    throw new Error("mock: session readSession 由 v4 投影承担");
  }

  async readSessionMessages(
    _params: P<IZCodeSessionService["readSessionMessages"]>,
  ): Promise<AR<IZCodeSessionService["readSessionMessages"]>> {
    return [];
  }

  async readSessionEvents(
    _params: P<IZCodeSessionService["readSessionEvents"]>,
  ): Promise<AR<IZCodeSessionService["readSessionEvents"]>> {
    return [];
  }

  async promoteDeferredDraftSession(
    _params: P<IZCodeSessionService["promoteDeferredDraftSession"]>,
  ): Promise<void> {}

  async closeSession(_params: P<IZCodeSessionService["closeSession"]>): Promise<void> {}

  async closeDeferredDraftSession(
    _params: P<IZCodeSessionService["closeDeferredDraftSession"]>,
  ): Promise<boolean> {
    return false;
  }

  async setModel(
    _params: P<IZCodeSessionService["setModel"]>,
  ): Promise<AR<IZCodeSessionService["setModel"]>> {
    throw new Error("mock: session setModel 由 v4 switchModelConfig 承担");
  }

  async setThoughtLevel(
    _params: P<IZCodeSessionService["setThoughtLevel"]>,
  ): Promise<AR<IZCodeSessionService["setThoughtLevel"]>> {
    throw new Error("mock: session setThoughtLevel 由 v4 switchModelConfig 承担");
  }

  async setMode(
    _params: P<IZCodeSessionService["setMode"]>,
  ): Promise<AR<IZCodeSessionService["setMode"]>> {
    throw new Error("mock: session setMode 由 v4 switchCollaborationMode 承担");
  }

  async respondProviderRuntimeHeaders(
    _params: P<IZCodeSessionService["respondProviderRuntimeHeaders"]>,
  ): Promise<void> {}
}
