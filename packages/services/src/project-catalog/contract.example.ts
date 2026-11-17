import {
  readProjectCatalog,
  type ProjectCatalogPort,
  type ProjectCatalogSnapshot,
} from "./index.js";

/**
 * 配置目录（workspace-config-catalog）的真实调用：经 readTree 复用当前身份的安全项目投影，
 * 过滤软删除项目，不拥有缓存、tab、连接或任务。
 */
export async function exampleProjectCatalog(
  port: ProjectCatalogPort,
): Promise<ProjectCatalogSnapshot> {
  return readProjectCatalog(port);
}
