# gen-ui-service

当前治理范围（纯 Web）：gen-ui 服务契约 `contract.ts`（`IGenUiService`）。执行 Host 的片段读取与
桌面 Host 的 widget 状态实现已随裁撤移除；mock 后端（`packages/server/src/mock/domains/compat-surfaces.ts`）
与 `packages/ui/src/gen-ui` 按同一契约注册与调用。

- `readDocument` 属于执行 Host：只读受限、非符号链接的片段；创建失败必须在运行时宣告可写目录之前暴露。
- 状态属于桌面 Host：按 workspace identity（路径兜底）+ session 定界，状态存储是注入的 adapter；
  原子替换与跨进程文件锁序列化整份快照，通知只是持久状态的投影。
- `prepareSandbox` 返回带入站证明的沙箱句柄；Main 拥有原生沙箱资源，不拥有持久状态。
- 模型状态只作为受限的 `genUiContext` 元数据传递，不拼接到用户正文；旧尾部解码与提醒投影归 CLI。
- 不引入新的 Agent、MCP server、内容发布日志或已接受命令队列：远程 workspace 走现有远程服务路由，
  桌面状态走 base services。
