export type DocumentLanguage = "markdown" | "json" | "yaml";
export type DocumentTheme = "github-light" | "github-dark";

/** 未保留的编程语言按原文显示，不再请求第三方语法。 */
export function resolveDocumentLanguage(language: string): DocumentLanguage | "text" {
  switch (language.trim().toLowerCase()) {
    case "md":
    case "markdown":
      return "markdown";
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "text";
  }
}

/** 已删除的持久化主题按所在明暗槽恢复为唯一支持的主题。 */
export function resolveDocumentTheme(theme: unknown, mode: "light" | "dark"): DocumentTheme {
  return theme === "github-light" || theme === "github-dark" ? theme : `github-${mode}`;
}
