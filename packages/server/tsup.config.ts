import { defineConfig } from "tsup";

// 模拟后端构建：workspace 包以源码形式被引用，必须内联进产物；
// 其余依赖交给 Node 原生加载。
export default defineConfig({
  entry: { "entry-http": "src/entry-http.ts" },
  outDir: "dist",
  format: "esm",
  platform: "node",
  removeNodeProtocol: false,
  target: "node22",
  noExternal: [
    // workspace 包以源码 .ts 形式发布（exports 指向 src），且内部使用 .js 后缀的
    // TS ESM 导入——Node 无法直接解析，必须内联进产物。
    "@zcode/shared",
    "@zcode/rpc",
    "@zcode/services",
    "@zcode/provider",
    "@zcode/session-control",
    "@zcode/model-option-map",
  ],
  external: ["hono", "@hono/node-server", "@hono/node-ws", "ws"],
});
