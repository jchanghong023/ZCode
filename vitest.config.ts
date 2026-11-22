import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
process.env.ST_RUN_ID = randomUUID();
import { defineConfig } from "vitest/config";

if (!process.versions.bun) throw new Error("Vitest must run under Bun");

export default defineConfig({
  // 为测试固定遥测端点。
  define: {
    __ZCODE_TELEMETRY_REPORT_ENDPOINT__: JSON.stringify("https://zcode.z.ai/api/v1/event/report"),
  },
  resolve: {
    alias: [
      ...Object.entries({
        "@zcode/client": "packages/client/src/index.ts",
        "@zcode/services/aireq": "packages/services/src/aireq/index.ts",
        "@zcode/shared/zcode-protocol-v4": "packages/shared/src/zcode-protocol-v4/index.ts",
        "@zcode/services": "packages/services/src/index.ts",
        "@zcode/shared": "packages/shared/src/index.ts",
        "@zcode/rpc": "packages/rpc/src/index.ts",
        "@zcode/provider": "packages/provider/src/index.ts",
      }).map(([name, path]) => ({
        find: new RegExp(`^${name}$`),
        replacement: resolve(__dirname, path),
      })),
      { find: "@", replacement: resolve(__dirname, "packages/ui/src") },
      { find: "@web", replacement: resolve(__dirname, "packages/web/src") },
    ],
  },
  test: {
    // Bun 原生 Zod namespace 含 __esModule；Vitest 将其误当 CJS 展平后会丢失命名导出 z。
    // 仅让 Zod 经 Vite 的 ESM 转换，保留其他依赖既有的 CJS interop 与测试语义。
    server: {
      deps: { inline: ["zod"] },
    },
    // 隐藏通过用例的日志，保留失败诊断。
    silent: "passed-only",
    hookTimeout: 30_000,
    maxWorkers: 4,
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "st",
          include: ["test/st/*.test.ts"],
          pool: "forks",
          execArgv: process.execArgv,
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: Number(process.env.ST_TIMEOUT_MS) || 120_000,
          hookTimeout: Number(process.env.ST_TIMEOUT_MS) || 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: "engineering",
          include: ["test/ut/*.test.ts"],
          pool: "forks",
          // Vitest forks 使用当前 process.execPath；显式保留 Bun 启动参数，不回退到 Node。
          execArgv: process.execArgv,
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});
