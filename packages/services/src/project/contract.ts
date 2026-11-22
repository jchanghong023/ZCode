// 修复原因：浏览器项目契约只依赖已有纯仓储 DTO，不穿过数据库迁移与 Node 装配契约。
import type {
  ProjectDirectories,
  ProjectTaskRef,
  ProjectTree,
} from "#src/project-storage/repository-contract.js";
import { ServiceChannels } from "@zcode/shared";
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

interface ProjectTreeReadParams {
  includeDeleted?: boolean;
  includeDeletedTasks?: boolean;
  hostId?: string;
}

/** 只读投影 AIReq 业务与当前连接可访问的原生会话，不提供宿主目录浏览或第二项目 owner。 */
export interface IProjectService {
  /** 当前 @/# mention 使用；includeDeleted 不放宽工号、客户端或 workspace 隔离。 */
  readTree(params?: ProjectTreeReadParams): Promise<ProjectTree>;
  /** 只解析已有业务/会话归属；复检 cwd 与稳定 identity，缺失或不可访问目标拒绝。 */
  resolveSessionDirectories(task: ProjectTaskRef, hostId?: string): Promise<ProjectDirectories>;
}

export interface WebProjectTree {
  projects: Array<Pick<ProjectTree["projects"][number], "id" | "name">>;
  tasks: Array<
    Pick<
      ProjectTree["tasks"][number],
      | "taskId"
      | "title"
      | "workspacePath"
      | "workspaceIdentity"
      | "createdAt"
      | "updatedAt"
      | "projectId"
    >
  >;
}

export interface WebProjectService extends Omit<
  IProjectService,
  "resolveSessionDirectories" | "readTree"
> {
  readTree(): Promise<WebProjectTree>;
  resolveSessionDirectories(task: ProjectTaskRef): Promise<Pick<ProjectDirectories, "projectId">>;
}

export const IProjectService = createServiceDescriptor<IProjectService>(ServiceChannels.Project);
