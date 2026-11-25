# AIReq 模块与依赖检查

Web 入口负责浏览器装配和平台操作。client／rpc 负责连接与传输，services／shared 提供公开契约、协议和共享规则，server 实现业务写入及会话服务。具体公开入口、依赖方向和分层以[模块登记](../../architecture-policy.yaml)及各包 manifest 为准。

## 状态与职责

| 模块           | 持有的状态和职责                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Web 前端 | 当前项目和 Release、页面与浏览历史、右侧标签、未发送草稿。SR 选择只定位文档，不发给工作流。 |
| Web Agent 聊天 | `/chat` 独立入口、最近列表、会话选择和草稿。通过 ZCode 原生显示层和独立 Agent 通道装配                  |
| AIReq 工作流 | 项目、Release、IR、SR、材料、文档版本和评审。每个 IR 持有本区可用的 Agent 会话引用。 |
| 原生会话服务   | 会话、消息、附件和 Agent 执行。正式服务使用 OMP SDK，原型在内存中模拟执行。 |

列表、文档区和项目统计来自同一工作流投影。

工作流校验原生执行的项目、需求和会话，再接纳材料变更。普通命令以工作流修订号做 CAS；定版使用预检返回的版本与文件快照，核对后按当前规则复核；评审直接捕获接纳时最新已保存材料，只返回意见。确认历史与读取权限见[需求共创](../specs/aireq/proposals.md)。

```mermaid
flowchart LR
  UI[Web 前端] -->|业务操作| W[AIReq 工作流]
  UI -->|聊天消息| N[原生会话服务]
  N -->|材料和执行结果| W
  W -->|按需评审和对话结果| N
  W -->|提交后通知重读| UI
```

原型、正式黄区和正式红区可[分别启动](../../README.md#开发与产品入口)，共用[发布边界](../specs/aireq/contract-design.md#发布边界)规定的前端产物与公开契约。

`web-agent-chat` 与 `aireq-ui` 管理各自的 UI 装配。独立聊天通过[公开入口](../../packages/ui/package.json)使用 ZCode 通用会话部件，其运行行为见[聊天规格](../specs/web-agent-chat.md)。

## 检查范围

- 浏览器依赖检查覆盖策略中的浏览器源码目录和包入口，检查 Node 内置模块、原生包和服务端专属入口。
- 包入口检查核对 workspace 的 `exports`、`imports` 和资源路径。策略引用的根与入口也必须存在。
- 受管模块按登记检查跨模块导入、允许依赖、层级、循环和文件规模。模块以 `module.ts` 声明依赖，策略中的 `publicEntrypoints` 指向实际接口文件，`CONTRACT.md` 记录约束。

## 命令

| 场景                         | 仓库根命令                                             |
| ---------------------------- | ------------------------------------------------------ |
| 定位一个模块的入口和依赖     | `bun run architecture:context aireq-ui`                |
| 检查当前变更及受影响的依赖方 | `bun run architecture:check --changed`                 |
| 对指定提交比较               | `bun run architecture:check --changed --base <commit>` |
| 策略或检查器变更             | `bun run architecture:check`                           |

上下文命令默认列出相关文件路径。需要连同直接依赖的契约正文一起查看时加 `--full`。

新增受管模块时，在 `architecture-policy.yaml` 登记模块目录、依赖和公开入口，同步模块的 `module.ts` 与 `CONTRACT.md`，再运行全量检查。检查发现违规时返回非零退出码。

增量模式从 Git 取得本地差异和未跟踪文件。比较基线依次取 `--base`、`ARCHITECTURE_BASE`、CI 提供的提交、上游或默认分支的共同祖先，最后回退到 `HEAD`。浏览器边界与包入口仍全量检查。新增文件按当前目录和依赖关系接受检查。业务验证见[前端 UT 与后端 ST](../testing/unit-test-quality.md)。
