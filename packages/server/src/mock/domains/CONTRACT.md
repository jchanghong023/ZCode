# Mock 领域模块

`packages/server/src/mock/domains` 是当前 Web 原型的领域装配层，只注册当前界面、原生会话及受保护通用控件仍消费的服务。

## 边界

- 每个领域文件只导出本域服务类与一个 `register<Domain>MockServices(services, runtime)` 装配函数（`contract.ts` 的 `MockDomainRegistrar`）。
- 集中装配仍在 `packages/server/src/mock/index.ts`：它按固定顺序调用各域装配函数，不反向依赖领域内部实现。
- 领域模块不得读取或改写其它领域的私有字段。跨领域权威状态只有 `MockRuntime`（会话、任务、虚拟文件系统、topic 水位）；已退役 Git 服务不再持有仓库、分支、身份或差异 fixture。
- `@zcode/services` 只作为契约输入：领域模块导入服务接口与 descriptor，不导入真实实现。

## 能力语义

各服务直接按已有 wire 契约返回能力值：已实现操作必须有可观察的内存状态转换，未实现操作明确拒绝。这里只按领域拆分代码，不建立能力矩阵实现层；UI 不增加 mock 分支。

工号只由浏览器标签页保存，不需要后端账号会话或凭据 RPC。模型选择目录只提供 `getView`；供应商条目不含 `templateId`，供应商配置只包含可选的 `logo`、`api` 和 `access`，不下发 `group` 或 `visibility`。API 配置只投影 `type`，访问配置只投影访问类型和账户套餐展示字段。不下发端点、请求头、API 密钥或密钥管理地址。模型候选和顺序只由 `models` 表达。模型选项只公开 `reasoningLevel.values`，模型能力只公开 `inputFormat.supportsImage`；不发布执行参数映射、输出令牌配置或其他执行能力。不发布目录变更事件，不注册 Provider 设置目录。AIReq 模型设置仍由 AIReq owner 管理并发布业务变更通知。
工号切换或退出不触发共享会话、项目或设置的删除、解绑或重置。
setting 仅保留 get/update；当前个性化提示词通过 AIReq bootstrap/save 访问，
不再保留旧 getUserInstructions/saveUserInstructions 及其模拟路径。
`setting.update(patch)` 不提供桌面 Provider 账户写入的快照参数；额外实参在校验或合并 patch 前拒绝。

公开设置 patch 使用从 shared 严格 `appSettingsPatchSchema` 派生的 `webAppSettingsPatchSchema`。补丁和回读共用同一份排除清单，移除宿主网络、终端、桌面窗口、电源、托盘迁移、桌面远程宿主、桌面工作区与标签页恢复、旧工具搜索、记忆开关、旧内置 Agent CLI 启用列表、电脑操作入口偏好、桌面数据目录、首次设置同步提示和旧端点覆盖字段，具体成员见[公开契约](../../../../../docs/specs/aireq/contract-design.md#6-拒绝文件与设置)。原型从 `appSettingsSchema` 的初值中排除这些字段。整份 patch 验证成功后一次合并到唯一内存 settings；失败不改变任何字段，partial 不填默认。theme／uiFontSizePx 使用既有主题枚举和 12—20px 整数字号规则，语言使用 locale，不新增 language 别名。不改变浏览器本机 store 的偏好所有权。

Web 设置不返回或接受旧套餐推荐、引导、思考展示迁移和自动归档字段。自动归档迁移标记 `taskAutoArchiveResetVersion` 原本就不属于严格补丁，仅需从回读投影排除；聊天的思考和 Todo 展示仍使用各自现有偏好。

终端、Git 检查点、营销、Desktop Provider Provisioning、会话分享和商业订阅交易不属于当前产品，
不再注册兼容空壳。模型目录仍沿既有契约访问。

产品插件与旧宿主服务整体退役：不注册 Git、文件监听、媒体会话、MCP 同步、client-config、
skills、task-groups、prompt-attachment-transfer 和子代理目录；HTTP 帮助配置不受影响。
保留原生 Skill catalog、AIReq 隐藏 Skill 和通用 DTO/schema。父会话中的子代理工作记录不依赖独立目录。
旧 task-list 事件及其专用 emitter／发射接线随 `onDynamicWorkspaceEvent` 一并退役。
原生 tasks 的置顶／归档组织态保留。

会话事实由 MockRuntime 与 agent owner 持有，AIReq 业务权限由 AIReq owner 裁决；
project resolveSessionDirectories/readTree 由连接 facade 绑定可信身份。
readTree 仅投影当前身份可见的原生会话，不发布示例目录项目或私有草稿。
路径型 v4 请求仍沿用既有 wire topic 键，mock 只在内部统一业务身份与水位，再按订阅的原请求键投递，
避免旧请求和带身份请求变成两套会话，且不要求修改严格帧 schema 或逐连接 facade。

每条 `/ws` 仍有独立 `createZCodeAgentConnectionScope`：握手、conversation
的订阅归属、帧过滤及断开清理均不得因共享业务数据而移除。取消 A 的订阅不影响 B。
原生命令按现有操作者／客户端、sessionId、commandId 去重并提供结果查询；AIReq 业务 owner 另行校验
配置／材料／候选版本、阶段和幂等。原型的结果只在进程内保留，不代表生产持久化或完整通用 CAS；
真实后端必须依已有 v4 契约实现，不得以原型限制取消这些当前正确性门禁。

`MockZCodeAgentService` 仅从接纳信封取得真实 clientId。立即发送和繁忙时接纳的引导／跟进均保留原来源，不用后续操作者或固定值替代。实时行和历史分页共用 runtime.rows。

文件来自同一虚拟树与 Skill owner 私有文件事实，缺失／错类型明确拒绝，字节按 UTF-8。
公开文件面只保留 searchWorkspaceFiles/stat/checkFilesExist/readMediaPreview/readFileRange，各自仅接收一个封闭请求对象，访问文件前拒绝额外实参或字段；
Skill 私有文件 helper 仍保留，不因移除公开正文／目录／索引 RPC 而删除。
广播总线归唯一 MockBroadcastService。HTTP facade 在广播前拒绝客户端传入的 `sourceWindowId`，为每条连接绑定可信数字来源，过滤本源并在关闭时注销。

## 装配顺序

```text
mock/index.ts
  ├─ MockRuntime（唯一权威状态）
  ├─ broadcast（跨窗口总线）
  ├─ domains/settings → domains/models
  └─ zcodeAgent / project / workspace（协议与文件面）
```

顺序只影响注册表写入，不表达依赖；任何领域都不应在装配期执行副作用（不写文件、不发网络请求、不启动定时器）。

当前领域注册面：setting、model-selection。
扩展、凭据、命令/hook/记忆管理、同步迁移、反馈、语音、云媒体、高速卡与闲时任务
不再注册 mock 或保留专属 fixtures；隐藏的 AIReq Skill 设计操作和数据不在裁撤范围。
两处 AIReq 原生面板均为 embedded，旧草稿推荐不挂载；client-scenes 与 onboarding-record
及其独占推荐 fixtures 一并退役，不影响隐藏 Skill 会话或模型推荐。
subagents 仅保留原生目录 list；Skill 引用只走原生 agent catalog，
隐藏 Skill 设计仍由 AIReq owner 持有，不保留独立 skills descriptor 或旧管理写面。
/api/server-info 及重复配置 handler 退役；保留帮助配置 `/api/v1/client/configs`、
身份校验 `/ws`、同源 `POST /api/v1/telemetry/events`、静态资源压缩与 SPA 宿主。
遥测复用 `/api/` 部署 token，严格校验／清洗后交服务诊断再返回 202，仅表示接收，不声明外部上传。

## 新增领域

1. 先更新 `docs/architecture/mock-backend.md` 的支持矩阵与状态所有者。
2. 在 `domains/` 下新增领域文件，实现真实内存行为或明确拒绝，不留空壳实现。
3. 在 `mock/index.ts` 显式调用其装配函数。
4. 涉及协议帧/命令时，帧必须经 `@zcode/shared/zcode-protocol-v4` 的 zod schema 自校验，ACK 状态遵循 `docs/architecture/mock-backend.md` 的 ACK 规则。
