// 模拟任务索引与会话门面服务：tasks-index 的内存镜像，与 v4 会话共享同一份运行时状态。
// 方法签名统一从 IZCodeTaskService / IZCodeSessionService 派生。
import { Emitter } from "@zcode/rpc";
import type { ZCodeTaskMeta } from "@zcode/shared";
import type { IZCodeSessionService, IZCodeTaskService } from "@zcode/services";
import type { MockRuntime, MockTaskRecord } from "./runtime.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

/** 任务记录的轻量 meta 投影；不再暴露旧任务列表和组织态 RPC。 */
function toTaskMeta(record: MockTaskRecord): ZCodeTaskMeta {
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

export class MockZCodeTaskService implements IZCodeTaskService {
  private readonly workspaceEventEmitter = new Emitter<{ type: string; workspacePath: string }>();

  constructor(private readonly runtime: MockRuntime) {
    this.runtime.onWorkspaceTaskListChanged.event((event) => {
      this.workspaceEventEmitter.fire({ type: event.type, workspacePath: event.workspacePath });
    });
  }

  async getTaskMeta(
    params: P<IZCodeTaskService["getTaskMeta"]>,
  ): Promise<AR<IZCodeTaskService["getTaskMeta"]>> {
    const record = this.runtime.tasks.get(params.taskId);
    return record ? toTaskMeta(record) : null;
  }

  async restartWorkspaceProcess(
    _params: P<IZCodeTaskService["restartWorkspaceProcess"]>,
  ): Promise<void> {
    // 当前服务没有可重启的工作区进程，不能让恢复入口收到虚假的成功回执。
    throw Object.assign(new Error("当前服务暂不支持重启工作区。"), {
      code: "fault.command.capabilityUnsupported",
    });
  }

  onDynamicWorkspaceEvent(
    _params: P<IZCodeTaskService["onDynamicWorkspaceEvent"]>,
  ): ReturnType<IZCodeTaskService["onDynamicWorkspaceEvent"]> {
    return this.workspaceEventEmitter.event as unknown as ReturnType<
      IZCodeTaskService["onDynamicWorkspaceEvent"]
    >;
  }
}

/** 会话门面：v4 时代仅剩恢复/展示读取路径仍被 UI 调用。 */
export class MockZCodeSessionService implements IZCodeSessionService {
  async readWorkspacePresentation(
    _params: P<IZCodeSessionService["readWorkspacePresentation"]>,
  ): Promise<AR<IZCodeSessionService["readWorkspacePresentation"]>> {
    return { items: [], generatedAt: Date.now() } as unknown as AR<
      IZCodeSessionService["readWorkspacePresentation"]
    >;
  }

  async readSession(
    _params: P<IZCodeSessionService["readSession"]>,
  ): Promise<AR<IZCodeSessionService["readSession"]>> {
    throw Object.assign(new Error("当前服务暂不支持此会话读取方式。"), {
      code: "fault.command.capabilityUnsupported",
    });
  }
}
