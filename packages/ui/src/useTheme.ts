import { useEffect, useState, useCallback } from "react";
import { AIREQ_THEMES, APP_THEMES, type AppTheme } from "@zcode/shared";

export type Theme = AppTheme;
export { AIREQ_THEMES, DEFAULT_AIREQ_THEME } from "@zcode/shared";
const appThemes = new Set<string>(APP_THEMES);
const aireqThemes = new Set<Theme>(AIREQ_THEMES);
export type ResolvedTheme = "light" | "dark";
export const DEFAULT_THEME = "zai-motion";

const BROWSER_THEME_SURFACE_ATTRIBUTE = "data-zcode-browser-theme-surface";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }

  return theme === "dark" ||
    theme === "zai-dark" ||
    theme === "zai-motion" ||
    theme === "aireq-aurora"
    ? "dark"
    : "light";
}

export function normalizeThemePreference(theme: Theme): Theme {
  if (theme === "dark") return "zai-dark";
  if (theme === "light") return "zai-light";
  return theme;
}

function setThemeMetaContent(name: "theme-color" | "color-scheme", content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

function syncBrowserThemeSurface(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (
    typeof root.hasAttribute !== "function" ||
    !root.hasAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE)
  ) {
    return;
  }

  // Electron 为 vibrancy 保持透明根背景，但普通浏览器需要从文档根和标准 meta
  // 获得页面主题。只切换 React 的 dark class 会让浏览器工具栏、原生控件和 overscroll 留在旧主题。
  root.setAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE, resolved);
  root.style.colorScheme = resolved;
  setThemeMetaContent("color-scheme", resolved);

  const background = getComputedStyle(root).getPropertyValue("--color-background").trim();
  if (background) {
    setThemeMetaContent("theme-color", background);
  }
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  const appliedTheme =
    theme === "system"
      ? resolved === "dark"
        ? "zai-dark"
        : "zai-light"
      : normalizeThemePreference(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  const custom = isAIReqTheme(appliedTheme);
  document.documentElement.classList.toggle("theme-zai-light", resolved === "light");
  document.documentElement.classList.toggle("theme-zai-dark", resolved === "dark");
  document.documentElement.classList.toggle("theme-zai-motion", appliedTheme === "zai-motion");
  for (const variant of AIREQ_THEMES) {
    document.documentElement.classList.toggle(`theme-${variant}`, appliedTheme === variant);
  }
  document.documentElement.classList.toggle("theme-aireq-color", custom);
  syncBrowserThemeSurface(resolved);
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && appThemes.has(value);
}

export function isAIReqTheme(theme: Theme): boolean {
  return aireqThemes.has(theme);
}

export function useTheme(initialTheme: Theme = DEFAULT_THEME) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((t: Theme) => {
    const normalizedTheme = normalizeThemePreference(t);
    setThemeState(normalizedTheme);
    applyTheme(normalizedTheme);
  }, []);

  // 初始化 + system 模式下监听系统偏好变化
  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme } as const;
}
