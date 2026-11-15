import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (!process.versions.bun) throw new Error("Vitest must run under Bun");

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    name: "session-control",
    environment: "node",
    pool: "forks",
    // fork 默认使用当前 Bun 的 process.execPath，并继承同一套运行参数。
    execArgv: process.execArgv,
    // 避免 Vitest 对 Bun 原生 Zod namespace 的 __esModule 标记执行 CJS 展平。
    server: {
      deps: { inline: ["zod"] },
    },
    setupFiles: [],
    include: ["test/**/*.test.ts", "src/**/contract.test.ts"],
  },
});
