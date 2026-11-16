export type {
  ComposerMentionGroup,
  ComposerMentionSlotProps,
  ComposerStatusSlotModel,
  ComposerStatusSlotProps,
  ExtensionLauncherModel,
  ExtensionLauncherSectionProps,
  ExtensionLauncherViewItem,
  ExtensionLogsSidePaneTab,
  ExtensionPermissionsSectionProps,
  ExtensionProblem,
  ExtensionSlotEntry,
  ExtensionSlotsSources,
  ExtensionViewPaneProps,
  ExtensionViewSidePaneTab,
  ExtensionViewTarget,
  FileViewerRoute,
  FileViewerRouter,
  NavPrimarySlotHost,
  NavPrimarySlotProps,
  OpenExtensionLogs,
  OpenExtensionView,
  StartExtensionDraft,
  WorkbenchPaneReport,
} from "@/extension-slots/contract.js";
export { resolveExtensionIcon } from "@/extension-slots/components/extensionIcons.js";
export {
  buildFileViewerTab,
  resolveLocalizedText,
  selectExtensionProblems,
  selectSlotEntries,
  selectStaticViews,
} from "@/extension-slots/domain/slotSelectors.js";
export { ExtensionMentionOptionContent } from "@/extension-slots/components/ExtensionMentionOptionContent.js";
