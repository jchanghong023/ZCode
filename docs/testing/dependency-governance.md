# 依赖与导出扫描治理（Knip）

本文说明 `bun run knip` 在本仓库的定位、可执行命令、报告解读规则，以及为什么部分 UI 控件与架构治理产物被配置成入口而不是忽略。依赖版本与增删以各 `package.json` 和 lockfile 为准，本文不复写 manifest 内容。

工程脚本统一通过 `bun run <脚本>` 执行；Bun 是前端、模拟后端与工程脚本的统一运行时。pnpm 仅负责依赖管理，通过 `bun x --bun --package pnpm@10.33.2 pnpm <命令>` 显式选择固定包，避免系统 pnpm / Corepack shim。工具版本与首装门禁见 [Web 构建工作流](../architecture/web-build-workflow.md)。

## 定位与门禁边界

- `bun run knip` 是**诊断报告**，不是自动删除清单，也不在当前 `bun run verify:pre-push` 门禁链路中。
- 有发现时 Knip 以非零码退出属正常行为；阅读报告即可，禁止用 `--no-exit-code` 或包装脚本把发现伪造成通过。
- 真正阻断门禁的检查：
  - `bun run verify:pre-push`：工作区、Lint、架构工具测试、变更架构检查、受影响工程测试。
  - `bun run test:architecture`：Bun 执行的工程门禁测试（允许 Bun 的 `node:*` 兼容 API），具体文件以根 `package.json` 的脚本为准。
  - `bun run architecture:check --changed`：模块边界与治理产物检查，并校验包 `exports`/`imports` 是否指向真实文件、通配是否为空、条件分支是否悬空。
- Knip 报告与上述门禁互补：门禁保护“声明入口必须真实”，Knip 发现“代码图里可能没人引用的文件、导出与依赖”。
- 根 workspace 的 `entry` 覆盖现有工程测试 `scripts/*.test.mjs` 与 `scripts/test/*.test.mjs`，让这些测试实际使用的审计工具依赖进入扫描图；不新增用例，也不把历史业务脚本升级为运行时入口。

## 可执行命令

```sh
# 全仓报告（默认 symbols reporter）
bun run knip

# 单 workspace
bun run knip --workspace packages/ui

# 只看某一类问题
bun run knip --include files
bun run knip --include dependencies
bun run knip --include exports,types

# 供脚本消费的结构化输出
bun run knip --reporter json
```

导出是否还有其他引用者，用符号级查询确认，不要只凭 Knip 的文件级结论删除：

```sh
bun run dep:refs <file>:<exportName>
bun run dep:refs --list-exports <file>
```

`dep:refs` 仅做静态分析，不识别动态 `import()` 与字符串路径；Knip 会解析字面量 `import()`，两者结论不一致时以运行时证据和逐项审查为准。

## 报告分类与处理

| 报告项                             | 含义                           | 处理规则                                                                                   |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `files`                            | 项目文件不在入口可达的依赖图内 | 业务文件逐项确认 owner、入口与 `dep:refs` 结论后再决定；保留控件与治理产物不应出现在此列表 |
| `exports` / `types`                | 文件内导出没有外部引用         | 公共 API 先查 `dep:refs`；不能因为报告存在就删除                                           |
| `dependencies` / `devDependencies` | manifest 声明但代码图未消费    | 先排除 CSS `@import`/`@plugin`、脚本参数、动态导入等静态图盲区，再与 manifest 所有者确认   |
| `unlisted`                         | 代码引用了未声明依赖           | 真实缺失，补声明；不要用 `ignoreDependencies` 掩盖                                         |
| `unresolved`                       | 导入无法解析                   | 修别名、入口或路径；不要写入 `ignoreUnresolved`                                            |
| `binaries`                         | 脚本里调用了未声明的可执行文件 | 修脚本或补依赖声明                                                                         |

manifest 的增删由 `package.json` 所有者执行；`pnpm-lock.yaml` 由集成方统一更新。本文只描述判定规则，不复制依赖清单。

## 保留资产：用入口表达，不用 ignore

依据 `AGENTS.md` 与 `docs/project-goal.md` 的控件保留规则，以下资产即使当前无引用也保留：

- `packages/ui/src/components/ui/*.tsx`：shadcn/Radix 基础控件全集。
- `packages/ui/src/components/mobile-ui/*.{ts,tsx}`：存量兼容控件与契约；保留不代表支持手机屏幕，不要求手机适配或测试。
- `packages/ui/src/components/ai-elements/*.tsx`：消息、Markdown、代码块等通用 AI 展示控件。
- `packages/ui/src/components/icons/*.ts`、`components/lib/*.ts` 及 `components/` 根下的图标、徽标、文本溢出等通用控件。
- 各受管模块的 `module.ts` / `contract.example.ts`：`architecture:check` 按磁盘约定要求的治理产物，不是运行时代码导入。

实现方式：

- 这些路径写入对应 workspace 的 `entry`。Knip 会继续遍历它们导入的模块，因此仅被这些控件使用的依赖仍会被判定为已使用。
- `includeEntryExports` 保持默认 `false`：控件库的导出是面向后续页面的资产，不按“当前无引用”报未使用导出；其它文件的未使用导出仍正常报告。
- 不使用 `ignore`：`ignore` 只是把文件从问题报告里排除；未被入口引用的文件不会因此获得依赖图遍历，其导入也就无法证明依赖仍在使用。
- 治理产物的 `entry` 只表示“静态分析根 + 磁盘治理资产”，不表示运行时入口，也不改变 `architecture-policy.yaml` 的模块登记。

业务组件不进入上述保留集合。`packages/ui/src/components/` 下的 `cloud-content-dialog`、`coding-plan-quota-reset`、`workflow-graph`、`workflow-run-line`、`workflow-timeline` 等按业务代码处理；若无引用，Knip 应把它们报出来供逐项审查，而不是通过宽泛 ignore 或删除控件让报告变绿。

## 根 workspace 与 11 个子包的入口依据

Knip 会自动发现 pnpm workspace；`knip.json` 的 `workspaces` 是**按 workspace 覆盖配置**，不是白名单。没有覆盖项的包使用默认入口、`package.json` 的 `exports`/`imports` 或插件解析结果。

| workspace                   | 依赖图入口                                                                      | 依据                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`（根）                   | 包脚本声明的运维脚本 + Vitest 测试文件                                          | 根 `package.json` 的 `scripts`、`mise.toml` 任务，以及 `THIRD-PARTY-NOTICES.md` 生成说明登记的手动入口；`vitest` 插件把 `*.test.*` 作为入口 |
| `packages/client`           | `exports`：`.`、`./globals`                                                     | 浏览器连接 SDK 公共入口                                                                                                                     |
| `packages/design-runtime`   | `exports`：`.`；`src/module.ts`、`src/contract.example.ts`                      | 公共类型与设计调试运行时契约                                                                                                                |
| `packages/model-option-map` | `exports`：`.`                                                                  | 模型选项编译公共入口                                                                                                                        |
| `packages/provider`         | `exports`：`.`                                                                  | provider 接口公共入口                                                                                                                       |
| `packages/rpc`              | `exports`：`.`；`examples/*.ts`                                                 | `demo:*` 脚本直接执行的示例程序                                                                                                             |
| `packages/server`           | `exports`：`.`；显式 `entry: src/entry-http.ts`                                 | 包入口 + Bun 构建/开发脚本的实际 HTTP 入口；移除后端打包器配置后仍保持可达                                                                  |
| `packages/services`         | `exports`：`.`                                                                  | 服务契约层公共入口                                                                                                                          |
| `packages/session-control`  | `exports` 四个子路径；`src/module.ts`、`src/contract.example.ts`                | 公共契约 + 治理产物                                                                                                                         |
| `packages/shared`           | `exports` 各子路径；`src/**/module.ts`、`src/**/contract.example.ts`            | 共享协议子入口 + 治理产物                                                                                                                   |
| `packages/ui`               | `exports`（含 `./styles.css`、`./replay` 等）；保留控件 glob；治理产物          | 组件库公共入口与保留控件资产                                                                                                                |
| `packages/web`              | Vite 插件从 `index.html` 解析；`src/**/module.ts`、`src/**/contract.example.ts` | 浏览器应用入口 + 治理产物                                                                                                                   |

补充说明：

- **CSS**：`packages/ui/src/styles.css` 与 `packages/web/src/styles.css` 通过 Tailwind 编译器把 `@import`/`@plugin` 转为依赖边，因此 `tailwind-scrollbar-hide`、`shadcn`、`katex`、`lucide-colors.mjs` 等按 CSS 消费计入使用；CSS 文件本身不需要额外 `entry`。
- **动态导入**：仓库内没有需要 `ignoreUnresolved` 兜底的表达式式动态导入；字面量 `import()` 由 Knip 正常解析。
- **测试**：根 workspace 启用 `vitest` 插件后，插件沿 workspace 祖先继承到各包，`*.test.*`、`*.spec.*` 作为入口；测试清单仍以 `scripts/engineering-test-files.json` 为准。
- **构建/开发脚本**：`server` 的 `src/entry-http.ts` 是 Bun build 与 Bun watch 的非导出入口，显式登记在 Knip `entry`；`web` 由 Vite 插件解析 `index.html`，不重复登记同类入口。Bun 是工具链可执行文件，由 mise 固定，不作为 npm 依赖补装。

## 已知诊断项（不代表可删除）

以下内容会按规则出现在报告里，需要 owner 逐项判断：

- `packages/ui/src/components/` 下不进入保留集合的业务组件（如 `cloud-content-dialog`、`coding-plan-quota-reset`、`workflow-graph`、`workflow-run-line`、`workflow-timeline`）在无引用时进入 `files`；这正是本配置要恢复的可见性。
- 根 `scripts/deterministic-tar-archive.mjs`、`scripts/builtin-provider-config.mjs` 目前没有被 `package.json`、`mise.toml`、测试或其它脚本引用，会作为真实 unused file 出现；确认用途前不得为消除报告添加 `ignore`。
- 53 条既有“缺 module 产物”baseline 由架构基线负责，不在 Knip 配置中补空壳或降级。
- 根 `ignore` 仅保留 `.agents/**` 与 `docs/**`：它们是技能/文档示例资产（如 `.agents/skills/ai-elements/scripts/*.tsx`），不属于产品源码依赖图；任何 `packages/**` 产品源码都不在全局 ignore 中。

## 变更规则

- 新增 `ignore` / `ignoreDependencies` 必须给出中文原因、影响范围与 owner；禁止批量添加、禁止用它们抹掉真实业务问题。
- 不通过批量 `managed: false`、新增 baseline 或删除源码来让扫描变绿；53 条既有缺产物 baseline 不在本扫描规则内处理。
- 新增包入口时优先修 `exports`/`imports`；只有脚本、示例、控件资产、治理产物这类非导出入口才写 `entry`，并同步更新本文件。
- 控件“当前无引用”不等于可删除；业务组件删除前必须有 owner 确认与 `dep:refs` 证据。
