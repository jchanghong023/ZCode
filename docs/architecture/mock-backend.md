# 内存后端与部署拓扑

本文记录当前实现、状态所有者和部署限制。精确公开面见[契约设计](../specs/aireq-migration/contract-design.md)，浏览器接线见[集成规格](../specs/aireq-migration/integration.md)，身份与顺序见[连接身份](../specs/aireq-migration/connection-identity.md)。

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

运行时为 Bun，pnpm 管理依赖；`node:*` 为 Bun 兼容 API，不是独立 Node.js 后端。根 `dev` 并行启动 server/web，`build` 依次构建 server/web，具体命令以根 `package.json` 和[构建工作流](web-build-workflow.md)为准。

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

## 3. 当前实现能力

- AIReq 在内存中执行材料与报告、阶段门禁、配置保存和派生待办。模型目录 facade 使用同一 AIReq 目录投影；刷新读取内存目录，无事实变化不制造 revision 或事件，不表示外部供应商连通。
- 原生会话提供握手、快照／增量、分页、命令决定查询、队列、交互和附件事务。当前业务回复按实际完整结果呈现，不代表真实模型流式执行。
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

业务、会话、回执、文件和附件均在当前进程内存中；重启恢复初始数据，不保证既有事实或幂等决定持久。逻辑路径与保存收据不证明宿主落盘。

当前没有真实 AI、代码扫描、Git 托管／合入、数据库、宿主业务文件写入、生产认证或权限体系。工号自报，clientId 不是凭据；内存材料、PR／分支和进度不是外部执行证明。产品不执行用户开发 tasks、业务构建或测试。

正式前端构建、文案、SDK、传输、descriptor、DTO 与 schema 是固定对接面。更换后端只能实现相同保留契约并调整必要部署配置，不能要求浏览器增加 mock 分支、兼容接口或另一份业务状态。未实现能力明确失败，不能用空文件、空对象或假成功填补。限制集中在本文与[发布边界](../specs/aireq-migration/release-surface.md)，不注入用户材料、提示词或 provenance。

## 6. 源码依据

- `packages/server/src/entry-http.ts`、`mock/index.ts`：入口与 `createMockServices`。
- `packages/server/src/http.ts`：`publicMembers`、`setupChannelServer`、`createMockHttpServer`。
- `packages/server/src/aireq/service.ts`：`MockAIReqService`、`getConnectionServices`。
- `packages/server/src/mock/runtime.ts`、`mock/zcodeAgent.ts`：会话、水位与附件。
- 精确原生契约：`packages/services/src/zcode-agent/zcodeAgent.ts`、`packages/shared/src/zcode-protocol-v4/`。
