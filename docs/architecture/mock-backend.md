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

AIReq 页面使用 `/ws` 和工号身份。独立聊天页面 `/chat` 使用 `/ws/chat` 和匿名客户端身份，单独装配 Agent 与模型目录，不访问 AIReq 公开频道。

项目录入来自云龙。原型仅允许给页面目录中已登记且仍有效的项目更新仓库配置，保存时校验仓库地址、分支、服务端绝对工作目录与项目配置版本，并按操作编号幂等裁决。本地服务准备共享文档目录，工作流发布当前文档，开发通过仓库内的目录软链接读取。详见[项目工作目录](../specs/aireq/contract-design.md#项目工作目录)。

运行时为 Bun，pnpm 管理依赖；`node:*` 为 Bun 兼容 API，不是独立 Node.js 后端。根 `dev` 并行启动 server/web，`build` 依次构建 server/web，具体命令以根 `package.json` 和[构建工作流](../../README.md#构建与部署)为准。

## 2. 权威状态

| 状态                                                                          | 唯一所有者                                       | 边界                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| 项目与 IR 来源字段、按 PI 派生的 Release                                      | 云龙；连接 owner 持有页面读取快照                | 普通读取复用已绑定目录                 |
| 项目仓库配置、角色、SR、当前材料、文档版本和评审                              | `aireq/project-settings.ts`、`aireq/workflow.ts` | UI 重读与页面目录合并后的投影          |
| 模型绑定、提示词及各自 revision                                               | `aireq/agent-models.ts`、`personalization.ts`    | bootstrap 提供配置，不另建读取 RPC     |
| Skill 私有草稿、预览、文件、版本与 catalog                                    | `aireq/skill-design.ts`、`skills.ts`             | 文件服务只读同一内存事实               |
| rows、revision、phase、config、queue、plan、usage、pending、conversation 水位 | `MockRuntime.sessions` / `MockSession`           | `MockZCodeAgentService` 接纳命令并发帧 |
| 原生任务索引                                                                  | `MockRuntime.tasks`                              | 原生会话的任务索引                     |
| 附件暂存、提交字节及采用关系                                                  | `MockZCodeAgentService`                          | composer 只拥有未发送草稿和引用        |
| 通用应用设置                                                                  | `MockSettingService`                             | 不与 AIReq 模型／提示词共用版本        |

服务端校验身份、参数和项目角色，再提交并通知。原生执行绑定对象和会话。材料变化更新当前未确认版本，或在上一版已确认时开启下一版。服务端提供只读文件检查。定版再次校验完整性与格式，通过后在同一事务保存当前全部文件。按需评审绑定发起时的文件快照。

`bun run dev` 由服务端调用[独立离线云龙 CLI](clouddragon-cli.md#家庭开发机)，与真实云龙共用进程输出解析和数据校验。`bun run dev --use-clouddragon` 与直接启动服务端默认使用真实 CLI。角色、材料及项目仓库配置由内存后端管理。

云龙读取合并并发请求，完成后的结果共享 3 秒。项目可以包含多个需求域，评论定位保留并使用各 IR 自己的需求域。连接 owner 按工号、客户端和可选 `pageId` 保留页面快照，最后一个连接断开后仍可在 30 分钟内复用；没有 `pageId` 的快照只属于当前连接。首次普通读取可取得部分成功的目录，刷新必须等项目目录及所有 IR 列表完整成功才替换该页快照。刷新在途、失败或其他页面刷新均不更换本页普通读取的目录，本地材料和配置仍反映当前事实。

### 原型后端业务初始数据

项目需求总数包括未分配 PI 的 IR；Release 仅由当前目录中的 IR 按 PI 归组，并统计其中状态为「完成」和当前文档版本已确认的需求数。

本地云龙样例为演示和测试提供项目与 IR，不依赖 AIReq 创建或删除它们。角色、材料、文档版本和既有项目的仓库配置由当前业务操作维护。两个 Agent 生成的 Markdown 材料包含 Mermaid 流程图，正文、摘要与大小随确认快照一起保存。依赖清单使用纯 JSON，由右侧文档区按对应版本绘制依赖图。

演示验收从右侧文档区打开当前及历史版本，并在需求 Agent 和方案 Agent 会话中生成材料，确认各 Markdown 文件能显示流程图，依赖图能读取同版依赖。

演示工作区预置的 Markdown 文件和原型 Skill Markdown 正文也以 Mermaid 图开始；生成的 `SKILL.md` 先保留 YAML front matter，再显示流程图。原有文件格式和阅读入口不变。

## 3. 当前实现能力

- AIReq 在内存中维护材料、版本、角色和配置。模型选择服务使用同一模型目录投影。
- 两个会话复用原生执行。按需评审使用服务端内存模拟，报告通过发起评审的对话投影展示。
- 原生会话提供握手、快照、增量、分页、命令决定查询、草稿退回确认与附件事务。AIReq 与 `/chat` 采用同一规则引导当前执行、按目标停止，并将尚未交付的输入退回原发送者草稿。AIReq 业务材料和聊天回复分别提交。详见[聊天命令和会话配置](../specs/aireq/conversation.md#聊天命令和会话配置)。
- 业务绑定会话不支持 `switchModelConfig`；`/chat` 空闲时可使用。只接纳[公开契约](../specs/aireq/contract-design.md#2-原生-agent-精确公开成员)允许的命令，并在会话创建／访问前拒绝退役命令，不以 accepted 或空目录填补。
- File 只读既有虚拟树与 Skill 文件；Project 仅身份约束的树和会话目录解析，不提供宿主目录选择或浏览。
- 思考、Todo 和子代理工作记录仅由原型在已开始的聊天回合中模拟。复核结果留在父会话，不创建真实子代理会话。Web 不公开桌面 Agent 进程或会话生命周期。

Skill 主入口隐藏，但私有会话、附件、预览、保存和草稿门禁保留。共享逻辑配置路径 `/aireq/config`，共享技能根 `/aireq/skills/shared`，逻辑后端标识 `aireq-shared`；项目技能位于项目逻辑工作区 `.omp/skills/`。保存原子提交文件／目录与 catalog，`metadata.version` 对应收据 revision；通用文件服务读取这些节点，不因此增加公开目录分页或文件写入 RPC。

## 4. HTTP、资源与访问控制

| 接入面                          | 当前行为                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ws`                           | 校验工号、客户端身份、可选 `pageId` 和部署 token；仅二进制 Channel RPC，文本消息以 1003 关闭                                                        |
| `/chat`                         | 浏览器聊天页面，静态托管读取 `chat/index.html`；不要求工号，不经过部署 token 校验                                                                   |
| `/ws/chat`                      | 校验匿名 UUID `clientId` 和可选部署 token；使用聊天白名单与同一二进制协议                                                                           |
| `GET /api/v1/client/configs`    | `no-store`，返回 `{code:0,data:{configs:{feedbackUrl:…}}}`；独立于 RPC 配置服务                                                                     |
| `POST /api/v1/telemetry/events` | 严格 shared `ui`／`arms` 信封；清洗副本交诊断后返回 202 空响应；非法 JSON／字段 400，未授权 401，内部失败安全 500                                   |
| 静态托管                        | 配置 staticRoot 后启用；HTML `no-cache`，带内容哈希 assets 一年 immutable，其他资源重新校验；支持 HEAD、br/gzip/identity 与 `Vary: Accept-Encoding` |
| SPA fallback                    | 不覆盖 `/api/` 或 `/ws` 及其子路由；拒绝目录穿越、盘符路径及 `.map`；没有可接受编码返回 406                                                         |

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

原型的本地业务状态、会话、共享配置、回执、逻辑文件和附件保存在当前进程内。需求共创列配置按工号写入服务工作目录，重启时保留。已配置项目的当前材料可另行发布到服务端共享文档目录；逻辑材料路径和收据仍对应内存工作流，不代表持久事务。

红区手动全量同步在接纳时固定该页已加载的目录，没有目录则拒绝；提交给传输端口时读取当前需求材料。每 5 分钟的自动任务读取云龙目录，不替换页面快照，与手动任务串行。内存接收端以项目组 ID 和 IR 业务号更新云龙快照字段和可选的完整 `requirements.md`，导入副本与红区自有文件分开，缺少随附正文时不删除文件。原型不提供额外红区 RPC、持久队列或跨重启 exactly-once。

当前没有真实 AI、代码扫描、真实仓库读取、数据库、生产认证或权限体系。工号自报，clientId 不是凭据；内存材料和确认记录只描述平台内流程。产品不执行用户开发 tasks、业务构建或测试。

正式对接以原型验收通过的前端构建、公开契约和测试为基准。切换时复用这些产物，由正式后端实现同一契约并调整必要的部署配置。前端沿同一业务路径运行，测试按环境配置切换目标。未实现能力明确返回失败，运行限制通过部署与规格文档记录。对接及验收要求见[发布边界](../specs/aireq/contract-design.md#发布边界)。

## 6. 源码依据

- `packages/server/src/entry-http.ts`、`mock/index.ts`：入口与 `createMockServices`。
- `packages/server/src/http.ts`：`publicMembers`、`setupChannelServer`、`createMockHttpServer`。
- `packages/server/src/aireq/clouddragon.ts`：云龙 CLI 调用、返回校验与业务投影。
- `packages/server/src/aireq/service.ts`：`MockAIReqService`、`getConnectionServices`。
- `packages/server/src/mock/runtime.ts`、`mock/zcodeAgent.ts`：会话、水位与附件。
- 精确原生契约：`packages/services/src/zcode-agent/zcodeAgent.ts`、`packages/shared/src/zcode-protocol-v4/`。
