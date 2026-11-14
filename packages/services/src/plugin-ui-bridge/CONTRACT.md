# plugin-ui-bridge

当前治理范围（纯 Web）：UI 与 Agent MCP 之间的桥契约——`contract.ts`（资源桥）、`appToolsContract.ts`
（App 工具）、`samplingContract.ts`（sampling 透传），公开入口 `index.ts`。Host 实现与桌面沙箱注册链
已随裁撤移除；mock 后端（`packages/server/src/mock/domains/plugins.ts`）与 `packages/ui/src/plugin-ui`
按同一契约注册与调用。

- UI 只依赖 `IPluginUiBridgeService`，不直接读取 HTML 或连接配置，也不直接调用 agent service。
- `prepareSandbox` 按 (ownerWebContentsId, workspaceKey, sessionId, pluginId, scopeId) 幂等：重复调用返回同一
  sandboxId 与递增 initId；同键并发调用各自拿到自己的 initId，顺序调用重新读取以拿最新 HTML。
- HTML 上限 16 MiB，mimeType 只接受 `text/html;profile=mcp-app` 或 `text/html`；超限拒绝，不截断。
- 调用归属、权限、取消与终态归 Agent；Host 不缓存执行结果、不重放工具。取消以 callId 显式请求。
- `resources/read` 原样返回 MCP contents，解码总量限 8 MiB；订阅按 (server, uri) 引用计数，dispose 只退订
  本代际。
- Sampling 走独立描述符透传请求与取消，不扩张资源桥方法集合；未注入时不声明 capability。
- 只支持本地 workspace Agent；远程保持现有不支持语义，复用 Host attachment、workspace identity 与会话 lease。
