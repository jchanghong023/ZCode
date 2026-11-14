import type { WindowProjectDirectoryServices } from "./contract.js";

/**
 * 手机 replayable attachment 装配后的真实调用：先验证整组能力（version: 1），再复用窗口项目服务与变化流。
 * 缺能力维持旧版行为；取消订阅只释放原 broadcast listener，不增加独立 attachment。
 */
export async function exampleWindowProjectDirectory(services: WindowProjectDirectoryServices) {
  const capabilities = await services.changesService.getCapabilities();
  const subscription = services.changesService.onDidChange(() => {
    void services.projectService.readProjects();
  });
  const projects = await services.projectService.readProjects();
  return { capabilities, projects, unsubscribe: () => subscription.dispose() };
}
