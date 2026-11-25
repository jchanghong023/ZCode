export const AIREQ_THEMES = [
  "aireq-cobalt",
  "aireq-slate",
  "aireq-violet",
  "aireq-aurora",
] as const;
export const DEFAULT_AIREQ_THEME = AIREQ_THEMES[0];

export const APP_THEMES = [
  "light",
  "dark",
  "zai-light",
  "zai-dark",
  "zai-motion",
  "system",
  ...AIREQ_THEMES,
] as const;
export type AppTheme = (typeof APP_THEMES)[number];
