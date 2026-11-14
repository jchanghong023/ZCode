import type { WorkspaceTabState } from "@/store/tabStore.js";
export {
  buildRemoteWorkspaceIdentity,
  remoteTargetSchema,
  parseRemoteWorkspaceIdentity,
} from "@zcode/shared";
export type { IServiceAccessor, VirtualProject } from "@zcode/services";
/** 配置目录地址不是 tab/session；连接信息只能复用已存在的 attachment。 */
export type ConfigWorkspaceTarget = Pick<
  WorkspaceTabState,
  | "workspacePath"
  | "workspaceIdentity"
  | "label"
  | "remoteSessionId"
  | "remoteTarget"
  | "localWorkspacePath"
  | "availability"
> & { hostId?: string; configOnline?: boolean };
export type {
  ProjectCatalogPort as ConfigCatalogPort,
  ProjectCatalogSnapshot as ConfigCatalogSnapshot,
} from "@zcode/services";
