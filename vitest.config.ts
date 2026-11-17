import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
process.env.ST_RUN_ID = randomUUID();
import { configDefaults, defineConfig } from "vitest/config";

import engineeringTestFiles from "./scripts/engineering-test-files.json";

if (!process.versions.bun) throw new Error("Vitest must run under Bun");

export default defineConfig({
  // 测试固定注入事件上报端点，使遥测上报链路在单测中可验证；真实构建由 scripts/build-time-config.mjs 决定。
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
    setupFiles: ["./vitest.setup.ts"],
    // Bun 原生 Zod namespace 含 __esModule；Vitest 将其误当 CJS 展平后会丢失命名导出 z。
    // 仅让 Zod 经 Vite 的 ESM 转换，保留其他依赖既有的 CJS interop 与测试语义。
    server: {
      deps: { inline: ["zod"] },
    },
    // 官方依赖图不追踪 setupFiles；公共配置变化必须明确选中整个工程套件并报告跳过。
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      "**/{vitest,vite}.config.*",
      "**/vitest.setup.ts",
      // managed worktree 路径含 .codex，globstar 默认不匹配隐藏目录；关键入口用精确绝对路径。
      ...[
        "package.json",
        "vitest.config.ts",
        "vitest.setup.ts",
        "scripts/engineering-test-files.json",
      ].map((file) => resolve(__dirname, file)),
    ],
    // 修复原因：全量 run 的 stdout 会把**通过**测试里的 console 输出一并转发——services 层
    // 用 createServiceLogger 的用例在绿态下也要刷几千行多行日志，全量输出因此膨胀到
    // ~3.3MB，超过 CI/工作流门禁对单条命令 256KB 的 stdout 上限，导致门禁整条命令被判
    // 「无法执行」而非测试失败。passed-only 只隐藏通过测试的 console，失败用例的日志与
    // 断言 diff 原样保留（诊断能力不降级）；全绿时输出收敛到 ~140KB。
    silent: "passed-only",
    // 修复原因：全量单测并发跑 Git、zip、Electron 模块导入时，默认 5s 超时在低配或高负载机器上
    // 容易被提前打穿（spawn git 子进程、模块 import 变慢 → flaky 超时）；中断后的文件句柄清理在
    // Windows 上还会触发 EPERM/ENOTEMPTY。此前只给 Windows 放宽，但 macOS/Linux 低配机同样会因
    // 内存抖动（swap thrashing）拖慢 spawn，故统一降低并发并放宽超时。
    hookTimeout: 30_000,
    maxWorkers: 4,
    testTimeout: 30_000,
    // 现有 engineering 项目按明确清单运行，包含 test/ut 的前端公共函数测试。
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
          sequence: { sequencer: resolve(__dirname, "test/st/sequencer.ts") },
          testTimeout: Number(process.env.ST_TIMEOUT_MS) || 120_000,
          hookTimeout: Number(process.env.ST_TIMEOUT_MS) || 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: "engineering",
          include: engineeringTestFiles,
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
