// 翻译 id 同时是设置行的定位 id。
export const APPEARANCE_SETTINGS_SEARCH_ITEMS = [
  {
    id: "settings.themeMode",
    description: "settings.themeModeDescription",
  },
  {
    id: "settings.uiFontSize",
    description: "settings.uiFontSizeDescription",
  },
  {
    id: "settings.lightTheme",
    description: "settings.lightThemeDescription",
  },
  {
    id: "settings.darkTheme",
    description: "settings.darkThemeDescription",
  },
  {
    id: "settings.showLineNumbers",
    description: "settings.showLineNumbersDescription",
  },
  {
    id: "settings.wrapLongLines",
    description: "settings.wrapLongLinesDescription",
  },
  {
    id: "settings.fontSize",
    description: "settings.fontSizeDescription",
  },
] as const;

export type SettingsSearchId =
  | (typeof APPEARANCE_SETTINGS_SEARCH_ITEMS)[number]["id"]
  | `aireq.${string}`;
