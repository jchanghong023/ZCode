// 当前恢复入口与工作区展示门面；不提供旧任务 meta 或侧聊会话 RPC。
// 方法签名统一从 IZCodeTaskService / IZCodeSessionService 派生。
import type { IZCodeSessionService, IZCodeTaskService } from "@zcode/services";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
type AR<M> = M extends (...args: never) => infer RT ? Awaited<RT> : never;

export class MockZCodeTaskService implements IZCodeTaskService {
  async restartWorkspaceProcess(
    _params: P<IZCodeTaskService["restartWorkspaceProcess"]>,
  ): Promise<void> {
    // 当前服务没有可重启的工作区进程，不能让恢复入口收到虚假的成功回执。
    throw Object.assign(new Error("当前服务暂不支持重启工作区。"), {
      code: "fault.command.capabilityUnsupported",
    });
  }
}

/** 会话门面：v4 时代仅剩恢复/展示读取路径仍被 UI 调用。 */
export class MockZCodeSessionService implements IZCodeSessionService {
  async readWorkspacePresentation(
    _params: P<IZCodeSessionService["readWorkspacePresentation"]>,
  ): Promise<AR<IZCodeSessionService["readWorkspacePresentation"]>> {
    // 当前没有工作区配置准备 owner，不能返回不满足正式 schema 的假展示对象。
    throw Object.assign(new Error("当前服务暂不支持工作区配置展示。"), {
      code: "fault.command.capabilityUnsupported",
    });
  }
}
