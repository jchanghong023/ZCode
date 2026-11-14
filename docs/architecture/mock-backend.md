# 模拟后端（Mock Backend）规范

`packages/server` 是纯 Web 形态的模拟后端：内存态、确定性数据，经与真实服务端相同的 WebSocket RPC（`@zcode/rpc` ChannelServer + Protocol v4）向浏览器 UI 提供 `packages/services` 契约。本文记录模拟后端能力、状态所有者和协议约束，不建立独立的能力矩阵实现层。

## 1. 范围与非目标

- 目标：协议语义保真，UI 不需要 mock 分支；未实现的能力必须**明确拒绝**，不能返回假成功。
- 非目标：生产级持久化、真实网络/文件写入、与真实 Agent 运行时等价。模拟后端只有内存状态。
- 唯一允许的本地读取：项目选目录/目录浏览读取本机真实目录名（`projectService.readDirectory`），不读写文件内容。
- 唯一传输层例外：`MockRuntime` 内的 topic 水位账本（`MockTopicLog`）是协议顺序的权威来源；不落盘。

## 2. 能力状态

每个领域/接口在能力矩阵中只有一种状态：

| 状态          | 定义                                           | 可观察行为                                                   |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `supported`   | 有真实内存状态转换                             | 帧/返回值随操作变化；ACK 才会是 `accepted`                   |
| `compatible`  | 只读或空集合投影，形状合法，不改写状态         | 查询返回确定性空值/快照；写入口不存在或返回 `noop`/只读投影  |
| `unavailable` | 需要真实网络、磁盘、进程或账号，模拟后端不实现 | 读取返回空形状；写入抛 `mock: …未启用`；v4 命令回 `rejected` |

`compatible` 不是"假装支持"：它只用于 UI 需要的**只读目录/空集合**，任何会改变用户数据期望的写操作都必须是 `unavailable` 并显式失败。

### 2.1 矩阵

| 领域 / 接口                                                     | 状态        | 说明                                                               |
| --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| conversation / sessions-index topic                             | supported   | 快照 + 增量、seq/logEpoch、workspace 隔离                          |
| workspace-config topic                                          | compatible  | 空配置目录（`configOptions: []`, `slashCommands: []`），只读快照   |
| controller/workspaces、controller/tasks-index                   | supported   | workspaces 单工作区快照；tasks-index 由 runtime 任务投影并增量下发 |
| controller 任务/归档删除                                        | unavailable | 不跨入会话生命周期执行删除，调用明确拒绝                           |
| v4 会话命令（见 §4）                                            | supported   | 真实内存状态转换                                                   |
| 其它 v4 会话命令                                                | unavailable | ACK `rejected` + `fault.command.capabilityUnsupported`             |
| 文件树 / 文件读取 / 搜索                                        | supported   | 虚拟工作区 fixture；不读写真实文件                                 |
| Git 面板                                                        | supported   | 虚拟仓库状态；不发起真实 git/网络                                  |
| 设置、凭据（内存）、客户端配置                                  | supported   | 设置域内存态；凭据不落盘                                           |
| OAuth / 账号                                                    | compatible  | 固定已登录模拟账号，不发起真实 OAuth                               |
| Provider / 模型选择 / 用量                                      | compatible  | 确定性模型目录与空用量；不联网                                     |
| Coding Plan 订阅/支付/企业套餐                                  | unavailable | 读取返回空集合；支付/领取/协议签置抛错                             |
| 插件目录/安装/配置、扩展宿主、扩展视图/授权                     | unavailable | 空目录 + `canInstall/canConfigure=false`；安装/配置/视图创建抛错   |
| 工作区资产（子智能体/命令/钩子/记忆/技能/输出风格）             | compatible  | 只读空集合；写操作抛错                                             |
| 配置同步（MCP/插件/技能/用户配置/设备同步）                     | compatible  | 只读空清单；写入返回不可写/空结果，不伪造远端成功                  |
| 任务分组 / 受管 worktree / Source Server                        | compatible  | 空分组/空快照；需要真实仓库或远端的写操作抛错                      |
| 闲时任务 / Bots                                                 | unavailable | 只读空投影，注册/保存/绑定抛错                                     |
| 会话分享 / 附件暂存 / Onboarding / 加速卡                       | unavailable | `publish/import=false`，空快照；真实操作抛错                       |
| 反馈 / GenUI / 语音 / 云内容 / 营销触达 / Provider Provisioning | unavailable | 空形状读取；真实操作抛错                                           |

## 3. 状态所有者

一个状态只有一个所有者；其它模块只能通过公开契约读取，不得持有副本。

| 状态                                                                      | 唯一所有者                                        | 写入者                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| 会话 rows/`seq`/`logEpoch`/revision/phase/config/queue/plan/usage/pending | `MockRuntime.sessions`（`MockSession`）           | `MockZCodeAgentService` 命令处理                                               |
| 任务索引（title/pinned/archived/unread 等）                               | `MockRuntime.tasks`                               | `MockZCodeAgentService`、`MockZCodeTaskService`、`MockWindowControllerService` |
| 虚拟文件系统 / 虚拟 Git                                                   | `MockRuntime.virtualRoot` / `MockRuntime.git`     | `Mock*FileService` / `MockGitService`                                          |
| topic 水位（sessions-index / workspace-config / controller）              | `MockRuntime.topics`（`MockTopicLog`）            | 对应 topic 的唯一发布函数                                                      |
| 应用设置                                                                  | `MockSettingService`（设置域）                    | `MockSettingService.update`                                                    |
| 内存凭据                                                                  | `MockCredentialService`（设置域）                 | `MockCredentialService.save/delete`                                            |
| v4 订阅表与 `subscriptionId` 归属                                         | `MockZCodeAgentService` + 每连接 connection scope | subscribe/unsubscribe                                                          |
| controller 订阅表                                                         | `MockWindowControllerService`                     | subscribe/unsubscribe/resync                                                   |

装配图：

```text
mock/index.ts（唯一集中装配）
  ├─ MockRuntime（权威内存状态 + topic 水位）
  ├─ workspace.ts / project.ts / zcodeTask.ts / zcodeAgent.ts（协议面）
  └─ domains/*（按领域注册服务，只写自己的私有状态）
        settings ─ models ─ plugins ─ extensions ─ assets ─ sync
        projects ─ automations ─ sharing ─ compat-surfaces
```

## 4. ACK 语义（v4 会话命令）

命令入口：`sendConversationCommandV4(envelope)`。信封与 payload 先经 `parseCommandEnvelope` 校验。

信封 `workspace` 按官方 schema 可选（Host 冷恢复注入）；一旦携带就必须是完整的
`ZCodeWorkspaceRef`：`workspacePath` 与 `workspaceKey` 必填，且
`workspaceKey = workspaceIdentity?.trim() || workspacePath`（身份唯一来源，不另行编造）。
`createSession` 的 payload 必带 `workspaceId = workspaceKey`（Host 预留归属）。信封字段不全即
`fault.command.invalidEnvelope`，不能靠 mock 兜底；真实 Host 发送命令时按这一构造携带身份。

| 情况                                      | ACK                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 命令受支持且完成了状态转换                | `accepted`，`revisionAtDecision` = 当前 revision，必要时带 `result`                                                           |
| 受支持但目标已是终态/不存在，无需改变状态 | `noop`（可带 reasonCode，如 `proto.alreadyResolved`）                                                                         |
| 命令未实现                                | `rejected` + `reasonCode=fault.command.capabilityUnsupported` + `message`，零状态变更                                         |
| 信封或 payload 非法                       | `rejected` + `fault.command.invalidEnvelope`                                                                                  |
| 会话不存在或不属于信封 workspace          | RPC 错误 `fault.command.sessionNotFound: <sessionId>`                                                                         |
| 未知/已失效 `subscriptionId` 的 resync    | RPC 错误 `fault.subscription.unknownSubscription`；跨连接复用他人 id 时由 connection scope 先回 `fault.subscription.notOwned` |

规则：

1. **`accepted` 必须可观察**：写队列命令要更新 `queue.items`，会话生命周期命令要更新 `phase/control`，标题/模型命令要更新 `meta/config` 并下发帧。
2. **不做假成功**：未实现命令一律走 `rejected` 分支；`default` 分支只有这一个出口。
3. **不提供 command 去重**：mock 不缓存 `commandId`，不会返回 `duplicate`；客户端重试可能重复执行（模拟后端限制，UI 不得依赖 duplicate 语义）。
4. **CAS 未裁决**：`baseRevision` / `baseLogEpoch` 按协议必填项校验，但 mock 不比较版本；ACK 的 `revisionAtDecision` 是客户端对账依据。
5. `noop` 不改变 revision，也不推进 topic 水位（除显式 `patchQueue` 的受支持命令外）。
6. 会话从 `MockRuntime.sessions` 删除后，旧 turn 不得再次发布 sessions-index upsert 或启动队列下一项；controller 不直接删除会话。

### 4.1 受支持命令

| 命令                                          | 内存转换                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createSession`                               | 新建 `MockSession` + task 记录，发 sessions-index upsert；有 firstInput 立即开 turn                              |
| `sendText`                                    | 空闲：开 turn；运行中：生成真实 queue item（ACK `delivery=queue`）并下发 `queue`                                 |
| `stop`                                        | 运行中：中断 turn、暂停自动续跑（`autoDrain=false`，`pauseReason=stopped`）；空闲但队列未暂停：暂停；否则 `noop` |
| `sendQueuedNow`                               | 从队列移除并立即开始；运行中先中断当前 turn，收口后开始该项                                                      |
| `lockQueueItemEdit` / `releaseQueueItemEdit`  | 冻结/释放 editLock；违反 `guard.queueItemReserved` / `guard.queueItemEditLocked` 时 `noop`                       |
| `editQueueItem`                               | 原地替换正文/附件/模型/模式；持锁校验失败回 `noop` + `guard.queueEditLockLost`；成功后释放锁                     |
| `reorderQueueItem` / `deleteQueueItem`        | 调整顺序/删除；锁定项回 `noop` + `guard.queueItemEditLocked`                                                     |
| `applyQueueItemsConfig`                       | 对匹配的排队项应用模型/模式；无适用项 `noop`                                                                     |
| `setAutoDrain`                                | 更新 autoDrain/pauseReason；恢复自动续跑时空闲会话立刻 drain                                                     |
| `resolveInteraction`                          | 移除 pendingInteraction；权限卡继续执行；已解决回 `noop` + `proto.alreadyResolved`                               |
| `renameSession`                               | 更新 session meta + task 标题 + sessions-index                                                                   |
| `deleteSession`                               | 删除 session/task，发 sessions-index removed                                                                     |
| `switchModelConfig`                           | 更新 config 并追加 modelChange 标记行                                                                            |
| `switchCollaborationMode` / `setFollowupMode` | 更新 config 并下发 `config` patch                                                                                |
| `setAssistantFeedback`                        | 更新/清除 assistantText 行反馈；目标不存在 `noop`                                                                |

### 4.2 未支持命令

`compact`、`forkAssistant`、`applyFileRewind`、`editUserQuery`、`retryTurn`、`setHighspeedMetrics`、`respondWorkspaceHookReview`、`toggleWorkspaceHookReviewItem`、`revokeWorkspaceHookTrust`、`requestWorkspaceHookReview`、`snoozeInteractionAutoResolution`、`sendGoalCommand`、`stopSubagent`、`pauseGoal`、`resumeGoal`、`cancelBackgroundWork`、`resumeWorkflowRun`、`startSavedWorkflow`、`amendWorkflowRunSettings`、`createSelectionSideSession`、`discardSharedContext`。

这些命令此前返回 `accepted` 但不改变任何状态，造成 UI 显示成功而实际未执行；现在统一 `rejected` + `fault.command.capabilityUnsupported`。UI 按协议通用错误路径展示，不新增 mock 分支。

## 5. Topic 顺序

### 5.1 水位不变量

- `logEpoch` 是 topic 的代际；同一 topic 内稳定，topic 创建时生成（conversation 由 session 创建时生成）。
- `seq` 单调递增；一条已发布记录 = `(fromSeq, toSeq]`，其中 `toSeq = fromSeq + 1`。
- **快照帧**：`fromSeq = 0`、`toSeq = 当前水位`；快照本身不推高水位。
- **增量帧**：发布时推进一次水位；同一批变更只发一个 `toSeq`，同一 topic 的所有订阅者拿到相同的 `(fromSeq, toSeq]`。
- `sessions-index` / `workspace-config` / `controller/*` 由 `MockTopicLog` 记账：没有订阅者时不推进，避免无人观察的水位空洞。conversation 的 `seq` 是会话投影日志水位，随投影推进（即使暂无订阅者），快照用 `toSeq` 对齐。
- `subscriptionId` 每次订阅新生成、绝不复用；帧只携带其所属订阅的 id。

### 5.2 各 topic

| topic                            | 水位所有者                     | 发布时机                                                     |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `conversation/<sessionId>`       | `MockSession.seq/logEpoch`     | 每次 `patchState`、行追加/更新/增量、快照订阅（不推进）      |
| `sessions-index/<workspaceId>`   | `MockTopicLog`（workspace 级） | v4 createSession / renameSession / deleteSession / turn 收口 |
| `workspace-config/<workspaceId>` | `MockTopicLog`（workspace 级） | 订阅与 resync 快照；当前 mock 无配置变更，水位不推进         |
| `controller/workspaces`          | `MockTopicLog`                 | 订阅/resync 快照                                             |
| `controller/tasks-index`         | `MockTopicLog`                 | 订阅/resync 快照；任务增删改时一条 delta 帧（同批共享水位）  |

### 5.3 订阅与归属

```text
subscribe → 注册 subscriptionId
          → 返回 ack { subscriptionId, mode: "snapshot", logEpoch }
          → 下发快照帧（fromSeq=0, toSeq=当前水位）
变更      → 推进一次水位 → 向该 topic 的订阅者发同一区间增量帧
unsubscribe → 删除订阅；之后不再有该 subscriptionId 的帧（重复 unsubscribe 幂等）
resync    → 未知 subscriptionId 抛 fault.subscription.unknownSubscription
```

- conversation 订阅按 `sessionId` 匹配；session 属于另一个 workspace 时按 `fault.command.sessionNotFound` 处理，不读取跨工作区状态。
- sessions-index 与 workspace-config 订阅按 `workspaceKey`（`workspaceIdentity ?? workspacePath`）匹配，跨工作区不串帧。
- agent topic 的每个 WebSocket 连接由 `createZCodeAgentConnectionScope` 建立独立 ownership：帧只路由给拥有该 `subscriptionId` 的连接，跨连接 resync/unsubscribe 被拒绝。
- controller topic 仅由共享的 `MockWindowControllerService` 订阅表过滤，当前没有逐连接 ownership；这是原型限制，本次不新增 scope 机制。

## 6. 能力投影与前端

- 服务端能力字面量直接由各服务按已有 wire 契约返回，不单独维护能力矩阵或新增 capability store。
- 浏览器本机操作归 `packages/web/src/platform`（见 `docs/ui/browser-capabilities.md`），不能据此推导服务端工作区能力。
- UI 只消费 wire 值；禁止按 `mock` 名称或能力来源新增分支。

## 7. 验证

本文件不新增测试或专用验证入口。模拟后端的验证只走既有手段：

- `pnpm dev`：启动真实 mock HTTP/WS 服务与 Web UI（回环），浏览器内走真实 RPC/帧渲染路径。
- 根 `pnpm typecheck`：校验协议/服务装配与 wire 类型（含 `zcode-protocol-v4` 官方 schema 的类型面）。
- 浏览器与协议行为按 §4、§5 的不变量人工验收：三类 topic 的快照/增量、`(fromSeq,toSeq]` 连续性、`logEpoch` 稳定、`workspaceKey` 隔离、`subscriptionId` 归属、unsubscribe/resync、受支持/未支持命令的 ACK 语义。

已观察到的真实协议结果（一次性协议冒烟，脚本已按用户要求删除、不作为仓库资产，也不保留任何根命令入口）：交付修复后该流程实际执行完成，耗时约 1.10s，全流程通过，原始输出末尾为「subscriptionId 归属、unsubscribe、resync 通过」与「全部协议冒烟通过」。该次运行真实启动 mock 服务并经 `@zcode/client` 建立真实 WebSocket 连接，实际覆盖并校验：

- hello/initialize 握手（`protocolVersion=3`），两条独立连接均建立成功。
- conversation / sessions-index / workspace-config 三类 topic 的快照与增量帧：快照 `fromSeq=0`、`logEpoch` 与订阅 ack 一致，增量 `(fromSeq,toSeq]` 连续、会话 `logEpoch` 稳定，resync 重发快照。
- 工作区隔离：A 工作区创建会话不向 B 的 sessions-index 订阅者发帧；跨工作区订阅会话被拒（`fault.command.sessionNotFound`）。
- `subscriptionId` 归属：第二连接 resync 第一连接的订阅被拒（`fault.subscription.notOwned`）；unsubscribe 后该 `subscriptionId` 不再收帧，另一连接的订阅继续收帧。
- 受支持命令产生可观察状态转换：`createSession`、运行中 `sendText` 入队（ACK `delivery=queue` 与 `queue` 投影一致）、`renameSession`、`setFollowupMode`、`switchModelConfig`。
- 未支持命令 `pauseGoal` / `compact` 回 `rejected` + `fault.command.capabilityUnsupported`，revision 不变。
- 负例：信封本身合法、payload 非法的独立用例回 `fault.command.invalidEnvelope`，合法命令用例不受影响。

上述结果为交付修复阶段的实测证据；临时脚本已删除，不重新创建、不重跑。第二阶段的 RPC adapter 不在这轮实测范围内，尚需按前文既有方式（`pnpm dev` / 根 `pnpm typecheck` / 浏览器）单独验收，不能记为已验证。

这些场景对应的行为契约（供人工/后续验证对照，不含新增脚本）：

1. hello/initialize 握手（`protocolVersion=3`）。
2. conversation / sessions-index / workspace-config 三类订阅的快照帧与 ack（`subscriptionId`、`logEpoch`、`fromSeq=0`）。
3. 增量帧的 `(fromSeq,toSeq]` 顺序与会话 `logEpoch` 稳定；快照重同步。
4. 工作区隔离：A 工作区创建会话不向 B 的 sessions-index 订阅者发帧；跨工作区订阅会话被拒。
5. `subscriptionId` 归属：第二连接不能 resync 第一连接的订阅（`fault.subscription.notOwned`）；unsubscribe：解除后不再收到该 `subscriptionId` 的帧，另一连接的订阅继续收帧。
6. 未支持命令（`pauseGoal`、`compact`）ACK `rejected` + `fault.command.capabilityUnsupported`，且 revision 不变；合法信封 + 非法 payload 的独立负例回 `fault.command.invalidEnvelope`，合法命令用例不受影响。
7. 受支持命令（`createSession`、`renameSession`、`setFollowupMode`、运行中 `sendText` 入队、`switchModelConfig`）产生可观察状态转换与合法帧；命令信封的 workspace 身份为完整 `ZCodeWorkspaceRef`（`workspaceKey = workspaceIdentity?.trim() || workspacePath`），`createSession` payload 带 `workspaceId = workspaceKey`。

已知未覆盖：浏览器渲染、真实文件/Git 操作、controller topic（由 UI 运行时使用），以及 command 去重/CAS（见 §4 限制）。
