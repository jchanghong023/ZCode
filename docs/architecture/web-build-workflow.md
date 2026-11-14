# Web 构建与清理工作流

本文定义纯 Web 形态（浏览器前端 + 内存态 mock 后端）的工具链、首装链、构建产物与清理语义。根 `package.json` 脚本、`mise.toml` 任务与 README 均以本文为准。

## 适用范围

- 只覆盖当前仓库现存工程：`packages/web`（Vite 前端）与 `packages/server`（Hono + WebSocket RPC 的 mock 后端）。
- 非目标：桌面 shell、桌面 runtime、远程资源发行（旧 `bootstrap:with-remote` / `stage:remote-assets`）、`apps/*` 子模块。这些入口随桌面端裁撤一并移除，任何脚本都不再初始化或下载它们。

## 工具链固定

- `mise.toml` 的 `[tools]` 是 Node / pnpm 版本的唯一声明来源（当前 Node `24.14.0`、pnpm `10.33.2`）。
- `scripts/bootstrap.mjs` 在安装前校验：
  - Node 主版本低于 `package.json` `engines` 要求的 24 → 直接失败；
  - Node 与固定版本仅小版本漂移 → 告警，不阻断（不同 24.x 均可通过引擎约束，但验收以固定版本为准）；
  - pnpm 版本与固定版本不一致 → 直接失败，并在错误信息里给出 `mise install` / `corepack prepare pnpm@<v> --activate` / `npm i -g pnpm@<v>` 三种修正方式。
- 不使用 mise 时的替代方式只操作本机工具安装，不改仓库或全局配置文件。

## 首装链

入口：`pnpm bootstrap`（`mise run bootstrap` 只是转发）。

```text
工具链校验
  └─ 刷新 hoisted patched dependencies
       └─ pnpm install
            └─ pnpm build（根契约：build:server → build:web，串行）
                 └─ 校验产物：packages/server/dist/entry-http.js、packages/web/dist/index.html
```

- **被 patch 依赖刷新**：`scripts/bootstrap-patched-dependencies.mjs` 依据根 `package.json` 的 `pnpm.patchedDependencies` 解析目标包，只删除 `node_modules` 内对应包目录。原因是 pnpm 10 + `node-linker=hoisted` 会把 patch 直接应用到目标目录，重复 install 会再次应用同一 diff 并稳定失败。该步骤不触碰 pnpm store 与任何用户文件，也不新建其它清理抽象。
- **构建复用根脚本**：bootstrap 调用 `pnpm run build`，不自行拼装包过滤或 `pnpm -r`。根 `build` 的串行顺序属于 `package.json` 契约，改动只发生在那里。
- **不接受参数**：`--with-remote` 等旧入口已移除；传入任何参数都会显式报错退出，避免静默忽略“下载远程资源 / 准备桌面 runtime”的意图。

## 构建产物

| 路径                                 | 来源                           | 说明                                          |
| ------------------------------------ | ------------------------------ | --------------------------------------------- |
| `packages/server/dist/entry-http.js` | `tsup`（`packages/server`）    | 内联 workspace 包源码，`hono` / `ws` 保持外置 |
| `packages/web/dist/`                 | `vite build`（`packages/web`） | 静态站点；可由 mock server 以静态根托管       |
| `packages/*/tsconfig.tsbuildinfo`    | `tsc -b`（类型检查增量元数据） | 只用于加速类型检查，删除后自动重建            |
| `node_modules/`（根与各包）          | `pnpm install`                 | 依赖，不是构建产物；只有 `clean:deps` 会删除  |

workspace 内其它包（`shared` / `rpc` / `services` / `ui` 等）以源码形式被前端与 mock 后端消费，不进入首装链，也不需要单独构建；它们由 `tsc -b` 与打包器按需处理。

## 清理语义

入口：`pnpm clean`、`pnpm clean:deps`（均由 `scripts/clean.mjs` 实现；`mise` 任务 `clean` / `clean-deps` 只转发）。

- `pnpm clean`：只删除构建产物，即根与 `packages/*` 下的 `dist` 目录和同层的 `*.tsbuildinfo`。**不删除** `node_modules`，因此清理后无需重装依赖，可直接 `pnpm build`。
- `pnpm clean:deps`：在 `clean` 基础上额外删除根与各包的 `node_modules`，用于重置安装。删除后运行 `pnpm install` 或 `pnpm bootstrap` 恢复；它不删除源码、用户数据、编辑器配置或其它缓存目录。
- 路径保护：每个待删目标必须是某个 owner 目录（仓库根或 `packages/<pkg>`）的**直接子项**，且名字落在受控集合内（`dist`、`*.tsbuildinfo`、`node_modules`）。不满足即抛错拒绝，防止误传路径导致递归删除任意目录。脚本只扫描仓库根与 `packages/*` 一层，不做任意深度遍历。
- 未知参数直接报错；`--help` 打印用法。

## 开发

- `pnpm dev` 并行启动两端：`packages/server` 以 `tsx watch src/entry-http.ts` 跑 mock 后端（默认 `:3030`，`PORT` 可覆盖），`packages/web` 跑 Vite（`:5173`，`/api`、`/ws` 代理到 `:3030`）。
- VS Code 配置与之一致：任务 `zcode: mock server (:3030)`、`zcode: web dev (:5173)`、`zcode: dev (mock server + web)`；启动配置 `ZCode Web: Chrome (:5173)`（先起两端）与 `ZCode Server: Mock (:3030)`（仅起 web）。不存在 Electron / 桌面调试入口。
- 生产形态：`packages/server` 产物支持 `ZCODE_WEB_STATIC_ROOT=<packages/web/dist>` 单进程托管前端静态资源。

## 扩展与维护规则

- 新增 workspace 包：`pnpm-workspace.yaml` 的 `packages/*` 会自动覆盖 install、`pnpm -r`、`clean` 的扫描范围，本工作流脚本无需维护包名单。若新包产生 `dist` / `*.tsbuildinfo` 之外的持久构建目录，先更新本文并同步 `scripts/clean.mjs` 的受控产物名。
- 删除包：同步 `pnpm-workspace.yaml`、根脚本与本文；不保留“已退役路径”的占位分支。
- 职责边界：根 `package.json` 的 `build` / `clean` / `clean:deps` / `bootstrap` 是唯一命令入口；`mise.toml` 只做同语义转发，不得各用一套构建或清理实现。

## 验收要点

1. `pnpm bootstrap` 在干净 clone（无 `node_modules` / `dist`）上完成安装与构建，且过程不出现桌面 runtime、远程资源、子模块相关命令。
2. 工具链不符时 bootstrap 在读锁文件前失败并给出修正命令。
3. `pnpm clean` 后 `node_modules` 仍在、`dist` 与 `*.tsbuildinfo` 消失，随后 `pnpm build` 可重建。
4. `pnpm clean:deps` 后 `node_modules` 消失、源码与仓库外文件不受影响。
5. `scripts/clean.mjs` 对未知参数、越权目标路径失败，而非静默跳过。
