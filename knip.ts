import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { KnipConfig } from "knip";

const webRoot = resolve(import.meta.dirname, "packages/web");
const externalUrl = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;
const toImport = (path: string) => `import ${JSON.stringify(path)};`;

function localPath(ref: string) {
  return ref.startsWith("/")
    ? resolve(webRoot, ref.slice(1)).replaceAll("\\", "/")
    : ref.startsWith(".")
      ? ref
      : `./${ref}`;
}

// Knip 分析模块引用；把样式的静态资源和 Tailwind 插件引用转成等价的导入。
function compileCss(source: string, path: string) {
  const imports: string[] = [];
  const refs = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(
      /@(?:import|plugin)\s*(["'])([^"']+)\1|url\(\s*(?:(["'])([^"']+)\3|([^)\s]+))\s*\)/gi,
    );
  for (const [, , quotedImport, , quotedUrl, bareUrl] of refs) {
    const ref = quotedImport ?? quotedUrl ?? bareUrl;
    if (!ref || externalUrl.test(ref)) continue;
    const isLocal = !quotedImport || /^[./]/.test(ref) || existsSync(resolve(dirname(path), ref));
    imports.push(toImport(isLocal ? localPath(ref) : ref));
  }
  return imports.join("\n");
}

function compileHtml(source: string) {
  const imports: string[] = [];
  const markup = source.replace(/<!--[\s\S]*?-->/g, "");
  for (const [tag] of markup.matchAll(/<(?:script|link|img|audio|video|source|iframe)\b[^>]*>/gi)) {
    for (const [, , ref] of tag.matchAll(/\s(?:src|href|poster)\s*=\s*(["'])([^"']+)\1/gi)) {
      if (ref && !externalUrl.test(ref)) imports.push(toImport(localPath(ref)));
    }
  }
  return imports.join("\n");
}

const opaqueAsset = () => "";

export default {
  tags: ["-lintignore"],
  compilers: {
    css: compileCss,
    html: compileHtml,
    png: opaqueAsset,
    svg: opaqueAsset,
    mp3: opaqueAsset,
    sql: opaqueAsset,
  },
  workspaces: {
    ".": {
      entry: ["scripts/licenses.mjs"],
      ignoreDependencies: ["concurrently", "oxfmt", "oxlint"],
    },
    "packages/server": {
      entry: ["src/entry-http.ts!"],
    },
    "packages/web": {
      entry: ["index.html!", "chat/index.html!"],
    },
  },
} satisfies KnipConfig;
