import type { SettingsSearchResult, SettingsSearchSection } from "@/settings-search/contract.js";

/** 搜索结果交给 SettingsPage 原导航；设置行挂载后按 id 定位。 */
export const fontSizeSearchResult = {
  section: "appearance",
  setting: "settings.uiFontSize",
} satisfies SettingsSearchResult;

/** 产品专用条目只投影可达的设置，命中后仍交给调用方处理导航与门禁。 */
export const documentFormatSearchSection = {
  id: "documentFormats",
  label: "文档格式",
  items: [
    {
      id: "aireq.documentFormats.requirements.md",
      label: "requirements.md",
      keywords: ["必需章节", "Markdown"],
    },
  ],
} satisfies SettingsSearchSection;

export const documentFormatSearchResult = {
  section: "documentFormats",
  setting: "aireq.documentFormats.requirements.md",
} satisfies SettingsSearchResult;
