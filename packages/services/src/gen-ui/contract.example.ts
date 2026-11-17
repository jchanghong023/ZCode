import type { IGenUiService } from "./contract.js";

/** 当前发送链按 workspace/session 读取已有状态，不创建文档或沙箱。 */
export async function exampleGenUiContext(
  service: IGenUiService,
  scope: Parameters<IGenUiService["listState"]>[0],
) {
  return service.listState(scope);
}
