// 当前发送链仅查询 GenUI 状态；没有接纳任何状态，空集合是真实事实而非写入空成功。
import { IGenUiService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

export class MockGenUiService implements IGenUiService {
  async listState(_scope: P<IGenUiService["listState"]>): Promise<AR<IGenUiService["listState"]>> {
    return [];
  }
}

export function registerCompatSurfacesMockServices(services: MockServiceRegistrar): void {
  services.register(IGenUiService, new MockGenUiService());
}
