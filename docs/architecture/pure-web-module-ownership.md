# 纯 Web 模块所有权

可执行模块边界以 `architecture-policy.yaml` 和各模块 `module.ts` 为唯一依据，不在本文复制模块目录或引入登记流程框架。

2026-11-17 接口收口：未挂载的桌面对话遥测服务包装及 UI attachment 已删除，`conversation-telemetry-service` 撤销登记；当前 Web 遥测仍使用 `conversation-telemetry-engine` 与正式 HTTP 接收。`task-groups` 仅保留纯 DTO，GenUI 服务仅保留发送链 `listState`。当前职责及删保清单以发布规格和可执行策略为准，下方补齐产物表是重构时的历史记录，不构成恢复旧服务的要求。

本轮配额消费者仅读取 reset status／entitlement，不再提供旧配额重置写面；Bots 消费者只通过 getConfig／getBotStates 和已接收来源展示群任务、成员姓名及投递状态，不恢复成员目录、重发、协调或预热接口。三个既有 UI 消费者按精确路径登记 existing-edit 例外，仅处理本次只读迁移的准入，不放宽浏览器安全、依赖或大小规则。

- web 提供浏览器平台操作；ui 通过 hooks 使用服务与平台接口。
- `browser-employee-entry` 复用 `packages/web/src/auth` 登记根，替代原 `web-auth`；该模块只拥有当前标签页的自报工号、浏览器保存与入口展示。Root 只接收只读操作者投影和退出命令，不再存在产品 OAuth RPC、后端账号 mock 或 token 恢复 owner。模型/工具凭据不属于此模块。
- services 保留现有接口、descriptor 与装配方式；rpc/client 保留真实传输实现。
- server 的 mock 数据在内存中；领域拆分不创建第二套服务注册表或复制状态。
- shared 的浏览器安全契约与 Node 专用实现分开，Node 专用入口不得进入浏览器图。
- 新代码按既有治理规则登记。精确路径例外只接纳现有文件改动，不能豁免浏览器安全规则；路径和包出口必须存在。
- 纯 Web 裁撤留下的缺产物登记已逐模块处理完毕（见下表）：有源码的模块补齐真实产物，已无源码的模块撤销登记。
  缺产物基线从 53 条降到 0 条，没有新登记、没有空壳产物，也没有降低任何仍在治理的模块的 `managed` 状态。
- 将来新增源码仍必须落在 managed 模块内；新目录先 `pnpm architecture:adopt` 登记并写真实产物。本文表格只是
  现状记录，不是登记流程，也不能当作绕过 `unmanaged-new-file` 的依据。

## 历史：纯 Web 重构补齐产物的模块（14 个，29 条基线）

这些模块在当时的纯 Web 树中具有契约文件与消费者；表内路径和服务职责仅描述该次基线。
当时缺的 `module.ts` / `contract.example.ts` 按已有公开契约补齐，只表达调用语义，不复制业务状态、
不引入运行逻辑。`CONTRACT.md` 同时改写为当前治理范围（入口、消费者、仍成立的不变量），删掉已随裁撤移除的
实现文件名与失效的文档链。

| 模块                             | 登记根                                           | 公开入口                                                                                    | 真实消费者                                                                                         |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `storage`                        | `packages/services/src/storage`                  | `contract.ts`                                                                               | `packages/ui/src/resource-manager/storage`（同形 `StorageManagementApi`）                          |
| `conversation-telemetry-service` | `packages/services/src/conversation-telemetry`   | `contract.ts`（原 `conversationTelemetry.ts` 改名）                                         | `@zcode/services` 根入口                                                                           |
| `project-storage`                | `packages/services/src/project-storage`          | `contract.ts`、`repository-contract.ts`                                                     | `project` 模块                                                                                     |
| `project`                        | `packages/services/src/project`                  | `contract.ts`（含 `data/contract.ts` 再导出）                                               | `packages/server/src/mock/project.ts`、`packages/ui/src/project-sidebar`                           |
| `project-catalog`                | `packages/services/src/project-catalog`          | `index.ts`、`contract.ts`                                                                   | `packages/ui/src/workspace-config-catalog`                                                         |
| `gen-ui-service`                 | `packages/services/src/gen-ui`                   | `contract.ts`                                                                               | `packages/server/src/mock/domains/compat-surfaces.ts`；保留协议数据，不再由 Web 创建沙箱页面       |
| `plugin-ui-bridge`               | `packages/services/src/plugin-ui-bridge`         | `index.ts`、`contract.ts`、`appToolsContract.ts`、`samplingContract.ts`                     | `packages/server/src/mock/domains/plugins.ts`、`packages/ui/src/plugin-ui`                         |
| `task-groups`                    | `packages/services/src/task-groups`              | `contract.ts`                                                                               | `packages/server/src/mock/domains/projects.ts`、`packages/ui/src/project-sidebar/useTaskGroups.ts` |
| `window-project-directory`       | `packages/services/src/window-project-directory` | `index.ts`、`contract.ts`                                                                   | `packages/server/src/mock/index.ts`                                                                |
| `data-sync-service`              | `packages/services/src/data-sync`                | `index.ts`、`contract.ts`                                                                   | `packages/server/src/mock/domains/sync.ts`、`packages/ui/src/data-sync`                            |
| `voice-input-service`            | `packages/services/src/voice-input`              | `index.ts`、`contract.ts`                                                                   | `packages/server/src/mock/domains/compat-surfaces.ts`、`IServiceAccessor.voiceInputService`        |
| `managed-worktree-tasks`         | `packages/services/src/managed-worktree-tasks`   | `contract.ts`                                                                               | `packages/server/src/mock/domains/projects.ts`、`packages/ui/src/managed-worktrees`                |
| `extensions-service`             | `packages/services/src/extensions`               | `index.ts`、`contract.ts`（+ 经 `index.ts` 导出 `grants/contract.ts`、`views/contract.ts`） | `packages/server/src/mock/domains/extensions.ts`、`packages/ui/src/extension-slots`                |

依赖边同步收敛：`extensions-service` 删掉指向 `app-control` 的 requires（源码中已无该导入），
`managed-worktree-tasks` 删掉指向 `managed-worktree-repo` 的 requires（Git adapter 已随裁撤移除）。

## 已撤销登记的退役模块（8 个，24 条基线）

这些登记根在纯 Web 裁撤后只剩 `CONTRACT.md`，没有任何源码文件、也没有任何消费者导入：登记不再覆盖治理对象，
继续保留只会让缺产物基线永久存在。因此撤销模块登记（不是把 `managed` 改成 `false`），并保留 `CONTRACT.md`
作为设计记录，文件顶部标明退役状态。恢复实现前必须先 adopt 重新登记。

| 模块                           | 原登记根（已撤销）                                    | 撤销原因                                                                                | 移除基线 |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| `app-control`                  | `packages/services/src/app-control`                   | App 反向 RPC 端口与 Desktop/CLI 运行链路一并移除                                        | 3        |
| `bot-project-runtime`          | `packages/services/src/bot-project-runtime`           | Bot 远端项目 runtime 路由随 Agent 运行时移除                                            | 3        |
| `bot-topic-history-attachment` | `packages/services/src/bots/topic-history-attachment` | 话题历史附件构造随 bots 运行时移除（请求形状保留在 `bots/bots.ts`）                     | 3        |
| `managed-worktree-repo`        | `packages/services/src/git/managed-worktree`          | Git worktree adapter 随桌面 Host 移除（任务编排契约仍在 `managed-worktree-tasks`）      | 3        |
| `project-workspace-navigation` | `packages/services/src/project-workspace-navigation`  | 手机项目导航 admission 随手机远控链路移除（目录准备仍在 `project` 的 `prepareSession`） | 3        |
| `startup-storage`              | `packages/services/src/startup-storage`               | CLI `storage-migrate` 启动屏障随 CLI 移除                                               | 3        |
| `task-facts`                   | `packages/services/src/task-facts`                    | CLI 会话事实摄入随 Agent 运行时移除                                                     | 3        |
| `windows-runtime-host`         | `packages/services/src/windows-runtime-host`          | Windows Job 托管 Host 随桌面应用移除                                                    | 3        |

## 验收

- `architecture-policy.yaml` 不再登记 0 源码目录，`requires` 无悬空 id。
- `.architecture-baseline.json` 的 `violations` 为空：53 条缺产物全部按「补齐真实产物」或「撤销退役登记」解决。
- 全部 managed 模块均具备 `module.ts`、`contract.ts`、`contract.example.ts`、`CONTRACT.md`。

构建、清理和源码包约定分别见 `web-build-workflow.md` 与 `internal-source-packages.md`。
