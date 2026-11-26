export { AppErrorBoundary, ScopedErrorBoundary } from "./ErrorBoundary.js";
export type { ScopedErrorBoundaryVariant } from "./ErrorBoundary.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export { ConfirmDialogHost } from "./ConfirmDialog.js";
export { useTheme } from "./useTheme.js";
export type { Theme } from "./useTheme.js";
export { StoreProvider, useZCodeStore } from "./store/StoreProvider.js";
export { loadPerformanceMode } from "./lib/performanceMode.js";
export type { ZCodeState } from "./store/index.js";
export {
  REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE,
  createRemoteWorkspaceDisconnectedError,
} from "./lib/remoteWorkspaceServiceError.js";

// Hooks —— 统一的服务和平台操作访问层
export {
  ServiceProvider,
  useServices,
  useWorkspaceServices,
  PlatformProvider,
  usePlatform,
  useSettings,
  useConfirmDialog,
} from "./hooks/index.js";

export { ZCodeIntlProvider, useZCodeIntl } from "./i18n/index.js";
export type { IntlInstance } from "./i18n/index.js";
export {
  FileDisplayInline,
  createFileDisplayDom,
  getFileDisplayPath,
  resolveFileDisplayDescriptor,
  setDefaultFileDisplayBasePath,
} from "./lib/fileDisplay.js";
export type { FileDisplayDescriptor, FileDisplayOptions } from "./lib/fileDisplay.js";
export { playTaskNotificationSound } from "./lib/taskNotificationSound.js";
export {
  applyUiFontSizePx,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "./lib/uiFontSize.js";
export {
  generateMobileDeviceFingerprint,
  getStreamClientId,
  setStreamClientId,
} from "./lib/streamClientId.js";
export { getV4ClientId } from "./v4/commandFactory.js";
export { logger } from "./logger.js";

export {
  ensurePendingTaskDraft,
  readPendingTaskDraft,
  readComposerWorkspaceScope,
} from "@/v4/composer/composerDraftStore.js";
