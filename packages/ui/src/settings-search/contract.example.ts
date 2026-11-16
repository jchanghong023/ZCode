import type { SettingsSearchResult, SettingsSearchSection } from "@/settings-search/contract.js";

/** 搜索结果交给 SettingsPage 原导航；设置行挂载后按 id 定位。 */
export const fontSizeSearchResult = {
  section: "appearance",
  setting: "settings.uiFontSize",
} satisfies SettingsSearchResult;

/** 产品专用条目只投影可达的设置，命中后仍交给调用方处理导航与门禁。 */
export const analysisSearchSection = {
  id: "agentBehavior",
  label: "AI 配置 · 分析设置",
  includeSettings: false,
  items: [{ id: "aireq.analysis.interval", label: "统一分析间隔", keywords: ["间隔", "周期"] }],
} satisfies SettingsSearchSection;

export const analysisIntervalSearchResult = {
  section: "agentBehavior",
  setting: "aireq.analysis.interval",
} satisfies SettingsSearchResult;
