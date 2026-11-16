# ZCode Web

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode" width="128" height="128" />
</div>

ZCode 的纯 Web 版本，当前产品为 AIReq：以 AI 为中心的需求管理与跟踪平台。电脑浏览器前端 + 内存模拟后端，不支持手机屏幕。桌面应用与真实 Agent 运行时已移除；`packages/server` 经与真实服务端相同的 WebSocket RPC 传输及 ZCode Protocol v4 提供模拟业务与原生会话能力，UI 复用当前 ZCode 基座。

## 环境要求

Bun **1.4.4** 由 [mise.toml](mise.toml) 固定，pnpm **10.33.2** 由根 `package.json` 的 `packageManager` 固定。Bun 统一执行前后端与工程脚本，不需要安装 Node.js；pnpm 保留为唯一 workspace 包管理器。

### 使用 mise（推荐）

```bash
mise install          # 按 mise.toml 安装固定版本 Bun
mise run bootstrap    # 等价于 bun run bootstrap
```

### 不使用 mise

按 [Bun 官方安装说明](https://bun.sh/docs/installation) 安装 **Bun 1.4.4** 并加入 `PATH`，无需安装全局 pnpm：

```bash
bun --version    # 需为 1.4.4
bun x --bun --package pnpm@10.33.2 pnpm --version    # 需为 10.33.2
```

全新 clone 的首装命令为 `bun run bootstrap`。工程脚本直接使用 `bun run <脚本>`；依赖管理使用显式固定包入口 `bun x --bun --package pnpm@10.33.2 pnpm <命令>`，绕开系统 pnpm / Corepack shim，不修改机器全局安装。首次获取 pnpm 需要访问配置的包 registry，离线环境须预先准备 Bun 缓存；不要用 `bun install` 替代 workspace 依赖安装。

`bootstrap` 会在依赖刷新与安装前校验工具链：Bun 缺失、当前进程不是 Bun、Bun 版本或 pnpm 版本与固定版本不符，均直接失败并给出修正指引。

## 初始化

```bash
bun run bootstrap
```

首装链只涉及本仓库现存工程：`packages/server`（内存 mock 后端）与 `packages/web`（Vite 前端）。`bootstrap` 依次执行工具链校验、被 patch 依赖刷新、`bun x --bun --package pnpm@10.33.2 pnpm install`、`bun run build`，并校验两端产物已生成；它不下载桌面 runtime、不初始化子模块、不构建远程发行资源。完整约定见 [Web 构建与清理工作流](docs/architecture/web-build-workflow.md)。

## 开发

```bash
bun run dev    # 同时启动 Bun 模拟后端(:3031)与 Bun 执行的 Vite(:5174)
```

也可分别启动：`bun run dev:server`（默认 :3031，`PORT` 可覆盖）、`bun run dev:web`（Vite :5174，`/api` 与 `/ws` 代理到 :3031）。main 使用独立端口，可与 base（前端 :5173、后端 :3030）同时运行。后端包的开发脚本使用 `cd ../.. && bun --watch packages/server/src/entry-http.ts`，从仓库根执行 watch，确保其它 workspace 共享源码变更也触发重启；默认 `workspacePath` 为仓库根，可通过 `ZCODE_SERVER_WORKSPACE` 覆盖。

仓库内置 VS Code 任务：`zcode: mock server (:3031)`、`zcode: web dev (:5174)`、`zcode: dev (mock server + web)`。启动配置 `ZCode Web: Chrome (:5174)` 只调试浏览器；`ZCode Server: Mock (:3031)` 使用 Bun 调试器，需要安装 [Oven 的 Bun 扩展 `oven.bun-vscode`](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode)，并让 VS Code 的 `PATH` 可找到固定版本 Bun。该配置字段已按[扩展 schema](https://github.com/oven-sh/bun/blob/main/packages/bun-vscode/package.json) 设置；[官方文档](https://bun.sh/guides/runtime/vscode-debugger) 提醒扩展存在稳定性问题，并推荐 Bun Web debugger。Chrome 调试器不能用于调试 Bun 后端。

打开 <http://localhost:5174>，通过自报工号进入 AIReq。主导航依次为项目进度、待办列表、正式需求、需求提案、进度分析、Skill 设计，登录默认项目进度；Skill 设计是主页面，不在设置中。所有合法工号均可配置、认领和代办，身份用于留痕与会话隔离，不设置 owner／负责人权限；参数、对象归属、版本、幂等和业务阶段门禁仍保留。普通聊天／任务列表、文件树、Git 面板、Issue 和 AIReq 自动化不是当前产品入口，通用控件与仍有用途的底层设施保留。当前需求以 [.todo.md](.todo.md) 为准，功能范围见 [项目目标](docs/project-goal.md)。业务数据、AI 回复、PR／分支与 Skill 保存均为明确标注的内存模拟，不执行真实开发、测试、Git 或文件保存。

## 构建

```bash
bun run build    # 串行 bun build 后端与 Vite 前端，保留 dist/entry-http.js
```

后端由 `bun build --target=bun --outdir=dist ./src/entry-http.ts` 打包 workspace 源码与全部非 builtin 依赖，不使用额外后端打包器。生产部署需要固定版本 Bun，但后端 bundle 不依赖生产目录的 `node_modules`。从仓库根启动单进程（HTTP + WebSocket + SPA fallback）：

```bash
ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun packages/server/dist/entry-http.js
# 或：ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun run --cwd packages/server start
```

`ZCODE_WEB_STATIC_ROOT` 必须指向前端静态产物目录，推荐绝对路径。PowerShell 先执行 `$env:ZCODE_WEB_STATIC_ROOT = (Resolve-Path packages/web/dist).Path`，再执行 `bun packages/server/dist/entry-http.js`；`PORT` 可覆盖默认端口 3031。

## HTTP IP 部署

开发服务默认监听 `0.0.0.0:5174`，其他机器可访问 `http://<服务器IP>:5174`。
正式环境需要不带端口的 `http://<服务器IP>/` 时，构建后从仓库根启动：

```bash
bun run build
PORT=80 ZCODE_SERVER_HOST=0.0.0.0 ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun packages/server/dist/entry-http.js
```

PowerShell 分别设置 `$env:PORT = "80"`、`$env:ZCODE_SERVER_HOST = "0.0.0.0"` 和
`$env:ZCODE_WEB_STATIC_ROOT = (Resolve-Path packages/web/dist).Path`，再启动后端产物。
运行账户须有绑定 80 端口的权限，且端口未被占用。服务器防火墙／安全组需放行 TCP 80；
跨网访问还需要可路由 IP 或端口映射。页面、API 和 WebSocket 共用同一地址，无需客户端另配后端。

普通 IP 的 HTTP 页面使用兼容 UUID、附件 SHA-256 和文本复制；浏览器拒绝复制时显示失败。
通知、语音等可选浏览器能力仍遵循浏览器权限与安全上下文限制。

## 清理

```bash
bun run clean        # 只删除构建产物：dist 目录与 *.tsbuildinfo 增量元数据
bun run clean:deps   # 额外删除根与各包的 node_modules，用于重置安装
```

`clean` 不会重装依赖；`clean:deps` 不删除源码、用户数据或其它目录。删除依赖后运行 `bun x --bun --package pnpm@10.33.2 pnpm install`（或 `bun run bootstrap`）恢复。

## 仓库结构

| 目录                 | 职责                                                      |
| -------------------- | --------------------------------------------------------- |
| `packages/web`       | 浏览器前端入口（Vite）                                    |
| `packages/ui`        | 共享 React 组件、hooks 与 Zustand store                   |
| `packages/server`    | Bun 模拟 Web 后端（Hono + WebSocket RPC + mock 服务集合） |
| `packages/rpc`       | VS Code 风格 IPC/RPC 框架（生产实现）                     |
| `packages/client`    | 浏览器连接 SDK（WebSocket → IServiceAccessor）            |
| `packages/services`  | 服务接口与 descriptor 契约层                              |
| `packages/shared`    | 共享协议与类型（含 ZCode Protocol v4）                    |
| `packages/provider`  | Provider/模型选择纯逻辑                                   |
| `docs/`              | 前端设计相关文档                                          |
| `docs/architecture/` | 构建、清理与开发流程约定                                  |
| `DESIGN.md`          | UI 设计规范                                               |
| `CONTEXT.md`         | 插件商店领域词汇                                          |

## 常用命令

| 用途       | 命令                                   |
| ---------- | -------------------------------------- |
| 初始化     | `bun run bootstrap`                    |
| 开发       | `bun run dev`                          |
| 构建       | `bun run build`                        |
| 清理产物   | `bun run clean`                        |
| 重置依赖   | `bun run clean:deps`                   |
| 类型检查   | `bun run typecheck`                    |
| Lint       | `bun run lint`                         |
| 格式检查   | `bun run fmt:check`                    |
| 架构检查   | `bun run architecture:check --changed` |
| 提交前检查 | `bun run verify:pre-push`              |

## License

Apache-2.0，详见 [LICENSE](LICENSE) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
