# gen-ui-service

当前电脑 Web 仅保留 `IGenUiService.listState(scope)`，供会话发送链读取同一 workspace/session 的
已有 widget 状态投影。状态仍归后端 owner；真实空集合不表示文档、沙箱或写状态能力存在。

原因：当前产品没有片段读取、沙箱或 widget 写入消费者；删除 `readDocument`、`prepareSandbox`、
`getState`、`setState`、`onStateChanged`，不以可选接口或空实现保留退役能力。
纯 DTO 与通用展示控件可保留，不引入新的 Agent、MCP server、内容日志或命令队列。
