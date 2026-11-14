# 对话埋点服务面

当前治理范围（纯 Web）：本模块只保留 workspace 级只读服务面 `contract.ts`，经 `@zcode/services`
根入口导出。桌面 Host 与 CLI 实现已随裁撤移除，mock 后端不注册该通道；契约约束后续实现者。

- 一个执行服务 workspace 持有一份归集器，寿命不绑定手机 attachment 或桌面 pane；归集算法在
  shared 的 `conversation-telemetry-engine`，本模块只包装已完成 clientMode 鉴权的 connection-scoped
  agent service，不另开 RPC channel。
- 输入为 CLI live facts，只有可信 command 来源为 mobile 的执行及其子任务被接管；返回的接管标记
  用于阻止 renderer 再次计数。PC 续聊按新 command 单独判定。
- 带 workspace 参数的 RPC Event 必须走 `onDynamic*` 命名，否则 ProxyChannel 会把 target 误当 listener。
- snapshot/replay 不补报，dispose 清理统计状态；不改变业务命令、任务和队列。
- 远端 Source 的订阅必须先检查能力声明；手机与桌面复用同一 owner，不复制订阅状态。
