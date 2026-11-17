# 测试基础设施与当前状态

前端公共函数 UT 位于 `test/ut/`，精确登记到现有 engineering 项目，不加载原型后端、HTTP 或 WebSocket。测试运行器、补丁、配置与初始化继续复用；没有占位断言，也不以静态检查通过代替测试执行。

## 运行入口

| 入口                                | 当前行为                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| `bun run test:ut`                   | 执行 `test/ut/` 中已登记的前端 UT                                  |
| `bun run test:ut:typecheck`         | 检查前端 UT 的 TypeScript 类型，不生成产物                         |
| `bun run test:engineering`          | 执行 engineering 精确清单中的全部测试                              |
| `bun run test:engineering:affected` | 使用 Vitest 官方依赖选择；空选择、dry-run 或整套跳过不表示执行通过 |
| `bun run test:architecture`         | Bun 按 `./scripts/test` 发现测试，`--timeout 0`；当前无 case       |
| session-control 包的 `test`         | 保留包内 Vitest 配置和命令，当前无用例                             |

根命令见 [`package.json`](../../package.json)，精确登记见 [`engineering-test-files.json`](../../scripts/engineering-test-files.json)。新增文件须登记，不依靠全仓 glob 自动发现。`test/ut/tsconfig.json` 只检查用例，产品源码仍由根 `typecheck` 检查。

## 前端 UT 范围

断言依据现行产品与协议规则，测试现有导出函数和类的公开方法，不导出或直接调用私有辅助函数，不把实现输出当作业务预期。发现实现与规则冲突时保留有效失败断言并报告，不弱化预期或擅自修产品行为。

| 测试文件（相对 `test/ut/`）         | 被测前端行为                                     | 规则依据                                                                                                              |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `csv.test.ts`                       | CSV 原文、引用换行、重复提示、非法输入与物理行号 | [想法与导入](../specs/aireq-migration/section-navigation-and-ideas.md)                                                |
| `settings-search.test.ts`           | 中文、拼音、大小写／全角归一化和顺序模糊匹配     | [工具与设置](../specs/aireq-migration/tools-settings.md)                                                              |
| `pane-tabs.test.ts`                 | 打开复用、关闭邻项、选择、拖动与输入状态保留     | [统一右侧工作区](../specs/aireq-migration/unified-side-pane.md)                                                       |
| `attachment-upload.test.ts`         | 上传字节、分片、摘要、续传、取消及失败清理       | [原生讨论与附件](../specs/aireq-migration/conversation.md)、现行 Protocol v4 附件契约                                 |
| `composer-draft.test.ts`            | 草稿恢复、命名空间隔离、窄清除与存储失败         | [原生讨论与附件](../specs/aireq-migration/conversation.md)                                                            |
| `pending-command.test.ts`           | 回执不明、查询对账、迟到回执与恢复线索生命周期   | [原生讨论与附件](../specs/aireq-migration/conversation.md)                                                            |
| `pending-command-workspace.test.ts` | 命令恢复记录的工作区隔离及输入副本               | [连接身份](../specs/aireq-migration/connection-identity.md)                                                           |
| `remote-data-source.test.ts`        | 前端数据源初始化、失效重读、目标与命令身份及释放 | [连接身份](../specs/aireq-migration/connection-identity.md)、[AIReq UI 契约](../../packages/ui/src/aireq/CONTRACT.md) |

异步场景通过可控 Promise 和公开事件端口安排时序，不用固定 sleep 猜测完成。存储替身只提供浏览器存储语义；服务替身只提供当前被调用的正式端口，不实现另一份业务后端。每例恢复自身替换的全局对象、计时和监听，不修改宿主业务数据。

这批用例验证正式前端行为，不验证原型后端业务、真实认证接线、网络序列化、浏览器渲染、React 导航／保存门禁或真实后端接入。身份隔离用例验证传入前端命名空间后的行为，不代表验证登录系统。隐藏 Skill 或旧工作台专属分支不因存在导出而扩张测试范围。

## 配置与静态检查

[`vitest.config.ts`](../../vitest.config.ts) 要求运行于 Bun，加载 [`vitest.setup.ts`](../../vitest.setup.ts)，保留 UI/Web 路径别名、遥测端点 define 和 Zod inline 转换。engineering 使用 forks、单 worker、文件串行，继承当前 Bun 参数；失败日志保留，通过用例的 console 输出静默。测试与 hook 超时均为 30 秒。

初始化保留 Git 换行设置、Windows tar 路径处理、测试环境默认值、数据目录环境隔离及 homedir mock。这些是测试基础设施，不是产品运行入口。

[`run-affected-engineering-tests.mjs`](../../scripts/run-affected-engineering-tests.mjs) 支持 `--scope worktree|push`、`--base`、`--files`、`--dry-run` 和 `--json`。无选中测试或 dry-run 返回 0；选择整个非空套件时跳过执行并返回 0；测试失败返回 1，脚本错误返回 2。成功退出不必然代表执行过测试。

产品类型检查、Oxlint、格式检查与架构检查仍保留。`architecture:check` 是实际静态分析器，与当前无 case 的 `test:architecture` 不同；模块仍保留 `module.ts`、`contract.ts`、`contract.example.ts`、`CONTRACT.md`，不要求测试骨架。根类型检查与 UT 类型检查分别覆盖产品源码和新增用例。

仓库没有 pre-push 脚本，也没有以手动执行替代该 hook 的门禁要求。生产中的测试验收状态、schema、校验及错误处理不属于自动化测试用例。
