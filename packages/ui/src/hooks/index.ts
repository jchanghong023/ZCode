/**
 * Hooks barrel export
 *
 * 所有服务和平台操作的 hooks 统一从此导出。
 * 组件应通过 hooks 访问服务，不再直接使用 services.* 或 window.zcode.*。
 */

// 服务上下文
export { ServiceProvider, useServices } from "./useServices.js";
export { useBaseWorkspaceServices, useWorkspaceServices } from "./useWorkspaceServices.js";
export { useWorkspaceHomePath } from "./useWorkspaceHomePath.js";

// 平台操作上下文
export { PlatformProvider, usePlatform } from "./usePlatform.js";

// 设置服务
export { useSettings } from "./useSettingService.js";
export { useSkills } from "./useSkills.js";

// 通用确认弹窗
export { useConfirmDialog } from "./useConfirmDialog.js";

export { useZCodeAgentService } from "./useZCodeAgentService.js";
