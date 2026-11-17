# 测试基础设施与当前状态

前端公共函数 UT 位于 `test/ut/`，精确登记到现有 engineering 项目，不加载原型后端、HTTP 或 WebSocket。测试运行器、补丁、配置与初始化继续复用；没有占位断言，也不以静态检查通过代替测试执行。

## 运行入口

| 入口                                | 当前行为                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| `bun run test:st`                   | 显式连接单个真实 HTTP／WS／RPC 服务，串行执行 `test/st/` 套件      |
| `bun run test:st:typecheck`         | 静态检查 ST 用例及测试侧连接辅助                                   |
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
| `requirement-return.test.ts`        | 详情来源保留、历史字段校验、无来源回退及显式对象链接           | [分区导航](../specs/aireq-migration/section-navigation-and-ideas.md)                                                  |
| `remote-data-source.test.ts`        | 前端数据源初始化、失效重读、目标与命令身份及释放 | [连接身份](../specs/aireq-migration/connection-identity.md)、[AIReq UI 契约](../../packages/ui/src/aireq/CONTRACT.md) |

异步场景通过可控 Promise 和公开事件端口安排时序，不用固定 sleep 猜测完成。存储替身只提供浏览器存储语义；服务替身只提供当前被调用的正式端口，不实现另一份业务后端。每例恢复自身替换的全局对象、计时和监听，不修改宿主业务数据。

这批用例验证正式前端行为，不验证原型后端业务、真实认证接线、网络序列化、浏览器渲染、React 导航／保存门禁或真实后端接入。身份隔离用例验证传入前端命名空间后的行为，不代表验证登录系统。隐藏 Skill 或旧工作台专属分支不因存在导出而扩张测试范围。

## 配置与静态检查

[`vitest.config.ts`](../../vitest.config.ts) 要求运行于 Bun，加载 [`vitest.setup.ts`](../../vitest.setup.ts)，保留 UI/Web 路径别名、遥测端点 define 和 Zod inline 转换。engineering 使用 forks、单 worker、文件串行，继承当前 Bun 参数；失败日志保留，通过用例的 console 输出静默。测试与 hook 超时均为 30 秒。

初始化保留 Git 换行设置、Windows tar 路径处理、测试环境默认值、数据目录环境隔离及 homedir mock。这些是测试基础设施，不是产品运行入口。

[`run-affected-engineering-tests.mjs`](../../scripts/run-affected-engineering-tests.mjs) 支持 `--scope worktree|push`、`--base`、`--files`、`--dry-run` 和 `--json`。无选中测试或 dry-run 返回 0；选择整个非空套件时跳过执行并返回 0；测试失败返回 1，脚本错误返回 2。成功退出不必然代表执行过测试。

产品类型检查、Oxlint、格式检查与架构检查仍保留。`architecture:check` 是实际静态分析器，与当前无 case 的 `test:architecture` 不同；模块仍保留 `module.ts`、`contract.ts`、`contract.example.ts`、`CONTRACT.md`，不要求测试骨架。根类型检查与 UT 类型检查分别覆盖产品源码和新增用例。

仓库没有 pre-push 脚本，也没有以手动执行替代该 hook 的门禁要求。生产中的测试验收状态、schema、校验及错误处理不属于自动化测试用例。

## HTTP／WebSocket ST

ST 位于 `test/st/`，仅从独立 `st` project 发现；`test:ut` 和 engineering 不加载网络用例。用例依据现行业务规范与正式 services/shared 契约编写，不导入后端实现、原型数据或前端控制器。套件覆盖 HTTP 接入、身份、广播、辅助读取、原生会话／队列／附件、想法／配置、提案、统计、正式 SR 与分析调度。源码存在不代表这些场景已经通过；以实际运行结果为准。

测试连接已运行的服务，不启动或停止它；默认 `http://localhost:5174`，路径与前端入口相同。全部被测请求走真实 HTTP 或 `/ws` 二进制 Channel RPC，使用现有 `@zcode/client`。串行运行单实例，多个连接只用于同一 case 的身份／事件隔离。服务拒绝或结果违背规则时保留失败，不调整预期迎合原型实现。

| 配置                                     | 含义                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ST_BASE_URL`                            | 服务 origin，默认 `http://localhost:5174`；不自动回退端口                                                                               |
| `ST_EMPLOYEE_ID`／`ST_OTHER_EMPLOYEE_ID` | 默认由 ST 构造合法测试工号 `s00000001`／`s00000002`；正式环境可提供有效测试账号                                                         |
| `ST_REPOSITORY_URL`                      | 用户指定的专用仓库，默认 `https://github.com/jchanghong023/test.git`                                                                    |
| `ST_REPOSITORY_BRANCH`                   | 默认 `main`，须为环境中的真实可用分支                                                                                                   |
| `ST_TOKEN`                               | 可选部署 token，通过正式 HTTP Bearer／WS 查询契约传入；不输出凭据                                                                       |
| `ST_TIMEOUT_MS`                          | 测试、网络调用与有界等待时限，默认 120000 毫秒，覆盖公开多阶段准备及真实服务时钟推进；长流程可配置更长时限                              |
| `ST_FILE_JSON`                           | 可选文件前置：`workspacePath`、可选 `workspaceIdentity`、`path`、`directoryPath`、`missingPath`、`bytesBase64`；未配置时通过公开保存流程创建 |
| `ST_FIXTURES_FILE`                       | JSON 对象，各用途为专用前置对象数组，不得使用无关业务数据                                                                               |
| `ST_ALLOCATION_LOG`                      | 可选消费型前置分配日志路径；默认系统临时目录中按服务／前置清单区分的 JSONL，跨套件及重复执行防止复用                                    |

设置、系统信息、子代理能力与模型目录的组合读取用例通过本例公开创建的提案取得工作区，不依赖 `ST_FILE_JSON`；该配置只用于文件字节／范围读取场景。
文件读取用例未提供 `ST_FILE_JSON` 时，通过本例独立创建项目、Skill 讨论、预览确认和项目保存准备 UTF-8 文件；预期字节取已确认预览，保存后通过文件 RPC 验证，不直接写盘或读取服务端内部数据。若讨论、预览或保存不可用，明确失败；也可提供专用文件配置跳过该准备流程。生成文件随项目保留，不删除环境已有数据。
模型读取用例通过公开会话绑定的 `modelKey` 关联 bootstrap 选项，通过 `providerId/modelId` 查验原生模型选择与 Provider 目录；不把工作流配置 key 当成 Picker 序列化字符串，不假定两个目录的 revision 或默认选择相同。

消费型用途包括 `formalPlanning`、`formalAcceptance`、`formalAcceptanceFailure`、`formalRetest`、`formalCleanup`、`formalCleanupBlocked`、`formalBranchFailure`、`scheduler`。每项提供 `projectId`、`irId`、适用的 `srId`、可选 `releaseId`，分支恢复另需 `expectedBaseCommit`。同一 IR 不分配给多个消费型 case；未配置该用途时通过公开发布、正常合入、分支重试及人工验收流程创建本例对象。明确配置但耗尽或失效时仍报阻塞，不静默换用其他资源。`media` 可配置自己的路径、类型和字节，未配置时通过公开保存的 SVG 产物准备；测试不按后端类型分支。

用户允许通过接口新增测试数据，但不得删除已有数据。新建项目、Release 和提案记录到本轮系统临时目录的资源清单；只有本轮通过公开创建流程登记的 IR 才能执行删除需求或分支清理。环境原有正式 IR 即使列入前置池，也不能据此授权删除其分支；清理场景必须额外满足本轮创建归属，否则阻塞。没有公开删除路径的测试数据保留并在交付中说明，不直接改库或调用 reset。

全局配置测试先读基线，按版本与内容确认仍拥有自身修改后恢复；外部并发变化不强行覆盖。所有 socket 在构造时登记，超时关闭 CONNECTING／OPEN 连接并拒绝迟到接管；SDK 异常先脱敏，不能把带 token 的原错误链交给 runner。测试侧代理只加生命周期和诊断边界，不更改业务返回值或模拟服务。

队列前置先关闭自动续跑，再发送前台输入并紧接提交独立排队输入；发送前不逐项轮询 running。原生发送辅助仅为协议要求且未显式提供的 revision／epoch 补读快照，普通发送不增加 resync 往返，显式旧水位仍原样提交。只有前台 ACK 为 startNow、全部后续 ACK 为 queue 且权威队列保留各自 Submission 时才继续。执行窗口仍不足时明确失败，不延长后端耗时、不重试写操作或用测试私有状态造队列。

长流程依赖服务实际完成材料和评审。所有依赖可由服务端内存实现模拟，测试仍只能通过公开业务操作和读取准备正式对象、失败分支、代码合入及待复测；不得调用内部 setter 或直接改库。自动分钟接纳、外部输入变化后的迟到结果和真实执行失败目前没有独立正向覆盖，不能用手动分析成功替代。ST 不验证浏览器 UI 和真实后端内部实现，也不把服务不可达、前置不足或测试源码生成当作验收成功。
