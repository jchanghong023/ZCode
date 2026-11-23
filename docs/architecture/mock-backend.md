# 内存后端与部署拓扑

本文记录当前实现、状态所有者和部署限制。精确公开面见[契约设计](../specs/aireq/contract-design.md)，浏览器接线、身份与顺序见[连接身份](../specs/aireq/connection-identity.md)。

## 1. 运行拓扑

当前系统只有电脑浏览器和 `packages/server` 内存后端，没有可替换使用的真实业务后端。

```text
web/main.tsx → @zcode/client → 同源 /ws 二进制 Channel RPC
  → server/http.ts：SocketProtocol + ChannelServer + 显式成员白名单
  → mock/index.ts：createMockServices
      ├─ MockAIReqService：workflow、配置、Skill
      ├─ MockRuntime + MockZCodeAgentService：会话、队列、附件、topic
      └─ domains/*：辅助服务
```

`entry-http.ts` 创建一次服务集合。每条 WebSocket 独占 socket、协议、ChannelServer、固定身份 facade 和 agent connection scope；关闭只释放连接资源和订阅，不销毁共享业务 owner。HTTP 层不复制业务或重放账本。`createMockHttpServer` 返回可由调用者 `stop()` 的 Bun server。

运行时为 Bun，pnpm 管理依赖；`node:*` 为 Bun 兼容 API，不是独立 Node.js 后端。根 `dev` 并行启动 server/web，`build` 依次构建 server/web，具体命令以根 `package.json` 和[构建工作流](../../README.md#构建与部署)为准。

## 2. 权威状态

| 状态                                                                          | 唯一所有者                                             | 边界                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| 项目、Release、想法、IR/SR、材料、审查、确认、PR 候选、评审报告与正式文档     | `MockAIReqService` 与 `aireq/workflow.ts` 等领域 owner | UI 只保留可失效投影；项目统计从事实派生 |
| 模型绑定、提示词及各自 revision                                               | `aireq/agent-models.ts`、`personalization.ts`          | bootstrap 提供配置，不另建读取 RPC      |
| Skill 私有草稿、预览、文件、版本与 catalog                                    | `aireq/skill-design.ts`、`skills.ts`                   | 文件服务只读同一内存事实                |
| rows、revision、phase、config、queue、plan、usage、pending、conversation 水位 | `MockRuntime.sessions` / `MockSession`                 | `MockZCodeAgentService` 接纳命令并发帧  |
| 原生任务索引                                                                  | `MockRuntime.tasks`                                    | 原生会话的任务索引                      |
| 附件暂存、提交字节及采用关系                                                  | `MockZCodeAgentService`                                | composer 只拥有未发送草稿和引用         |
| 通用应用设置                                                                  | `MockSettingService`                                   | 不与 AIReq 模型／提示词共用版本         |

先校验身份、参数、归属及对应阶段／版本／幂等条件，再提交事实，最后通知。异步完成还绑定对象、阶段、轮次、会话及输入版本；迟到结果不能恢复失效批准。后台每五秒观测文档 PR。浏览器关闭不取消已接纳的评审和交付，检查时间等观测元数据不推进业务修订。

默认项目 `demo-aurora`（Aurora 协作控制台）、默认 Release `release-2026-11`（2026.11 · 体验优化）的初始提案覆盖未启动、IR 待评审、IR 待确认、方案待完善、方案待评审、方案待确认、待提交和待合入。每条样例持有对应的材料、快照、评审、人工及三方确认、交付候选与 PR 事实，业务状态仍由同一公共规则推导，不直接填状态答案。既有项目／版本数据保留。待合入样例是已有 opened PR 的初始记录，不预置自动合入时钟；读取与后台核验不会自行转正。用户显式发布后沿用正常的候选合入生命周期，关闭与修改仍遵守原门禁。

### 原型后端业务初始数据

默认项目 Aurora 协作控制台的 2026.11 版本有 7 份正式 IR 文档，2026.12 版本有 2 份。每个 IR 保留原始需求、材料、冻结快照与文档合入事实。项目与 Release 统计按正式 IR 和在途提案分别计数。

初始提案、正式文档及原型运行时生成或修订的 IR／SR Markdown 材料均以 Mermaid 流程图开头。需求澄清、方案讨论或材料修订再次生成时保留已有首图，不重复添加；初始和运行时生成的已完成评审报告在标题后以流程图开始正文。图随正文保存，材料摘要和快照按最终正文计算。导入仍按来源正文保存，依赖 JSON 保持纯 JSON。

演示工作区预置的 Markdown 文件和原型 Skill Markdown 正文也以 Mermaid 图开始；生成的 `SKILL.md` 先保留 YAML front matter，再显示流程图。原有文件格式和阅读入口不变。

## 3. 当前实现能力

- AIReq 在内存中执行材料与报告、阶段门禁和配置保存。模型选择服务使用同一 AIReq 模型目录投影；Web 不公开旧 Provider 设置服务或外部供应商连通性探测。
- AI、文档交付、文件与媒体依赖由服务端内存实现提供。文档 PR 保留可关闭的 opened 窗口，按服务时钟观测模拟合入后仍核验候选和完整材料，再将同一 IR 转正。
- 原生会话提供握手、快照、增量、分页、命令决定查询、只读队列与附件事务。AIReq 与 `/chat` 使用[同一聊天语义](../specs/aireq/conversation.md#聊天命令和会话配置)：显式引导或跟进、面向目标执行的停止、独立于接纳的运行终态。模拟结果不代表真实模型；AIReq 业务材料和聊天回复分别提交。
- 业务绑定会话不支持 `switchModelConfig`；`/chat` 空闲时可使用。只接纳[公开契约](../specs/aireq/contract-design.md#2-原生-agent-精确公开成员)允许的命令，并在会话创建／访问前拒绝退役命令，不以 accepted 或空目录填补。
- File 只读既有虚拟树与 Skill 文件；Project 仅身份约束的树和会话目录解析，不提供宿主目录选择或浏览。
- 思考、Todo 和子代理工作记录仅由原型在已开始的聊天回合中模拟。复核结果留在父会话，不创建真实子代理会话。Web 不公开桌面 Agent 进程或会话生命周期。

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

当前没有真实 AI、代码扫描、Git 托管／合入、数据库、宿主业务文件写入、生产认证或权限体系。工号自报，clientId 不是凭据；内存材料和 PR不是外部执行证明。产品不执行用户开发 tasks、业务构建或测试。

正式对接以原型验收通过的前端构建、公开契约和测试为基准。切换时复用这些产物，由正式后端实现同一契约并调整必要的部署配置。前端沿同一业务路径运行，测试按环境配置切换目标。未实现能力明确返回失败，运行限制通过部署与规格文档记录。对接及验收要求见[发布边界](../specs/aireq/contract-design.md#发布边界)。

## 6. 源码依据

- `packages/server/src/entry-http.ts`、`mock/index.ts`：入口与 `createMockServices`。
- `packages/server/src/http.ts`：`publicMembers`、`setupChannelServer`、`createMockHttpServer`。
- `packages/server/src/aireq/fixture-release.ts`、`fixtures.ts`：默认 Release 的正式需求、任务和历史。
- `packages/server/src/aireq/service.ts`：`MockAIReqService`、`getConnectionServices`。
- `packages/server/src/mock/runtime.ts`、`mock/zcodeAgent.ts`：会话、水位与附件。
- 精确原生契约：`packages/services/src/zcode-agent/zcodeAgent.ts`、`packages/shared/src/zcode-protocol-v4/`。
