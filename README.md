# ZCode Web

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode" width="128" height="128" />
</div>

ZCode 的纯 Web 版本：电脑浏览器前端 + 模拟后端服务。仅支持电脑浏览器，不进行手机屏幕适配或测试。桌面应用与真实 Agent 运行时已移除；`packages/server` 按与真实服务端完全相同的 WebSocket RPC 协议（ZCode Protocol v4）提供内存态模拟实现，浏览器界面与原先一致。

## 环境要求

版本以 [mise.toml](mise.toml) 为唯一声明来源：Node.js **24.14.0**、pnpm **10.33.2**（`package.json` 的 `engines` 要求 Node >= 24）。

### 使用 mise（推荐）

```bash
mise install          # 按 mise.toml 安装固定版本 Node / pnpm
mise run bootstrap    # 等价于 pnpm bootstrap
```

### 不使用 mise

不使用 mise 时，请手动安装同版本工具后直接调用 pnpm 脚本，无需修改任何全局配置：

```bash
corepack enable && corepack prepare pnpm@10.33.2 --activate
# 或：npm i -g pnpm@10.33.2
node -v   # 需为 v24.x，固定版本见 mise.toml
pnpm -v   # 需为 10.33.2
```

`pnpm bootstrap` 会先校验工具链：Node 主版本低于 24 直接失败，pnpm 版本与固定版本不一致也直接失败并给出修正命令；Node 小版本漂移仅告警提示。

## 初始化

```bash
pnpm bootstrap
```

首装链只涉及本仓库现存工程：`packages/server`（内存 mock 后端）与 `packages/web`（Vite 前端）。`bootstrap` 依次执行工具链校验、被 patch 依赖刷新、`pnpm install`、`pnpm build`，并校验两端产物已生成；它不下载桌面 runtime、不初始化子模块、不构建远程发行资源。完整约定见 [Web 构建与清理工作流](docs/architecture/web-build-workflow.md)。

## 开发

```bash
pnpm dev        # 同时启动模拟后端(:3030)与前端 Vite(:5173)
```

也可分别启动：`pnpm dev:server`（`packages/server/src/entry-http.ts`，默认 :3030，`PORT` 可覆盖）、`pnpm dev:web`（Vite :5173，`/api` 与 `/ws` 代理到 :3030）。仓库内置 VS Code 任务与启动配置：任务 `zcode: mock server (:3030)`、`zcode: web dev (:5173)`、`zcode: dev (mock server + web)`，启动配置 `ZCode Web: Chrome (:5173)` 与 `ZCode Server: Mock (:3030)`。

打开 <http://localhost:5173> 即可使用完整界面：会话/任务管理、流式对话、工具调用展示、文件树、Git 面板、设置页等。所有数据由模拟后端的内存状态驱动（虚拟工作区、确定性回复）。

## 构建

```bash
pnpm build      # 串行构建 mock-server 与 web；packages/web 产物为静态站点
```

生产形态：`packages/server` 构建产物支持 `ZCODE_WEB_STATIC_ROOT=<web dist>` 直接托管前端静态资源，单进程部署（HTTP + WebSocket + SPA fallback）。

## 清理

```bash
pnpm clean        # 只删除构建产物：dist 目录与 *.tsbuildinfo 增量元数据
pnpm clean:deps   # 额外删除根与各包的 node_modules，用于重置安装
```

`clean` 不会重装依赖；`clean:deps` 不删除源码、用户数据或其它目录。删除依赖后运行 `pnpm install`（或 `pnpm bootstrap`）恢复。

## 仓库结构

| 目录                 | 职责                                                  |
| -------------------- | ----------------------------------------------------- |
| `packages/web`       | 浏览器前端入口（Vite）                                |
| `packages/ui`        | 共享 React 组件、hooks 与 Zustand store               |
| `packages/server`    | 模拟 Web 后端（Hono + WebSocket RPC + mock 服务集合） |
| `packages/rpc`       | VS Code 风格 IPC/RPC 框架（生产实现）                 |
| `packages/client`    | 浏览器连接 SDK（WebSocket → IServiceAccessor）        |
| `packages/services`  | 服务接口与 descriptor 契约层                          |
| `packages/shared`    | 共享协议与类型（含 ZCode Protocol v4）                |
| `packages/provider`  | Provider/模型选择纯逻辑                               |
| `docs/`              | 前端设计相关文档                                      |
| `docs/architecture/` | 构建、清理与开发流程约定                              |
| `DESIGN.md`          | UI 设计规范                                           |
| `CONTEXT.md`         | 插件商店领域词汇                                      |

## 常用命令

| 用途       | 命令                                |
| ---------- | ----------------------------------- |
| 初始化     | `pnpm bootstrap`                    |
| 开发       | `pnpm dev`                          |
| 构建       | `pnpm build`                        |
| 清理产物   | `pnpm clean`                        |
| 重置依赖   | `pnpm clean:deps`                   |
| 类型检查   | `pnpm typecheck`                    |
| Lint       | `pnpm lint`                         |
| 格式检查   | `pnpm fmt:check`                    |
| 架构检查   | `pnpm architecture:check --changed` |
| 提交前检查 | `pnpm verify:pre-push`              |

## License

Apache-2.0，详见 [LICENSE](LICENSE) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
