# 对话埋点服务退场边界

当前纯 Web 产品删除本目录的服务包装、factory、示例与模块清单，不保留只读空服务面。
原 workspace fact 订阅只服务 desktop-continuous supervisor；Web/mobile 从未启用：
WorkspaceAttachment 没有根挂载者，PaneAttachment 仅在父 attachment 非空时启用，
默认 context 为 null。不能为不可达桌面装配恢复已裁撤的动态遥测 RPC。

- 删除 UI workspace/pane attachment、旧 supervisor 和其专属 composer/context 接线。
- 不改变原生 Web 输入、附件、反馈、发送事务及其 user-action 发送漏斗。
- 保留 shared 遥测 builder/归集算法、Web report 工具、local TTFT、会话打开诊断，
  以及正式 HTTP telemetry 接收；通用 wire DTO 不代表公开订阅能力。
- 本次只删除不可达桌面事实流，不新增空 hook、可选代理或替代后端。
