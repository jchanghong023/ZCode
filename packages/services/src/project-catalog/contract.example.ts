import {
  readProjectCatalog,
  type ProjectCatalogPort,
  type ProjectCatalogSnapshot,
} from "./index.js";

/**
 * 配置目录（workspace-config-catalog）的真实调用：只经项目服务只读端口取当前 Host 的未删除项目，
 * 不拥有缓存、tab、连接或任务。
 */
export async function exampleProjectCatalog(
  port: ProjectCatalogPort,
): Promise<ProjectCatalogSnapshot> {
  return readProjectCatalog(port);
}
