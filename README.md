# ZCode Web

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode" width="128" height="128" />
</div>

ZCode 的纯 Web 版本：浏览器前端 + 模拟后端服务。桌面应用与真实 Agent 运行时已移除；`packages/server` 按与真实服务端完全相同的 WebSocket RPC 协议（ZCode Protocol v4）提供内存态模拟实现，浏览器界面与原先一致。

## 初始化

准备 Git、Node.js **24.14.0** 和 pnpm **10.33.2**（版本以 [mise.toml](mise.toml) 为准）：

```bash
pnpm bootstrap
```

## 开发

```bash
pnpm dev        # 同时启动模拟后端(:3030)与前端 Vite(:5173)
```

打开 <http://localhost:5173> 即可使用完整界面：会话/任务管理、流式对话、工具调用展示、文件树、Git 面板、设置页等。所有数据由模拟后端的内存状态驱动（虚拟工作区、确定性回复）。

## 构建

```bash
pnpm build      # 构建全部包；packages/web 产物为静态站点
```

生产形态：`packages/server` 构建产物支持 `ZCODE_WEB_STATIC_ROOT=<web dist>` 直接托管前端静态资源，单进程部署（HTTP + WebSocket + SPA fallback）。

## 仓库结构

| 目录                | 职责                                                  |
| ------------------- | ----------------------------------------------------- |
| `packages/web`      | 浏览器前端入口（Vite）                                |
| `packages/ui`       | 共享 React 组件、hooks 与 Zustand store               |
| `packages/server`   | 模拟 Web 后端（Hono + WebSocket RPC + mock 服务集合） |
| `packages/rpc`      | VS Code 风格 IPC/RPC 框架（生产实现）                 |
| `packages/client`   | 浏览器连接 SDK（WebSocket → IServiceAccessor）        |
| `packages/services` | 服务接口与 descriptor 契约层                          |
| `packages/shared`   | 共享协议与类型（含 ZCode Protocol v4）                |
| `packages/provider` | Provider/模型选择纯逻辑                               |
| `docs/`             | 前端设计相关文档                                      |
| `DESIGN.md`         | UI 设计规范                                           |
| `CONTEXT.md`        | 插件商店领域词汇                                      |

## 常用命令

| 用途       | 命令                                |
| ---------- | ----------------------------------- |
| 类型检查   | `pnpm typecheck`                    |
| Lint       | `pnpm lint`                         |
| 格式检查   | `pnpm fmt:check`                    |
| 架构检查   | `pnpm architecture:check --changed` |
| 提交前检查 | `pnpm verify:pre-push`              |

## License

Apache-2.0，详见 [LICENSE](LICENSE) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
