import type { BundledTheme } from "shiki";
import type { CodePreviewSettings } from "@/store/index.js";

interface CodePreviewThemeOption {
  value: BundledTheme;
  label: string;
}

export const CODE_PREVIEW_THEME_OPTIONS: CodePreviewThemeOption[] = [
  { value: "github-light", label: "GitHub Light" },
  { value: "github-dark", label: "GitHub Dark" },
];

const DARK_CODE_PREVIEW_THEMES: readonly BundledTheme[] = ["github-dark"];

export function isDarkCodePreviewTheme(theme: BundledTheme): boolean {
  // 代码主题的明暗语义必须跟随设置页支持的显式选项，不能用主题名正则猜测。
  return DARK_CODE_PREVIEW_THEMES.includes(theme);
}

export const SETTINGS_PREVIEW_CODE = `{
  "requirement": "需求澄清与跟踪",
  "status": "待评审",
  "acceptance": ["范围明确", "验收可追溯"]
}`;

export function getCodePreviewTheme(
  mode: "light" | "dark",
  settings: CodePreviewSettings,
): BundledTheme {
  return mode === "dark" ? settings.darkTheme : settings.lightTheme;
}
