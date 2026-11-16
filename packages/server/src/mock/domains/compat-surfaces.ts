// 原生工具控件使用的 GenUI 契约。
import { Emitter } from "@zcode/rpc";
import { IGenUiService } from "@zcode/services";
import type { MockServiceRegistrar } from "./contract.js";

type P<T extends (...args: never) => unknown> = Parameters<T>[0];
type AR<T extends (...args: never) => unknown> = Awaited<ReturnType<T>>;

export class MockGenUiService implements IGenUiService {
  async readDocument(
    _target: P<IGenUiService["readDocument"]>,
  ): Promise<AR<IGenUiService["readDocument"]>> {
    throw new Error("mock: GenUI 未启用");
  }

  async prepareSandbox(
    _input: P<IGenUiService["prepareSandbox"]>,
  ): Promise<AR<IGenUiService["prepareSandbox"]>> {
    throw new Error("mock: GenUI 未启用");
  }

  async getState(_target: P<IGenUiService["getState"]>): Promise<AR<IGenUiService["getState"]>> {
    return null as unknown as AR<IGenUiService["getState"]>;
  }

  async setState(_input: P<IGenUiService["setState"]>): Promise<void> {}

  async listState(_scope: P<IGenUiService["listState"]>): Promise<AR<IGenUiService["listState"]>> {
    return [] as unknown as AR<IGenUiService["listState"]>;
  }

  get onStateChanged(): IGenUiService["onStateChanged"] {
    return new Emitter<never>().event as unknown as IGenUiService["onStateChanged"];
  }
}

export function registerCompatSurfacesMockServices(services: MockServiceRegistrar): void {
  services.register(IGenUiService, new MockGenUiService());
}
