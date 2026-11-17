# 测试规格：纯 Web 证据体系

更新日期：2026-11-16

本仓库是浏览器前端 + 内存模拟后端（见 [项目目标](../project-goal.md)）。测试只覆盖当前存在的工程：
`packages/*` 的浏览器、契约与 mock 服务，以及 `scripts/` 下的工程门禁工具。仓库没有桌面 app、
Agent CLI、CUA producer、Android 工程或浏览器 E2E harness；描述这些对象的命令与文件属于历史记录，
不是当前可执行入口。历史退役决定见文末「App 业务单测退役记录」。

## 1. 现行证据类型

| 证据类型     | 覆盖对象                                                                  | 入口                                                            |
| ------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 工程 Vitest  | 明确清单中的契约、传输适配、配置加载与渲染动作等可实现纯函数/装配断言的点 | `bun run test:engineering`                                      |
| 工程门禁测试 | 架构治理、边界、包入口、依赖扫描配置、退役证据审计等工具行为              | `bun run test:architecture`（Bun runner，兼容 `node:test` API） |
| 浏览器验收   | 保留 UI 的视觉、交互、布局与真实运行时行为                                | `bun run dev` + 真实浏览器操作（见 §4）                         |
| 静态检查     | 类型、Lint、格式、模块边界与架构策略                                      | `bun run typecheck` / `bun run lint` / `bun run fmt:check` 等   |

`bun run knip` 是诊断报告，不是门禁，也不构成删除控件或依赖的理由（见
[依赖与导出扫描治理](dependency-governance.md)）。

### 静态检查的生成缓存边界（2026-11-17）

- 根目录 `.tmp-*/vite-cache/**` 是隔离浏览器验证所用 Vite 的生成依赖缓存，不属于手写源码；Lint 与格式检查使用同一精确路径模式排除，不修改第三方生成文件、关闭规则或忽略整个临时目录。
- 同一目录内的 `backend-check.ts`、`vite.config.ts` 等手写脚本仍参与检查，`packages/` 与 `scripts/` 的既有范围不变。临时缓存可以在验证期间保留，不以删除他人运行目录作为通过检查的前提。
- 验收使用实际全仓 Lint 和本次相关文件的格式检查；类型与变更架构按仓库收口规则执行。已修正的源码格式不重复改写，不追加与问题无关的业务测试或构建。

## 2. 现行命令

以下命令从仓库根目录执行，全部存在于 `package.json`。唯一运行时为 `mise.toml` 固定版本的 Bun；
pnpm 只负责包管理且由 Bun 执行。Vitest 的 `forks` worker 使用当前 Bun 的 `process.execPath`，
并显式继承 `process.execArgv`；`node:test`、`node:*` 仅是兼容 API，不启动 Node.js。

| 用途             | 命令                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 工程 Vitest 全量 | `bun run test:engineering`                                                                                                                   |
| 指定工程文件     | `bun run test:engineering <文件>`                                                                                                            |
| 受影响工程测试   | `bun run test:engineering:affected`，可选 `--scope worktree`、`--scope push`、`--base <commit>`、`--files <files...>`、`--dry-run`、`--json` |
| 工程门禁测试     | `bun run test:architecture`                                                                                                                  |
| 类型检查         | `bun run typecheck`（根 `tsc -b` 覆盖全部 workspace 包与 `packages/shared/tsconfig.testing.json`）                                           |
| Lint / 格式      | `bun run lint`、`bun run fmt:check`                                                                                                          |
| 变更架构检查     | `bun run architecture:check --changed`                                                                                                       |
| 推送前检查       | `bun run verify:pre-push`                                                                                                                    |

`verify:pre-push` 依次执行：工作区干净检查（`scripts/check-push-worktree.mjs`）、Lint、
`bun run test:architecture`、`architecture:check --changed`、受影响工程测试（`--scope push`）。
`.husky/pre-push` 钩子已删除，推送前检查必须手动运行；历史机制见 [Pre-push Hook](pre-push-hook.md)。

## 3. 工程 Vitest 清单

- 唯一注册来源是 [`scripts/engineering-test-files.json`](../../scripts/engineering-test-files.json)；
  根 `vitest.config.ts` 只注册 `engineering` 项目，`include` 直接取该清单，不做目录通配发现。
- 清单条目必须是现存测试文件。指向已删除文件的条目属于登记缺陷：不是当前证据，必须在同一变更内移除，
  且不能用来宣称对应行为仍有覆盖。
- 新增工程测试：先把精确路径写入清单，再运行 `bun run test:engineering` 全量确认；只改单文件不足以证明
  清单完整。
- 公共配置变化（`vitest.config.ts`、`vitest.setup.ts`、`package.json`、清单本身）会强制重跑整个工程套件，
  这是预期行为：受影响选择不会替代全量。

现存可运行测试（按工程分组；以清单中真实存在的条目为准）：

| 工程                       | 文件                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web`             | `test/viteConfigLoad.test.ts`                                                                                                                                                             |
| `packages/shared`          | `src/request-security-edition/contract.test.ts`、`src/zcode-protocol-v4/input-prediction/contract.test.ts`、`test/zcodeProtocolV4InputPrediction.test.ts`                                 |
| `packages/session-control` | `src/contract.test.ts`、`test/client-caller.test.ts`、`test/control.test.ts`、`test/isolation.test.ts`、`test/review-regressions.test.ts`、`test/session-id.test.ts`、`test/wait.test.ts` |

`packages/ui/test/` 只保留测试夹具（如 `providerModelSmartDraftFixture.ts`），不是可执行测试。
以清单文件为准；本表随清单同步。

2026-11-16 当前调用接口收口删除了退役 Host 环境变量开关及其
`packages/services/test/inputPredictionSwitch.test.ts`，同步撤销工程清单登记，不再宣称该开关有现行覆盖。
shared 的输入预测 schema／协议测试继续保留；纯类型存留不代表服务侧开关或 RPC 能力仍开放。
本段仅记录删除边界，不是本轮工程套件通过记录。

## 4. 浏览器验收

- 启动：`bun run dev`（模拟后端 :3031，Vite :5174，`/api`、`/ws` 已代理），在真实浏览器打开
  <http://localhost:5174>。也可 `bun run dev:server` / `bun run dev:web` 分别启动。
- 验收的是**真实界面运行时行为**：相同数据下改动前后的渲染与交互一致，保留 UI 不被自有功能改动，
  仅在电脑浏览器覆盖受影响面，不进行手机屏幕适配或测试。
- 仓库当前没有 Playwright、WebdriverIO 或桌面 E2E harness，也没有 `test:e2e` 类命令。不要声称
  E2E 已运行或通过；`docs/testing/` 中桌面 E2E、WDIO、覆盖矩阵与运行记录属于裁撤前历史证据。
- UI 行为改动：先更新对应 spec，写明可复现的操作路径与预期结果，再实现并按该路径实际验收；交互改动
  先维护验收场景。无法执行时如实说明未执行，不以“无测试可选”当作通过。
- 协议/模拟服务接线改动的验证仍走现有手段：`bun run typecheck` 覆盖 schema 与装配类型，`bun run lint` 与
  `bun run architecture:check --changed` 覆盖边界，行为层面在 `bun run dev` 的真实浏览器中操作对应会话/
  页面确认；仓库没有独立的协议冒烟或自动化协议脚本，不为本次改动新增。

## 5. 架构与开发规则

- managed 模块必需文件为 `module.ts`、`contract.ts`、`contract.example.ts`、`CONTRACT.md`；架构检查继续
  校验模块依赖、分层、公开入口、循环与源码规模，不再要求或自动生成 `contract.test.ts`。
- 生成器不得删除已有测试；模块契约文件存在性检查独立于测试存在性。
- 工程工具有行为改动时，先改对应的工程门禁测试或工程 Vitest，再改实现。
- 不为已删除的单测逐条新建 E2E，也不把原单测覆盖自动标成 E2E 已覆盖。

## 6. 退役证据与历史记录

- `docs/testing/` 的历史覆盖矩阵、`unit-test-review/` 账本和旧运行记录中的 App 单测路径属于退役前证据，
  不表示当前仍有该覆盖；历史用例数与通过记录不改写。
- 现行覆盖文档中的退役证据逐处写 `retired:原路径`；只有退役证据的状态行记为 unit-retired / missing，
  混合证据保留其实际剩余覆盖。`bun run test:architecture` 中的 `scripts/test/retired-app-unit-evidence.test.mjs`
  会审计现行 coverage matrix。
- 机器读取的自动化索引、精确路径白名单、roadmap 与派生统计只声明现行证据；不得把规划文档当作验证证据。
- 不恢复 App 业务单测体系，包括 `packages/server` 的业务单测、`packages/*/test` 通配发现、coverage 配置和
  只为 App 单测服务的 lint-staged 接线。Vitest 与其 patch 因工程测试仍在用而保留。

## 7. 变更测试体系时的验收

1. 记录起点：删除/保留清单，确认产品运行时文件未被误删或改写。
2. 架构检查器仍拒绝缺少 `module.ts` / `contract.ts` / `contract.example.ts` / `CONTRACT.md` 的模块，
   且不要求 `contract.test.ts`；生成器不删除已有测试。
3. 改动 Vitest 清单或配置后运行 `bun run test:engineering` 全量；改动门禁工具后运行 `bun run test:architecture`。
4. 按改动面运行 `bun run typecheck`、`bun run lint`、`bun run fmt:check`、`bun run architecture:check --changed`；
   涉及协议或 mock 装配时同样以这些检查和 §4 的真实浏览器操作为准；UI 行为按 §4 做浏览器验收。
5. 未执行的检查如实报告，不能以“没有测试可选”当作通过。

## 8. App 业务单测退役记录（2026-10-26，历史）

2026-10-26 的决定：App 全链路不再维护独立业务单测。删除桌面、UI、services、共享协议、Web、Provider、
RPC、Client、Server 和 Source Server 中的业务 test/spec 文件，按归属退役，不逐项宣称测试没有价值；
产品运行时代码与行为不变。

当时保留的 Agent CLI（`apps/zcode-cli`）、CUA producer（`packages/zcode-cua`）、桌面 E2E、浏览器验收、
Android 设备验收，以及构建、发布、架构、数据库 schema、E2E 工具等工程测试，多数已随纯 Web 重构一并删除
（桌面、CLI、CUA、Android、E2E 工具）；当前保留项只剩 §1 列出的工程测试与浏览器验收。该次退役
移除 App 的 `test` / `test:unit` / `test:unit:affected` / `test:coverage` 命令、只服务 App 单测的
coverage 配置与 CI job；这些入口至今未恢复。
