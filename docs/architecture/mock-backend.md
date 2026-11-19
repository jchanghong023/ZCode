# 内存后端与部署拓扑

本文记录当前实现、状态所有者和部署限制。精确公开面见[契约设计](../specs/aireq/contract-design.md)，浏览器接线、身份与顺序见[连接身份](../specs/aireq/connection-identity.md)。

## 1. 运行拓扑

当前系统只有电脑浏览器和 `packages/server` 内存后端，没有可替换使用的真实业务后端。

```text
web/main.tsx → @zcode/client → 同源 /ws 二进制 Channel RPC
  → server/http.ts：SocketProtocol + ChannelServer + 显式成员白名单
  → mock/index.ts：createMockServices
      ├─ MockAIReqService：workflow、配置、Skill、分析调度
      ├─ MockRuntime + MockZCodeAgentService：会话、队列、附件、topic
      └─ domains/*：辅助服务
```

`entry-http.ts` 创建一次服务集合。每条 WebSocket 独占 socket、协议、ChannelServer、固定身份 facade 和 agent connection scope；关闭只释放连接资源和订阅，不销毁共享业务 owner。HTTP 层不复制业务或重放账本。`createMockHttpServer` 返回可由调用者 `stop()` 的 Bun server。

运行时为 Bun，pnpm 管理依赖；`node:*` 为 Bun 兼容 API，不是独立 Node.js 后端。根 `dev` 并行启动 server/web，`build` 依次构建 server/web，具体命令以根 `package.json` 和[构建工作流](../../README.md#构建与部署)为准。

## 2. 权威状态

| 状态                                                                              | 唯一所有者                                             | 边界                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| 项目、Release、想法、IR/SR、材料、审查、确认、PR 候选、分工、报告、验收、分支事实 | `MockAIReqService` 与 `aireq/workflow.ts` 等领域 owner | UI 只保留可失效投影；待办、聚合进度从事实派生 |
| 模型绑定、提示词及各自 revision                                                   | `aireq/agent-models.ts`、`personalization.ts`          | bootstrap 提供配置，不另建读取 RPC            |
| Skill 私有草稿、预览、文件、版本与 catalog                                        | `aireq/skill-design.ts`、`skills.ts`                   | 文件服务只读同一内存事实                      |
| 分析任务、历史、定时配置                                                          | `createPrototypeProgressScheduler`                     | 单服务端调度器，不按连接创建                  |
| rows、revision、phase、config、queue、plan、usage、pending、conversation 水位     | `MockRuntime.sessions` / `MockSession`                 | `MockZCodeAgentService` 接纳命令并发帧        |
| 原生任务索引                                                                      | `MockRuntime.tasks`                                    | 不是 AIReq 待办 owner                         |
| 附件暂存、提交字节及采用关系                                                      | `MockZCodeAgentService`                                | composer 只拥有未发送草稿和引用               |
| 通用应用设置                                                                      | `MockSettingService`                                   | 不与 AIReq 模型／提示词共用版本               |

先校验身份、参数、归属及对应阶段／版本／幂等条件，再提交事实，最后通知。异步完成还绑定对象、阶段、轮次、会话及输入版本；迟到结果不能恢复失效批准。后台每五秒检查 PR 观测与分析调度，是否到期由真实时钟及 `intervalMinutes` 决定，不是推进模拟时间。浏览器关闭不取消已接纳任务；PR 检查时间等观测元数据不推进业务 CAS revision。

默认项目 `demo-aurora`（Aurora 协作控制台）、默认 Release `release-2026-11`（2026.11 · 体验优化）的初始提案覆盖未启动、IR 待评审、IR 待确认、方案待完善、方案待评审、方案待确认、待提交和待合入。每条样例持有对应的材料、快照、评审、人工及三方确认、交付候选与 PR 事实，业务状态仍由同一公共规则推导，不直接填状态答案。既有项目／版本数据保留。待合入样例是已有 opened PR 的初始记录，不预置自动合入时钟；读取与后台核验不会自行转正。用户显式发布后沿用正常的候选合入生命周期，关闭与修改仍遵守原门禁。

### 原型后端业务初始数据

默认项目 Aurora 协作控制台（`demo-aurora`）的 `release-2026-11`（2026.11 · 体验优化）包含 7 条正式 IR、21 条正式 SR。团队成员管理、消息偏好设置、附件管理和工作台快捷入口占其中 4 条 IR、12 条 SR；各 IR 保留完整材料、冻结快照、文档合入和独立开发分支，联系人与开发／测试分工可用于查看待办。

首次进入当前项目默认选中 Aurora 最新的 `release-2026-12`（2026.12 · 下一迭代）。此版本的通知中心和操作审计包含 5 条正式 SR，各有一条固定的既存状态变化，覆盖开发中、待合入、待验收和已完成。各条 SR 沿同一初始化流程生成正式材料和开发分支，变化时间及当前状态事实均由服务端样例提供。

开发任务必须覆盖待开发（含未分析与已分析 0%）、开发中、待合入、待验收、已完成。状态由既有公共进度函数从报告、首次代码合入与同版人工验收派生，不直接写展示状态。待合入必须有明确分析结论且尚未合入；首次合入后进度 99%，无须分析报告即可验收；已完成必须有匹配首次合入版本的人工通过记录。

2026.11 的 SR 保留六条 2026-11-16 至 2026-11-17 的既存历史变化，分别覆盖回到待开发、进入开发中、待合入、待验收和已完成。两个版本的历史 `to` 均须与当前有效状态一致。它们是服务端预置的历史业务数据，加载不触发状态变化事务；不得按启动／读取时间补造或刷新，其他没有历史的 SR 继续缺失 `statusChange`。随后真实提交仍由 workflow 事务比较有效状态并更新记录。

这批静态 SR 的 `automaticCodeMerge:false` 只保存在 workflow 内部类型，公共投影递归剥离（包括嵌套回执）。后台模拟代码合入跳过它们，避免启动数秒后五种状态全部被推进为待验收；公开分析、分工和人工验收仍沿正常业务门禁，新创建需求的模拟推进保持原规则。

验收：2026.11 的正式 IR／SR 计数为 7／21，五种状态均非空；2026.12 的计数为 2／5。两个版本的最近动态分别按各自固定历史时间排序展示五个不同 SR，重复读取时间不变，点击动态可进入该版本的 SR 开发详情。检查样例的材料归属、分支基点、验收代码版本，以及后台轮询后状态仍与历史一致；公共返回不得包含内部控制字段，其他项目的 Release 数据保持原有范围。

## 3. 当前实现能力

- AIReq 在内存中执行材料与报告、阶段门禁、配置保存和派生待办。模型目录 facade 使用同一 AIReq 目录投影；刷新读取内存目录，无事实变化不制造 revision 或事件，不表示外部供应商连通。
- AI、Git／PR、分支、文件与媒体依赖均由服务端内存实现提供。发布后的文档 PR 保留可关闭的 opened 窗口，按真实服务时钟推进内部合入事实后，仍核验当前候选及完整材料再转正。分支首次推送可呈现内部瞬态失败并经正常重试恢复。对参与自动模拟合入的 SR，登记分支可用满十秒后，由服务端时钟触发工作流记录首次代码合入。人工批准和验收由用户提交。合入属于内存模拟事实。正式 SR 的[产品要求](../specs/aireq/tracking.md#首次代码合入与人工验收)和[当前验收实现](../../packages/server/src/aireq/CONTRACT.md#业务所有权)见各自文档。
- 原生会话由内存服务模拟，提供握手、快照、增量、分页、命令决定查询、队列、交互和附件事务。当前模拟在会话忙碌时将新输入放入队列。正式聊天采用 OMP 原生 Agent 的交互，见[会话产品要求](../specs/aireq/conversation.md#会话产品要求与原型范围)。当前业务回复按实际完整结果呈现，不代表真实模型流式执行。
- v4 对创建／发送／停止、队列编辑锁与增删改排／提升／配置、自动续跑、交互、标题／删除、协作模式、followup 和反馈有内存处理。具体归属与阶段仍可拒绝；schema 存在不代表能力实现。
- 业务绑定会话的 `switchModelConfig` 不可用，能力与拒绝一致。其他未实现命令返回 `rejected` 与 `fault.command.capabilityUnsupported`，不以无状态变化的 accepted 填补。
- File 只读既有虚拟树与 Skill 文件；Project 仅身份约束的树和会话目录解析，不提供宿主目录选择或浏览。
- 无子代理时可以返回真实空集合，但不承诺执行引擎。
- lifecycle 只能表达实际内存事实或明确不可用，不能冒充宿主进程控制。

Skill 主入口隐藏，但私有会话、附件、预览、保存和草稿门禁保留。共享逻辑配置路径 `/aireq/config`，共享技能根 `/aireq/skills/shared`，逻辑后端标识 `aireq-shared`；项目技能位于项目逻辑工作区 `.omp/skills/`。保存原子提交文件／目录与 catalog，`metadata.version` 对应收据 revision；通用文件服务读取这些节点，不因此增加公开目录分页或文件写入 RPC。

## 4. HTTP、资源与访问控制

| 接入面                          | 当前行为                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ws`                           | 升级前校验身份、查询和可选 token；升级后仅二进制 Channel RPC，文本消息以 1003 关闭                                                                  |
| `GET /api/v1/client/configs`    | `no-store`，返回 `{code:0,data:{configs:{feedbackUrl:…}}}`；独立于 RPC 配置服务                                                                     |
| `POST /api/v1/telemetry/events` | 严格 shared `ui`／`arms` 信封；清洗副本交诊断后返回 202 空响应；非法 JSON／字段 400，未授权 401，内部失败安全 500                                   |
| 静态托管                        | 配置 staticRoot 后启用；HTML `no-cache`，带内容哈希 assets 一年 immutable，其他资源重新校验；支持 HEAD、br/gzip/identity 与 `Vary: Accept-Encoding` |
| SPA fallback                    | 不覆盖 `/api/` 或 `/ws`；拒绝目录穿越、盘符路径及 `.map`；没有可接受编码返回 406                                                                    |

浏览器标签页图标由 `packages/web/index.html` 内嵌 PNG 提供，静态发布目录不提供根路径的 `favicon.ico` 文件。

只读材料摘要和大小取自实际正文的 UTF-8 字节。

遥测 202 仅表示本服务诊断接纳，不表示第三方上传或持久化；无公开读取和重试队列。文件媒体返回字节或浏览器可达 URL，不能把服务器磁盘路径／`file://` 放入浏览器资源地址；跨源资源需 CORS，HTTPS 页面不能混用 HTTP 媒体。

| 入口变量                    | 含义                                              |
| --------------------------- | ------------------------------------------------- |
| `ZCODE_SERVER_WORKSPACE`    | 默认进程当前目录，不是产品本机目录入口            |
| `PORT`                      | 默认 3031                                         |
| `ZCODE_SERVER_HOST`／`HOST` | 默认 `0.0.0.0`，前者优先                          |
| `ZCODE_WEB_STATIC_ROOT`     | 静态目录，设置后启用 SPA fallback                 |
| `ZCODE_SERVER_AUTH_TOKEN`   | 可选部署访问控制，只保护 `/ws`、`/ws/…`、`/api/…` |

受保护请求接受匹配 Bearer、查询 token 或 `zcode_lite_token` Cookie。受保护请求的有效 token 查询设置 `Path=/; HttpOnly; SameSite=Lax` Cookie；普通根页面不经过这项校验，`/?token=…` 不兑换 Cookie，也不自动转发至 WS。正式浏览器依赖同源已有 Cookie 或部署代理提供凭据，不增加产品 token 输入框。静态页不受此 token 保护；token 不是工号本人认证。帮助配置 fetch 保持 `credentials:"same-origin"`、`redirect:"error"`。

## 5. 部署限制与后端替换

原型的业务数据、会话、共享配置、回执、文件和附件保存在当前进程的内存里。重启后按初始样例重新初始化。浏览器本地偏好和已导出的文件由各自的存储保管。材料的逻辑路径和收据对应内存保存事实。

当前没有真实 AI、代码扫描、Git 托管／合入、数据库、宿主业务文件写入、生产认证或权限体系。工号自报，clientId 不是凭据；内存材料、PR／分支和进度不是外部执行证明。产品不执行用户开发 tasks、业务构建或测试。

正式对接以原型验收通过的前端构建、公开契约和测试为基准。切换时复用这些产物，由正式后端实现同一契约并调整必要的部署配置。前端沿同一业务路径运行，测试按环境配置切换目标。未实现能力明确返回失败，运行限制通过部署与规格文档记录。对接及验收要求见[发布边界](../specs/aireq/contract-design.md#发布边界)。

## 6. 源码依据

- `packages/server/src/entry-http.ts`、`mock/index.ts`：入口与 `createMockServices`。
- `packages/server/src/http.ts`：`publicMembers`、`setupChannelServer`、`createMockHttpServer`。
- `packages/server/src/aireq/fixture-release.ts`、`fixtures.ts`：默认 Release 的正式需求、任务和历史。
- `packages/server/src/aireq/service.ts`：`MockAIReqService`、`getConnectionServices`。
- `packages/server/src/mock/runtime.ts`、`mock/zcodeAgent.ts`：会话、水位与附件。
- 精确原生契约：`packages/services/src/zcode-agent/zcodeAgent.ts`、`packages/shared/src/zcode-protocol-v4/`。
