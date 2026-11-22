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

/** 只读投影 AIReq 业务与当前连接可访问的原生会话，不提供宿主目录浏览或第二项目 owner。 */
export interface WebProjectService {
  /** 当前 @/# mention 使用；仅返回当前工号、客户端及 workspace 可访问的项目和任务。 */
  readTree(): Promise<WebProjectTree>;
  /** 只解析已有业务/会话归属；复检 cwd 与稳定 identity，缺失或不可访问目标拒绝。 */
  resolveSessionDirectories(task: ProjectTaskRef): Promise<Pick<ProjectDirectories, "projectId">>;
}

export const IProjectService = createServiceDescriptor<WebProjectService>(ServiceChannels.Project);
