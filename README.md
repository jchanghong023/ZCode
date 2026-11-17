# AIReq — AI 需求协作

面向电脑浏览器的需求澄清、评审与跟踪平台。前端为 React／Vite，服务端为 Bun／Hono 内存模拟后端；两端通过同源 WebSocket 二进制 Channel RPC 通信，业务会话使用 ZCode Protocol v4。

当前没有真实 Agent、AI／Git 执行、数据库持久化或可信工号认证。服务重启会重新初始化内存业务数据。完整能力边界见[系统范围](docs/project-goal.md)与[服务端说明](docs/architecture/mock-backend.md)。

## 环境与安装

- Bun **1.4.4**，由 `mise.toml` 固定；JavaScript／TypeScript 工具统一由 Bun 执行。
- pnpm **10.33.2**，由 `package.json` 固定，用于 workspace 依赖管理，不要求安装 Node.js 或全局 pnpm。

```bash
mise install
bun run bootstrap
```

不使用 mise 时，先安装固定版本 Bun，再执行 `bun run bootstrap`。初始化会校验工具链、刷新被补丁修改的依赖、安装 workspace 依赖并构建前后端。

独立管理依赖：

```bash
bun x --bun --package pnpm@10.33.2 pnpm install
```

不要使用 `bun install` 或系统 pnpm／Corepack shim 替代上述安装入口。首次获取包管理器和依赖需要 registry 或预先准备的缓存。

## 开发与产品入口

```bash
bun run dev
```

浏览器打开 <http://localhost:5174>。Vite 监听 `5174`，模拟后端监听 `3031`，开发代理转发 `/api` 和 `/ws`。

工号格式为一个小写英文字母加八位数字；它用于操作留痕与会话隔离，不验证本人。默认进入项目总览。

- 全局：项目总览、想法池。
- 侧栏选择项目和具体 Release；当前项目、需求共创、开发任务、进度分析及我的待办使用该范围。
- 设置：外观、项目配置、AI 配置。
- 报告、材料、历史和分析执行报告使用统一右侧标签工作区。
- Sketch 可绘制并发送 PNG；Skill 设计实现保留但没有公开导航入口。

界面与业务规则见[当前文档索引](docs/README.md)。

## 构建与部署

```bash
bun run build
ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun packages/server/dist/entry-http.js
```

构建产物为 `packages/server/dist/entry-http.js` 和 `packages/web/dist/`。后端 bundle 由固定版本 Bun 执行，可同时托管 HTTP、WebSocket 和前端静态资源，不依赖部署目录的 `node_modules`。

PowerShell 先设置 `$env:ZCODE_WEB_STATIC_ROOT = (Resolve-Path packages/web/dist).Path`，再运行后端产物。`PORT` 控制后端端口，`ZCODE_SERVER_HOST` 控制监听地址；部署访问控制、HTTP 资源和 WebSocket 必须保持同源契约，详见[构建与运行](docs/architecture/web-build-workflow.md)。

## 常用命令

| 用途               | 命令                                     |
| ------------------ | ---------------------------------------- |
| 初始化             | `bun run bootstrap`                      |
| 开发               | `bun run dev`                            |
| 仅服务端／前端     | `bun run dev:server` / `bun run dev:web` |
| 构建               | `bun run build`                          |
| 类型检查           | `bun run typecheck`                      |
| Lint／格式检查     | `bun run lint` / `bun run fmt:check`     |
| 架构检查           | `bun run architecture:check --changed`   |
| 清理产物／重置依赖 | `bun run clean` / `bun run clean:deps`   |

测试用例清单当前为空，测试依赖及框架配置保留，见[测试现状](docs/testing/unit-test-quality.md)。仓库没有 pre-push 钩子或聚合检查脚本。

## 仓库结构

| 目录                                                                         | 职责                                    |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| `packages/web`、`packages/ui`                                                | 浏览器入口、平台适配、界面与状态投影    |
| `packages/server`                                                            | HTTP／WebSocket 入口及内存服务实现      |
| `packages/client`、`packages/rpc`                                            | 连接 SDK、二进制传输与 Channel RPC      |
| `packages/services`、`packages/shared`                                       | 服务 descriptor、公开业务类型及会话协议 |
| `packages/provider`、`packages/model-option-map`、`packages/session-control` | 模型选项与会话控制契约                  |
| `packages/design-runtime`                                                    | 浏览器设计运行时模块                    |
| `docs`                                                                       | 当前产品、接口与工程规范                |

## License

Apache-2.0，见 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
