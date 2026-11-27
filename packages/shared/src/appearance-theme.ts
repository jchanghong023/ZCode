export const DEFAULT_AIREQ_THEME = "aireq-cobalt";
export const AIREQ_THEMES = [DEFAULT_AIREQ_THEME, "zai-motion"] as const;

export const APP_THEMES = [
  "light",
  "dark",
  "zai-light",
  "zai-dark",
  "system",
  ...AIREQ_THEMES,
] as const;
export type AppTheme = (typeof APP_THEMES)[number];
