// Descriptors & collection (browser-safe)
export { type ServiceDescriptor, createServiceDescriptor } from "./descriptors.js";
export { ServiceCollection, type ServiceExposurePolicy } from "./collection.js";
export { IAIReqService } from "./aireq/contract.js";
export {
  IModelSelectionService,
  IProviderSettingsService,
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderSettingsProviderView,
  type ProviderSettingsView,
} from "./model-provider/providerFacadeServices.js";
export {
  collectServiceMemoryDiagnostics,
  memoryDiagnosticsRegistry,
  registerMemoryDiagnosticsProvider,
} from "./memoryDiagnostics.js";

// Accessor
export type { IServiceAccessor } from "./accessor.js";

// File service — IFileService is both a type (interface) and value (descriptor)
export { IFileService } from "./file/file.js";

// System service — ISystemService is both a type (interface) and value (descriptor)
export { ISystemService } from "./system/system.js";

// Setting service — ISettingService is both a type (interface) and value (descriptor)
export { ISettingService } from "./setting/setting.js";

// Broadcast service — IBroadcastService is both a type (interface) and value (descriptor)
export { IBroadcastService } from "./broadcast/broadcast.js";

export type { BroadcastMessage } from "./broadcast/broadcast.js";

// 当前会话只保留工作区恢复入口，不发布旧任务元数据或事件。
export { IZCodeTaskService } from "./session/zcodeTaskService.js";
export type {
  ZCodeTaskListKind,
  ZCodeTaskListQuery,
  ZCodeTaskListResult,
  ZCodeTaskListSortBy,
  ZCodeTaskListWorkspaceScope,
} from "./session/zcodeTaskListTypes.js";
export type { ZCodeTaskListItem } from "./session/zcodeTaskListTypes.js";

// ZCode agent service — IZCodeAgentService is both a type (interface) and value (descriptor)
export {
  IZCodeAgentService,
  ZCODE_AGENT_RUNTIME_UNAVAILABLE_CODE,
} from "./zcode-agent/zcodeAgent.js";
export {
  createZCodeAgentConnectionScope,
  readTrustedZCodeAgentV4Connection,
} from "./zcode-agent/zcodeAgentConnectionScope.js";
export type {
  ZCodeAgentConnectionScope,
  ZCodeAgentV4ClientMode,
  ZCodeAgentV4ConnectionContext,
} from "./zcode-agent/zcodeAgentConnectionScope.js";
export type {
  ZCodeAgentAttachmentBeginParams,
  ZCodeAgentAttachmentChunkParams,
  ZCodeAgentAttachmentTerminalParams,
  ZCodeAgentRuntimeLifecycleEvent,
  ZCodeAgentRuntimePolicy,
  ZCodeAgentSessionTarget,
  ZCodeAgentWorkspaceTarget,
} from "./zcode-agent/zcodeAgent.js";

// ZCode session service — app-facing session facade without ZCode Agent naming.
export { IZCodeSessionService } from "./zcode-session/zcodeSession.js";
export type { ZCodeSessionWorkspaceTarget } from "./zcode-session/zcodeSession.js";

export type {
  ClientSceneConfig,
  ClientSceneItem,
  ClientSceneOption,
} from "./client-scenes/clientScenes.js";

export type { SessionRealtimePort } from "./session/sessionRealtimePort.js";

// Storage（资源管理器「存储」tab）：数据类型在 @zcode/shared；这里只导出服务接口与卷分组纯函数
// StorageRootSpec 随契约再导出：desktop 的 Worker 协议按 contract.ts 的口径只从 services 入口取类型。
export type { IStorageService, StorageRootSpec } from "./storage/contract.js";

export type { IDataSyncCategoryService } from "./data-sync/index.js";

// Subagents service — ISubagentsService is both a type (interface) and value (descriptor)
export { ISubagentsService } from "./subagents/subagents.js";

export { IProjectService, LEGACY_SINGLE_ROOT_PROJECT_PREFIX } from "#src/project/contract.js";
export {
  type ManagedWorktreeGroup,
  type ManagedWorktreeWorkspace,
  type StartManagedWorktreeCreationResult,
} from "#src/managed-worktree-tasks/contract.js";
export type {
  ProjectTree,
  ProjectTask,
  ProjectTaskRef,
  VirtualProject,
  ProjectRoot,
  SaveProjectInput,
  ProjectDirectories,
} from "#src/project/contract.js";

export { readProjectCatalog, projectSelectionId } from "#src/project-catalog/index.js";
export type { ProjectCatalogPort, ProjectCatalogSnapshot } from "#src/project-catalog/contract.js";

export type {
  TaskGroup,
  TaskGroupColor,
  TaskGroupStructure,
  GroupTaskRef,
  GroupNode,
  MoveGroupNode,
} from "#src/task-groups/contract.js";
