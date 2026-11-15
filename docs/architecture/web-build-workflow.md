# Web 构建与清理工作流

本文定义纯 Web 形态（浏览器前端 + 内存态 mock 后端）的工具链、首装链、构建产物与清理语义。根 `package.json` 脚本、`mise.toml` 任务与 README 均以本文为准。

## 适用范围

- 只覆盖当前仓库现存工程：`packages/web`（Vite 前端）与 `packages/server`（Hono + WebSocket RPC 的 mock 后端）。
- 非目标：桌面 shell、桌面 runtime、远程资源发行（旧 `bootstrap:with-remote` / `stage:remote-assets`）、`apps/*` 子模块。这些入口随桌面端裁撤一并移除，任何脚本都不再初始化或下载它们。

## 工具链固定

- `mise.toml` 的 `[tools]` 固定 Bun `1.4.4`；根 `package.json` 的 `packageManager` 固定 pnpm `10.33.2`。不要求安装 Node.js；Bun 统一执行后端、Vite 与工程脚本，pnpm 仅负责依赖管理。
- `scripts/bootstrap.mjs` 由 Bun 执行，在依赖刷新、读取锁文件和安装之前先校验：
  - Bun 不可执行、当前进程不是 Bun，或 Bun 版本与固定版本不一致 → 直接失败，提示 `mise install` 与固定版本安装入口；
  - 从 `packageManager` 读取 pnpm 固定版本，通过 `bun x --bun --package pnpm@<版本> pnpm --version` 获取并校验；解析、下载或版本校验失败时明确报错，不借助系统 pnpm / Node.js / npm / Corepack。
- 不使用 mise 时，按 [Bun 官方安装说明](https://bun.sh/docs/installation) 安装 Bun `1.4.4` 并加入 `PATH`，无需全局安装 pnpm。显式包选择绕开系统 pnpm shim；首次调用需要访问配置的包 registry，离线环境须预先准备 Bun 缓存。
- 工程入口统一使用 `bun run <脚本>`；安装依赖使用 `bun x --bun --package pnpm@10.33.2 pnpm install`，不使用 `bun install` 替代 workspace 包管理。

## 首装链

入口：`bun run bootstrap`（`mise run bootstrap` 只是转发）。

```text
工具链校验
  └─ 刷新 hoisted patched dependencies
       └─ bun x --bun --package pnpm@10.33.2 pnpm install
            └─ bun run build（根契约：build:server → build:web，串行）
                 └─ 校验产物：packages/server/dist/entry-http.js、packages/web/dist/index.html
```

- **被 patch 依赖刷新**：`scripts/bootstrap-patched-dependencies.mjs` 依据根 `package.json` 的 `pnpm.patchedDependencies` 解析目标包，只删除 `node_modules` 内对应包目录。原因是 pnpm 10 + `node-linker=hoisted` 会把 patch 直接应用到目标目录，重复 install 会再次应用同一 diff 并稳定失败。该步骤不触碰 pnpm store 与任何用户文件，也不新建其它清理抽象。
- **构建复用根脚本**：bootstrap 调用 `bun run build`，不自行拼装包过滤或 workspace 递归命令。根 `build` 的串行顺序属于 `package.json` 契约，改动只发生在那里。
- **不接受参数**：`--with-remote` 等旧入口已移除；传入任何参数都会显式报错退出，避免静默忽略“下载远程资源 / 准备桌面 runtime”的意图。

## 构建产物

| 路径                                 | 来源                                                       | 说明                                                  |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| `packages/server/dist/entry-http.js` | `bun build --target=bun --outdir=dist ./src/entry-http.ts` | 内联 workspace 源码与全部非 builtin 依赖；由 Bun 执行 |
| `packages/web/dist/`                 | `vite build`（`packages/web`）                             | 静态站点；可由 mock server 以静态根托管               |
| `packages/*/tsconfig.tsbuildinfo`    | `tsc -b`（类型检查增量元数据）                             | 只用于加速类型检查，删除后自动重建                    |
| `node_modules/`（根与各包）          | 固定版本 pnpm 安装                                         | 依赖，不是构建产物；只有 `clean:deps` 会删除          |

workspace 内其它包（`shared` / `rpc` / `services` / `ui` 等）以源码形式被前端与 mock 后端消费，不进入首装链，也不需要单独构建；它们由 `tsc -b` 与打包器按需处理。

## 清理语义

入口：`bun run clean`、`bun run clean:deps`（均由 `scripts/clean.mjs` 实现；`mise` 任务 `clean` / `clean-deps` 只转发）。

- `bun run clean`：只删除构建产物，即根与 `packages/*` 下的 `dist` 目录和同层的 `*.tsbuildinfo`。**不删除** `node_modules`，因此清理后无需重装依赖，可直接 `bun run build`。
- `bun run clean:deps`：在 `clean` 基础上额外删除根与各包的 `node_modules`，用于重置安装。删除后运行 `bun x --bun --package pnpm@10.33.2 pnpm install` 或 `bun run bootstrap` 恢复；它不删除源码、用户数据、编辑器配置或其它缓存目录。
- 路径保护：每个待删目标必须是某个 owner 目录（仓库根或 `packages/<pkg>`）的**直接子项**，且名字落在受控集合内（`dist`、`*.tsbuildinfo`、`node_modules`）。不满足即抛错拒绝，防止误传路径导致递归删除任意目录。脚本只扫描仓库根与 `packages/*` 一层，不做任意深度遍历。
- 未知参数直接报错；`--help` 打印用法。

## 开发

- `bun run dev` 并行启动两端：后端包的 `dev` 从包目录执行 `cd ../.. && bun --watch packages/server/src/entry-http.ts`，将 Bun watch 的执行位置固定为仓库根，保证其它 workspace 的共享源码变更也触发重启（默认 `:3030`，`PORT` 可覆盖）。不在 `packages/server` 内直接 watch，避免遗漏包外源码；后端默认 `workspacePath` 因此为仓库根，可用 `ZCODE_SERVER_WORKSPACE` 覆盖。`packages/web` 以 Bun 执行 Vite（`:5173`，`/api`、`/ws` 代理到 `:3030`）。后端不提供其它运行时 fallback。
- VS Code 配置与之一致：任务 `zcode: mock server (:3030)`、`zcode: web dev (:5173)`、`zcode: dev (mock server + web)`；启动配置 `ZCode Web: Chrome (:5173)` 调试浏览器（先起两端），`ZCode Server: Mock (:3030)` 通过 `type: "bun"`、`runtime: "bun"` 直接调试 `src/entry-http.ts`（仅先起 web）。后端需要安装 [Oven 的 Bun 扩展 `oven.bun-vscode`](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode)，不能使用 Chrome 调试器调试 Bun。
- Bun 调试字段以[扩展 schema](https://github.com/oven-sh/bun/blob/main/packages/bun-vscode/package.json) 为准。[官方调试说明](https://bun.sh/guides/runtime/vscode-debugger) 提醒该扩展存在稳定性问题，并推荐 Bun Web debugger；这里不承诺扩展无故障。
- 生产形态：从仓库根运行以下命令，`ZCODE_WEB_STATIC_ROOT` 指向前端构建目录的绝对路径，由一个 Bun 进程托管 HTTP + WebSocket + SPA fallback：

  ```bash
  ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun packages/server/dist/entry-http.js
  # 或：ZCODE_WEB_STATIC_ROOT="$PWD/packages/web/dist" bun run --cwd packages/server start
  ```

  PowerShell 使用 `$env:ZCODE_WEB_STATIC_ROOT = (Resolve-Path packages/web/dist).Path`，再运行 `bun packages/server/dist/entry-http.js`。只发布两端 `dist` 时仍须安装固定版本 Bun；后端包内已打包非 builtin 依赖，不依赖生产目录的 `node_modules`。

- 对外部署必须提供 HTTPS 安全上下文、同源 `/api` 与 `/ws` Upgrade，以及预览/下载返回的可达资源路径。
  localStorage、sessionStorage、IndexedDB、Blob/object URL、WebSocket 与 `crypto.randomUUID` 必须可用；
  不能将 localhost HTTP 的可用性当作任意服务器 HTTP 可部署的证据。
- 后端替换验收固定一份 `packages/web/dist`，将部署包与逐文件 SHA-256 清单一起保存；
  同一包先连 mock 再连真实后端，不因后端差异重建带特判的前端。完整接入面见
  [模拟后端规范 §8](mock-backend.md#8-真实后端替换契约)。本仓库仍只实现模拟后端。

## 扩展与维护规则

- 新增 workspace 包：`pnpm-workspace.yaml` 的 `packages/*` 会自动覆盖 install、`pnpm -r`、`clean` 的扫描范围，本工作流脚本无需维护包名单。若新包产生 `dist` / `*.tsbuildinfo` 之外的持久构建目录，先更新本文并同步 `scripts/clean.mjs` 的受控产物名。
- 删除包：同步 `pnpm-workspace.yaml`、根脚本与本文；不保留“已退役路径”的占位分支。
- 职责边界：根 `package.json` 的 `build` / `clean` / `clean:deps` / `bootstrap` 是唯一命令入口；`mise.toml` 只做同语义转发，不得各用一套构建或清理实现。

## 验收要点

1. `bun run bootstrap` 在干净 clone（无 `node_modules` / `dist`）上完成安装与构建，且过程不出现桌面 runtime、远程资源、子模块相关命令。
2. 缺少 Bun、Bun 版本不符或 pnpm 解析/版本校验失败时，bootstrap 在依赖刷新、读锁文件与安装前失败，给出清晰修正指引；全新环境不需要安装 Node.js 或全局 pnpm。
3. `bun run clean` 后 `node_modules` 仍在、`dist` 与 `*.tsbuildinfo` 消失，随后 `bun run build` 可重建。
4. `bun run clean:deps` 后 `node_modules` 消失、源码与仓库外文件不受影响。
5. `scripts/clean.mjs` 对未知参数、越权目标路径失败，而非静默跳过。
