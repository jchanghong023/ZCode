# 测试基础设施与当前状态

当前没有自动化测试用例或专用夹具。测试运行器、依赖、补丁、配置、初始化和通用辅助仍保留；没有占位断言，也不以“无测试”表示验证通过。

## 保留入口

| 入口                                | 当前行为                                                         |
| ----------------------------------- | ---------------------------------------------------------------- |
| `bun run test:architecture`         | Bun 按 `./scripts/test` 目录发现测试，`--timeout 0`；当前无 case |
| `bun run test:engineering`          | Bun 执行 Vitest 的 `engineering` project；精确登记清单为 `[]`    |
| `bun run test:engineering:affected` | 使用 Vitest 官方依赖选择，当前无可选用例                         |
| session-control 包的 `test`         | 保留包内 Vitest 配置和命令，当前无用例                           |

根命令见 [`package.json`](../../package.json)，工程测试登记见 [`engineering-test-files.json`](../../scripts/engineering-test-files.json)。

## 配置

[`vitest.config.ts`](../../vitest.config.ts) 要求运行于 Bun，加载 [`vitest.setup.ts`](../../vitest.setup.ts)，保留 UI/Web 路径别名、遥测端点 define 和 Zod inline 转换。工程项目使用 forks、单 worker、文件串行，继承当前 Bun 参数；失败日志保留，通过用例的 console 输出静默。测试与 hook 超时均为 30 秒。

初始化保留 Git 换行设置、Windows tar 路径处理、测试环境默认值、数据目录环境隔离及 homedir mock。这些是测试基础设施，不是产品运行入口或现有覆盖证据。

[`run-affected-engineering-tests.mjs`](../../scripts/run-affected-engineering-tests.mjs) 支持 `--scope worktree|push`、`--base`、`--files`、`--dry-run` 和 `--json`。无选中测试或 dry-run 返回 0；选择整个非空套件时跳过执行并返回 0；测试失败返回 1，脚本错误返回 2。成功退出不必然代表执行过测试。

## 静态检查边界

类型检查、Oxlint、格式检查与架构检查仍保留。`architecture:check` 是实际静态分析器，与当前无 case 的 `test:architecture` 不同；模块仍登记 `module.ts`、`contract.ts`、`contract.example.ts`、`CONTRACT.md`，不要求测试骨架。

仓库没有 pre-push 脚本，也没有以手动执行替代该 hook 的门禁要求。生产中的测试验收状态、schema、校验及错误处理不属于自动化测试用例。
