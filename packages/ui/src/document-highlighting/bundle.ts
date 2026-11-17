import { createBundledHighlighter, createSingletonShorthands } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

export * from "shiki/core";
export { createOnigurumaEngine } from "shiki/engine/oniguruma";
export { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// 第三方 diff 库也从 shiki 根入口读取注册表；构建统一指向此受限 bundle，
// 避免仅限制 UI 选项却仍把全部语法和主题打包。保留 WASM，不改回 JS 正则引擎。
export const bundledLanguages = {
  markdown: () => import("shiki/langs/markdown.mjs"),
  md: () => import("shiki/langs/markdown.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  yml: () => import("shiki/langs/yaml.mjs"),
};
export const bundledLanguagesInfo = [
  { id: "markdown", name: "Markdown", aliases: ["md"], import: bundledLanguages.markdown },
  { id: "json", name: "JSON", aliases: [], import: bundledLanguages.json },
  { id: "yaml", name: "YAML", aliases: ["yml"], import: bundledLanguages.yaml },
];
export const bundledThemes = {
  "github-light": () => import("shiki/themes/github-light.mjs"),
  "github-dark": () => import("shiki/themes/github-dark.mjs"),
};

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createOnigurumaEngine(import("shiki/wasm")),
});

export const { codeToTokens, codeToHast, codeToHtml } =
  createSingletonShorthands(createHighlighter);
