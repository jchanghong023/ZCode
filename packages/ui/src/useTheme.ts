import { useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark" | "zai-light" | "zai-dark" | "zai-motion" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "zcode-theme";
const BROWSER_THEME_SURFACE_ATTRIBUTE = "data-zcode-browser-theme-surface";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return getSystemTheme();
  }

  return theme === "dark" || theme === "zai-dark" || theme === "zai-motion" ? "dark" : "light";
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
  document.documentElement.classList.toggle("theme-zai-light", appliedTheme === "zai-light");
  document.documentElement.classList.toggle(
    "theme-zai-dark",
    appliedTheme === "zai-dark" || appliedTheme === "zai-motion",
  );
  document.documentElement.classList.toggle("theme-zai-motion", appliedTheme === "zai-motion");
  syncBrowserThemeSurface(resolved);
}

function isTheme(value: string | null): value is Theme {
  return (
    value === "light" ||
    value === "dark" ||
    value === "zai-light" ||
    value === "zai-dark" ||
    value === "zai-motion" ||
    value === "system"
  );
}

export function readThemePreference(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? normalizeThemePreference(saved) : "zai-motion";
  } catch {
    // 根因：opaque-origin 等环境连存储属性访问都会抛错；入口和 hook 必须共用安全读取，
    // 否则入口已回退深色，工号页挂载时仍会白屏，遮住业务存储失败提示。
    return "zai-motion";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readThemePreference);

  const setTheme = useCallback((t: Theme) => {
    const normalizedTheme = normalizeThemePreference(t);
    try {
      localStorage.setItem(STORAGE_KEY, normalizedTheme);
    } catch {
      // 主题持久化被拒绝不应阻断当前页切换；工号保存及失败提示仍由入口 owner 负责。
    }
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
