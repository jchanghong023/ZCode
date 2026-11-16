// 修复原因：浏览器项目契约只依赖已有纯仓储 DTO，不穿过数据库迁移与 Node 装配契约。
import type {
  ProjectDirectories,
  ProjectTaskRef,
  ProjectTree,
  VirtualProject,
} from "#src/project-storage/repository-contract.js";
import { ServiceChannels } from "@zcode/shared";
import type { FileEntry } from "@zcode/shared";
import { createServiceDescriptor } from "#src/descriptors.js";
export type {
  ProjectDataDeleteResult,
  ProjectDataMeasure,
  ProjectDataPort,
  ProjectDataSession,
} from "#src/project/data/contract.js";
export { LEGACY_SINGLE_ROOT_PROJECT_PREFIX } from "#src/project-storage/repository-contract.js";
export type {
  ProjectDirectories,
  ProjectTask,
  ProjectTaskRef,
  ProjectTree,
  SaveProjectInput,
  VirtualProject,
  ProjectRoot,
} from "#src/project-storage/repository-contract.js";

/** 当前浏览器连接的后端拥有共享项目；identity 不选择旧远程 Host，工号不参与项目分区。 */
export interface IProjectService {
  /** 项目选目录只访问当前后端服务器文件服务，不是浏览器设备；不建立 workspace 或启动 Agent。 */
  readDirectory(params?: {
    hostId?: string;
    path?: string;
    includeHidden?: boolean;
  }): Promise<{ path: string; entries: FileEntry[] }>;
  /** 配置目录与项目选择；所属 Host 派生主目录状态，不加载任务。 */
  readProjects(params?: { includeDeleted?: boolean; hostId?: string }): Promise<VirtualProject[]>;
  /** SQLite 快照与所属 Host 主目录状态的只读投影；不为查询启动 Agent，也不触发自动归档。 */
  readTree(params?: {
    includeDeleted?: boolean;
    includeDeletedTasks?: boolean;
    hostId?: string;
  }): Promise<ProjectTree>;
  /** 固化本次创建 cwd 并复检主目录；已配置目录失效时拒绝，空项目或全局任务才创建默认目录。 */
  prepareSession(params?: {
    projectId?: string;
    hostId?: string;
    draftId?: string;
    reuseDraft?: boolean;
  }): Promise<ProjectDirectories>;
  /** 缺 task = []，缺 project / DB 错误必须拒绝。软删项目仍可恢复历史任务。 */
  resolveSessionDirectories(task: ProjectTaskRef, hostId?: string): Promise<ProjectDirectories>;
}
export const IProjectService = createServiceDescriptor<IProjectService>(ServiceChannels.Project);
