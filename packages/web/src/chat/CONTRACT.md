# Web Agent 聊天界面

`/chat` 从 `main.tsx` 装配原生显示、工作目录和最近会话列表。`ChatApp` 管理选择与提交，服务 hooks 管理连接和只读会话投影。Agent 服务拥有已提交的会话事实。

页面演进限于本模块的装配和交互。使用 `@zcode/ui/web-chat-view` 获取 ZCode 原生渲染部件。入口、隔离、时序和验收见 [Web Agent 聊天规格](../../../../docs/specs/web-agent-chat.md)。
