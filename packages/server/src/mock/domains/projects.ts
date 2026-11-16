// 原生会话的任务分组准入；不再提供窗口 controller、Source Server 或 worktree RPC。
import { ITaskGroupService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<M> = M extends (first: infer A, ...rest: never) => unknown ? A : never;
export class MockTaskGroupService implements ITaskGroupService {
  async admit(_input: P<ITaskGroupService["admit"]>): Promise<void> {}
}

export function registerProjectsMockServices(services: MockServiceRegistrar): void {
  services.register(ITaskGroupService, new MockTaskGroupService());
}
