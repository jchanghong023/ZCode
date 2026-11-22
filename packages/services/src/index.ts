// Descriptors & collection (browser-safe)
export { type ServiceDescriptor, createServiceDescriptor } from "./descriptors.js";
export { ServiceCollection, type ServiceExposurePolicy } from "./collection.js";
export { IAIReqService } from "./aireq/contract.js";
export {
  IModelSelectionService,
  IProviderSettingsService,
  WEB_MODEL_SELECTION_METHODS,
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderSettingsProviderView,
  type ProviderSettingsView,
  type WebModelSelectionService,
  type WebModelSelectionView,
} from "./model-provider/providerFacadeServices.js";
export {
  collectServiceMemoryDiagnostics,
  memoryDiagnosticsRegistry,
  registerMemoryDiagnosticsProvider,
} from "./memoryDiagnostics.js";

// Accessor
export type { IServiceAccessor } from "./accessor.js";

// Web file service descriptor and its wire types
export { IFileService } from "./file/file.js";
export type { WebFileMediaPreview, WebFileService, WebWorkspaceFileEntry } from "./file/file.js";

// System service — ISystemService is both a type (interface) and value (descriptor)
export { ISystemService } from "./system/system.js";

// Setting service — ISettingService is both a type (interface) and value (descriptor)
export {
  ISettingService,
  createDefaultWebAppSettings,
  webAppSettingsPatchSchema,
  type WebAppSettings,
  type WebSettingService,
} from "./setting/setting.js";

// Broadcast service — IBroadcastService is both a type (interface) and value (descriptor)
export { IBroadcastService } from "./broadcast/broadcast.js";

export type {
  BroadcastMessage,
  WebBroadcastMessage,
  WebBroadcastService,
} from "./broadcast/broadcast.js";

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
  WebProjectService,
  WebProjectTree,
} from "#src/project/contract.js";

export type {
  TaskGroup,
  TaskGroupColor,
  TaskGroupStructure,
  GroupTaskRef,
  GroupNode,
  MoveGroupNode,
} from "#src/task-groups/contract.js";
