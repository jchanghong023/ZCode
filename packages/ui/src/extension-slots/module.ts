/**
 * extension-slots 保留纯展示 DTO、选择函数与候选行组件。
 * 当前 Web 不启用桌面宿主 transport。
 */
export const extensionSlotsModule = {
  id: "extension-slots",
  requires: ["ui", "shared", "plugin-ui", "extension-host-protocol"],
  provides: ["extension-slots-components"],
  publicEntrypoints: ["index.ts", "contract.ts", "components/ExtensionMentionOptionContent.tsx"],
} as const;
