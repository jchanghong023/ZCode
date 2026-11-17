# Web 构建与清理

命令以根 [`package.json`](../../package.json) 和 [`scripts`](../../scripts) 的实现为准；[`mise.toml`](../../mise.toml) 只转发相同任务。

## 工具链与安装

- mise 固定 Bun `1.4.4`，根 `engines.bun` 声明 `>=1.4.4`。bootstrap 要求当前进程和 PATH 中的 Bun 都精确为 `1.4.4`。
- `packageManager` 固定 pnpm `10.33.2`。Bun 执行应用和工程脚本，pnpm 管理 workspace 依赖，不以 `bun install` 替代。
- workspace 范围为 `packages/*`。安装配置见 [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml)，锁定解析见 [`pnpm-lock.yaml`](../../pnpm-lock.yaml)。

```sh
mise install
bun run bootstrap
# 仅安装依赖：
bun x --bun --package pnpm@10.33.2 pnpm install
```

[`bootstrap.mjs`](../../scripts/bootstrap.mjs) 不接受参数，依次执行：

1. 校验 Bun；通过 `bun x --bun --package pnpm@<固定版本> pnpm --version` 获取并校验 pnpm，不回退到系统 shim、Node 或 Corepack。
2. 按根 `pnpm.patchedDependencies` 清理 hoisted 安装中的目标包目录，避免重复应用补丁；不删除 store 或用户文件。
3. 使用固定 pnpm 执行 `install`。
4. 执行根 `bun run build`，检查后端入口和前端 HTML 是否存在。

首次解析 pnpm 需要可达的 registry 或预备的 Bun 缓存。

## 开发与构建

| 命令                   | 行为                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `bun run dev`          | 并行启动后端与 Vite                                                                    |
| `bun run dev:server`   | 从仓库根由 Bun watch 执行 `packages/server/src/entry-http.ts`，覆盖共享源码变化        |
| `bun run dev:web`      | 由 Bun 执行 Vite，监听 `0.0.0.0:5174`                                                  |
| `bun run build`        | 串行执行 `build:server`、`build:web`                                                   |
| `bun run build:server` | Bun 以 `--target=bun` 打包 `src/entry-http.ts` 到 `packages/server/dist/entry-http.js` |
| `bun run build:web`    | Vite 构建到 `packages/web/dist`                                                        |

Vite 的 `/api`、`/ws` 代理指向 `localhost:3031`，见 [`vite.config.ts`](../../packages/web/vite.config.ts)。后端默认端口为 `3031`；修改后端 `PORT` 不会自动修改代理。后端部署与静态托管配置集中见 [后端说明](mock-backend.md)。

内部包由 Bun/Vite 直接消费源码，无需在首装链逐包预构建，见 [内部源码包](internal-source-packages.md)。类型检查的 `tsc -b` 可另行生成声明与增量元数据，它不是根 `build` 的步骤。

Vite 当前构建配置：

- 生产模式不生成 source map，其他模式生成。
- 在收集 CSS 字体 URL 前移除 KaTeX 的 WOFF/TTF 引用，保留 WOFF2。
- `shiki` 根入口统一到文档高亮 bundle；`@` 指向 UI 源码，`d3-path` 指向根安装的源码入口。
- worker 构建关闭摇树，保留 diff worker 的消息监听注册；主包不受此设置影响。
- 生成第三方许可资源。依赖补丁见 [浏览器依赖](browser-dependency-versions.md)。

## 清理

[`clean.mjs`](../../scripts/clean.mjs) 只扫描仓库根和 `packages/*` 一层：

| 命令                 | 删除范围                                              |
| -------------------- | ----------------------------------------------------- |
| `bun run clean`      | owner 目录直接子项中的 `dist` 和 `*.tsbuildinfo` 文件 |
| `bun run clean:deps` | 上述产物，加根与各包的 `node_modules`                 |

默认清理保留依赖，可以直接重新构建；清理依赖后用固定 pnpm 安装或运行 bootstrap。脚本不清理其他缓存、源码或用户数据。待删路径必须是 owner 的直接子项且名称受控；未知参数失败，`--help` 显示用法。
