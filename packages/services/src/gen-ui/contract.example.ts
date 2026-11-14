import type { IGenUiService } from "./contract.js";

/**
 * 工作台打开一个 gen-ui 片段的真实调用：执行 Host 读受限片段，桌面 Host 读同一 target 的 widget 状态。
 * 状态按 workspace identity + session 定界，页面本身不持久化任何内容。
 */
export async function exampleGenUiOpenWidget(
  service: IGenUiService,
  target: Parameters<IGenUiService["readDocument"]>[0],
) {
  const document = await service.readDocument(target);
  const state = await service.getState(target);
  return { document, state };
}
