import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { thirdPartyNoticesVitePlugin } from "../../scripts/third-party-notices.mjs";
// Bugfix: Vite 配置在 Node 加载期执行，不能导入 @zcode/shared 根入口。
// 根入口包含 NodeNext 风格的源码 re-export，Node 会按真实文件查找 .js 并在 bootstrap 阶段失败。
import { resolveRuntimeZCodeEndpointOrigin } from "@zcode/shared/zcodeEndpoint";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const { version, zcodeCompatibility } = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8"),
) as { version: string; zcodeCompatibility?: { minCompatibleVersion?: string } };
const minCompatibleVersion = zcodeCompatibility?.minCompatibleVersion ?? version;

function resolveZCodeEnv(value: string | undefined): "test" | "production" {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

export default defineConfig(({ mode }) => {
  // `.env*` 只提供链接常量；当前产品环境由启动脚本或 CI 注入 ZCODE_ENV。
  // 启动脚本通过 process.env 显式选择 test/production；它必须优先于 .env 文件，
  // 否则 share:test 可能被 mode 的旧配置误解析到错误 endpoint。
  const env = { ...loadEnv(mode, REPO_ROOT, ""), ...process.env };
  const zcodeEnv = resolveZCodeEnv(env.ZCODE_ENV);
  const endpointEnv = {
    ...env,
    ZCODE_ENV: zcodeEnv,
  };
  const zcodeEndpointOrigin = resolveRuntimeZCodeEndpointOrigin(endpointEnv);

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "katex-woff2-only",
        enforce: "pre",
        transform(source, id) {
          if (!id.endsWith(".css")) return;
          // Tailwind 先展开 KaTeX 的 @import；只移除旧字体格式，保留原样式和 WOFF2。
          // 在 Vite 收集字体 URL 前裁剪，避免构建后删文件留下失效引用。
          const code = source.replace(
            /,\s*url\([^)]*KaTeX_[^)]*\.(?:woff|ttf)["']?\)\s*format\(["'](?:woff|truetype)["']\)/g,
            "",
          );
          return code === source ? undefined : { code, map: null };
        },
      },
      thirdPartyNoticesVitePlugin(),
    ],
    resolve: {
      alias: [
        // 修复 UI 组件库中的 @ 别名解析失败。
        // 问题原因：packages/ui 的源码直接被 web 应用交给 Vite 打包，但 web 自己没声明 @ -> packages/ui/src，
        // 所以像 "@/components/lib/utils" 这类导入会在运行时构建阶段报找不到模块。
        // 这里把别名补到消费方 Vite 配置里，保持现有组件源码不动，影响面最小。
        { find: "@", replacement: resolve(__dirname, "../ui/src") },
        // Recharts 依赖 d3-shape@3.x，后者需要 d3-path 的 Path 导出。
        // hoisted node_modules 可能把 d3-shape 旁边的旧 d3-path@1.x 暴露给 Vite 预构建，
        // 导致桌面/Web dev 都在依赖优化阶段失败；显式指向根部 3.x 入口以固定解析边界。
        {
          find: "d3-path",
          replacement: resolve(__dirname, "../../node_modules/d3-path/src/index.js"),
        },
      ],
    },
    server: {
      port: 5174,
      proxy: {
        // main 使用独立后端端口，避免同时运行 base 时代理到另一套内存状态。
        "/ws": { target: "ws://localhost:3031", ws: true },
        "/api": { target: "http://localhost:3031" },
      },
    },
    optimizeDeps: {
      // 修复：在依赖预构建阶段显式加入 react 相关入口，避免 rolldown 解析 `react/jsx-runtime`
      // / `react/jsx-dev-runtime` 时返回无后缀路径导致的加载失败（UNLOADABLE_DEPENDENCY）。
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
      // 当成依赖预构建并崩溃，pdf-viewer 动态导入随之 504；排除后直接按源文件提供。
    },
    worker: {
      rollupOptions: {
        // @pierre/diffs 的 worker 入口依赖 import 后注册 message 监听。
        // 它的 package sideEffects 漏声明会让生产 worker 子构建被摇成 0B；
        // 只关闭 worker 构建的摇树，避免影响主包。
        treeshake: false,
      },
    },
    define: {
      __ZCODE_VERSION__: JSON.stringify(version),
      __ZCODE_MIN_COMPATIBLE_VERSION__: JSON.stringify(minCompatibleVersion),
      __ZCODE_COMMIT__: JSON.stringify(env.ZCODE_COMMIT || "unknown"),
      __ZCODE_ENV__: JSON.stringify(zcodeEnv),
      "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify(zcodeEndpointOrigin),
      // 兼容旧 Web runtime 读取名；新代码统一读 VITE_ZCODE_BASE_URL。
      "import.meta.env.VITE_ZCODE_ENDPOINT_ORIGIN": JSON.stringify(zcodeEndpointOrigin),
    },
    build: {
      // hidden 仍会产出可公开下载的源码映射；生产不生成，开发调试继续保留。
      sourcemap: mode !== "production",
    },
  };
});
