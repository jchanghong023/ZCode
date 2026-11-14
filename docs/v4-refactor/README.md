# V4 会话架构：当前状态与文档导航

更新日期：2026-11-14

V4 conversation 的 wire 契约与产品语义仍约束现行代码；本文的拓扑一节描述**当前纯 Web 仓库**。
本目录其余文档混合了两类内容：

- 协议/投影/订阅/故障等**契约规格**：字段、命令、reason code 与不变量仍是现行事实源；
- **实施轨迹**：phasing、deletion、review、parity 记录保留当时基线，正文里的 CLI/Host/relay/desktop
  路径、行数和“待实现”只代表当时状态，不描述当前拓扑。

产品语义见 [Project Goal](../project-goal.md) 与各契约文档，目录总览见 [docs/README.md](../README.md)。

## 当前拓扑（纯 Web）

```text
浏览器
  packages/web 入口 main.tsx（Vite）+ packages/ui（V4 会话界面 src/v4）
  |-- SessionPane / WorkbenchPane + 只读 projection store
  |-- command(commandId, clientId, baseRevision, payload)
  `-- 局部草稿 / 滚动 / 焦点 / 乐观覆盖
          |
          | /ws WebSocket（@zcode/client 连接 SDK）
          v
packages/rpc：SocketProtocol 二进制帧 + Channel RPC
          |
          | services 接口/descriptor：packages/services
          | 会话 wire 契约：packages/shared/zcode-protocol-v4
          v
packages/server 模拟后端
  |-- mock/index.ts：唯一集中装配（ServiceCollection）
  |-- MockRuntime：内存权威状态（sessions/tasks/virtualRoot/git）
  |-- MockTopicLog：topic 的 logEpoch/seq 唯一顺序（不落盘）
  `-- mock/zcodeAgent.ts：会话命令 ACK、订阅与投影下发
```

仓库里没有 CLI、Host/relay、desktop main 进程；旧拓扑中的这些角色已随纯 Web 重构删除。下文出现
“CLI 权威、Host 转发、mobile replayable”等表述时，指的是这些规格成文时的原产品拓扑，不是当前
可执行入口。协议字段、reason code、帧形状与投影语义保持原文，不因进程已删除而删改。

## 当前不变量

- conversation UI 按 projection rows 渲染，不从 flat message 数组重新推导 turn、timeline、endedness
  或 action availability。
- command 使用 `commandId` 幂等身份和可选 `baseRevision`；ACK 与后续 projection 分工明确。
- 每个 attachment/subscription 有独立 ownership、generation、seq 和 recovery；下行帧只投递 owner port。
- snapshot 原子替换；delta 必须连续；gap/epoch 变化触发 resync，恢复在途时不能让迟到帧覆盖。
- 会话 queue 与 interaction pending state 是服务端（当前为 mock 后端）事实；客户端不建立第二份
  accepted queue。
- identity/cache/topic 隔离使用 `workspaceIdentity?.trim() || workspacePath`；路径执行仍使用
  `workspacePath`。
- task 行集合归 `tasks-index`，`sessions-index` 只拥有列表活性与实时详情摘要，客户端以 task row 为
  左表做字段级 join。当前 mock 后端以内存任务索引提供同样的分离。

## 当前代码入口

| 层                 | 入口                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| V4 schema          | `packages/shared/src/zcode-protocol-v4/`                                                                         |
| 浏览器连接         | `packages/web/src/main.tsx`、`packages/client`（`connectViaWebSocket`）                                          |
| UI transport/store | `packages/ui/src/v4/agentConversationTransport.ts`、`conversationProjectionStore.ts`、`sessionDataLayer.ts`      |
| UI pane/commands   | `packages/ui/src/v4/SessionPane.tsx`、`ConversationComposer.tsx`、`WorkbenchPane.tsx`、`V4WorkspaceChatArea.tsx` |
| 服务契约           | `packages/services/src/zcode-agent/zcodeAgent.ts`、`zcodeAgentConnectionScope.ts`                                |
| 服务端装配         | `packages/server/src/mock/index.ts`                                                                              |
| 服务端会话实现     | `packages/server/src/mock/zcodeAgent.ts`、`runtime.ts`（`MockRuntime`/`MockTopicLog`）                           |

## 文档索引

状态含义：

- **契约规格**：字段/命令/订阅/故障语义仍是现行事实源；文中实现路径若指向已删除进程，以当前代码为准。
- **UI 实施**：UI 主干已落地，正文保留实施期设计与对账内容。
- **历史记录**：只用于追溯迁移与验收过程，不描述当前拓扑，也不是当前验证证据。
- **规划**：待执行/待验证的计划，不能当作已实现或已验证。

| 文档                                                                             | 状态     | 当前角色                                                 |
| -------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| [01-topology.md](./01-topology.md)                                               | 历史记录 | 原产品进程拓扑（CLI/Host/relay/desktop）；当前拓扑见本文 |
| [02-projection.md](./02-projection.md)                                           | 契约规格 | 投影语义与裁决；当前实现方为 mock 后端                   |
| [03-commands.md](./03-commands.md)                                               | 契约规格 | command/ACK/inbox 语义；admission 段落描述历史 CLI       |
| [04-sync-and-recovery.md](./04-sync-and-recovery.md)                             | 契约规格 | topic 订阅、seq、snapshot、recovery 规则；投递边界为历史 |
| [05-transport-and-backpressure.md](./05-transport-and-backpressure.md)           | 契约规格 | transport/wire/backpressure 限额；relay 段落为历史       |
| [06-ui.md](./06-ui.md)                                                           | UI 实施  | V4 UI 设计与实施轨迹；当前入口见上表                     |
| [07-persistence.md](./07-persistence.md)                                         | 历史记录 | CLI 持久化与 tasks-index.sqlite；模拟后端只有内存态      |
| [08-phasing.md](./08-phasing.md)                                                 | 历史记录 | M0–M6 分期与清理轨迹，不是当前进度表                     |
| [09-protocol-schema.md](./09-protocol-schema.md)                                 | 契约规格 | 早期 schema 速查；字段冲突以 10 与代码为准               |
| [10-protocol-spec.md](./10-protocol-spec.md)                                     | 契约规格 | V4 字段级主规格                                          |
| [11-deletion-plan.md](./11-deletion-plan.md)                                     | 历史记录 | 硬切迁移的文件级删除清单                                 |
| [12-fault-catalog.md](./12-fault-catalog.md)                                     | 契约规格 | fault/reason code 词表                                   |
| [13-golden-test-mapping.md](./13-golden-test-mapping.md)                         | 历史记录 | 迁移期 case 到测试证据的映射；相关测试体系已退役         |
| [14-sessions-index.md](./14-sessions-index.md)                                   | 契约规格 | sessions-index 规格；持久 task 库为历史实现              |
| [15-timeline-resolver-design.md](./15-timeline-resolver-design.md)               | 历史记录 | timeline resolver 方案与根因分析                         |
| [15-timeline-resolver-design-review.md](./15-timeline-resolver-design-review.md) | 历史记录 | 前审记录                                                 |
| [16-timeline-authority-plan.md](./16-timeline-authority-plan.md)                 | 历史记录 | timeline authority 实施计划与裁决                        |
| [17-cold-resume-runtime-activation.md](./17-cold-resume-runtime-activation.md)   | 历史记录 | CLI runtime 冷恢复方案                                   |
| [18-resume-race-audit-plan.md](./18-resume-race-audit-plan.md)                   | 规划     | 冷启动竞态审计计划，未作为当前证据                       |
| [design-review.md](./design-review.md)                                           | 历史记录 | 迁移前代码审计                                           |
| [review-meeting-brief.md](./review-meeting-brief.md)                             | 历史记录 | 评审历史输入                                             |
| [m5-composer-parity.md](./m5-composer-parity.md)                                 | UI 实施  | composer 能力对账轨迹                                    |
| [m5-composer-restore.md](./m5-composer-restore.md)                               | UI 实施  | composer 还原记录                                        |
| [m6-model-selection-parity.md](./m6-model-selection-parity.md)                   | UI 实施  | 模型选择对账轨迹；旧路径只是基线                         |
| [m6-p1-runtime-model-resolution.md](./m6-p1-runtime-model-resolution.md)         | 历史记录 | 已被 Provider Refactor 取代                              |
| [v4-chat-layout-parity.md](./v4-chat-layout-parity.md)                           | UI 实施  | 会话区布局对账                                           |
| [v4-goal-command-parity-plan.md](./v4-goal-command-parity-plan.md)               | 规划     | `/goal` 命令对账计划，不是验收证据                       |
