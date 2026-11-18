# Session control

本包仅保留 `@zcode/session-control/contracts` 的会话控制端口类型与 schema；CLI/App 实现、测试 facade 和宿主装配已退役。当前 Web 不装配桌面 App 控制宿主，这些类型不代表存在公开 RPC 或可调用实现。

- 入口：`packages/session-control/src/contract.ts`，由 `packages/shared/src/app-control/contract.ts` 类型消费。
- 不得据此恢复 CLI/App 服务、descriptor、测试入口或桌面控制宿主。
