# 内部源码 workspace 包入口约定

本文件定义当前仓库 11 个 workspace 包的公共入口形态：哪些是源码、哪些是资源、哪些是真实构建产物，以及类型与运行时分别从哪条路径解析。构建与清理语义见 [web-build-workflow.md](web-build-workflow.md)，模块所有权与新增源码登记见 [pure-web-module-ownership.md](pure-web-module-ownership.md)。仓库级规则来源是 [project-goal.md](../project-goal.md) 的 workspace 入口条款。

## 前提：私有内部源码 workspace

- 仓库根 `package.json` 与 `packages/*` 的 11 个成员全部 `private: true`；没有 `main` / `module` / `files` / `bin`，不发布 npm 包，也不存在“先发布构建产物、再从 node_modules 消费”的发行流程。
- 包的事实源是包内 `src/` 源码。`exports` 直接指向 `./src/**` 的 `.ts` / `.tsx` / `.d.ts` 文件；`@zcode/ui` 另有真实 CSS 资源入口。
- `dist/` 是 TypeScript / Bun / Vite 的构建输出，被 `.gitignore` 忽略，**不是 workspace 公共入口**；干净工作区（删除 `dist` 与 `*.tsbuildinfo` 后）不要求任何包预先存在 `dist`。后端部署命令单独执行最终产物 `packages/server/dist/entry-http.js`。
- 浏览器端 Vite 与模拟后端 Bun 都直接消费 `src`；类型由包内 typecheck 和 project references（根 `tsc -b`）验证。工程命令通过 `bun run <脚本>` 执行，Bun 是唯一 JavaScript 运行时；pnpm 仅通过 `bun x --bun --package pnpm@10.33.2 pnpm <命令>` 管理依赖。

## 三类入口边界

### 1. 源码入口（默认）

- `exports` 目标直接是包内真实源码文件（`.ts` / `.tsx`）或声明源码（`.d.ts`，如 `@zcode/client` 的 `./globals`）。
- `exports.types` 与 `exports.default` 必须指向同一个源码入口；不允许 types 指向 `dist`、default 指向 `src` 的分裂形态。`@zcode/rpc` 已按此统一（见下文）。
- 源码入口是唯一对外的运行时与类型入口；Bun 与 Vite 都能直接消费它。

### 2. 资源入口

- `@zcode/ui` 的 `./styles.css` 指向真实 CSS 文件，由 Vite 处理，不属于 TS 源码。
- 资源入口同样要求目标真实存在，不能靠目录或通配推断。

### 3. 真实构建产物（`dist/**`）

- 只有当包内 tsconfig（含继承链）真实能 emit 出该文件时，`dist/**` 才可以作为 `exports` / `imports` 目标。`noEmit`、只 emit JS、只 emit 声明、目标扩展名不匹配都会被入口预检拒绝；声明文件允许尚未生成，但输出映射必须由 tsconfig 推导出来。
- 预检按 `rootDir` / `outDir` / `declarationDir` / `include` / `exclude` 计算 TypeScript 输出，不做 `dist → src` 猜测，也不接受目录目标。
- **当前没有任何包把 `dist/**` 暴露为公共入口**。`dist` 只作为构建产物存在：rpc 等 composite 工程的声明供 project references 复用，`packages/server/dist`与`packages/web/dist` 是本仓库的最终交付产物（见 web-build-workflow）。

## 干净工作区的消费模型

| 消费方                             | 解析路径                                     | 输入                                                         |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| 浏览器前端（`packages/web`，Vite） | `exports.default`                            | 各包 `src/**`，由 Vite 转译打包                              |
| 模拟后端（`packages/server`，Bun） | `exports.default` + `bun build --target=bun` | 各包 `src/**` 与非 builtin 依赖，内联进 `dist/entry-http.js` |
| 根类型检查（`bun run typecheck`）  | `tsc -b` + project references                | 同一轮构建中先产出被引用工程声明，再读取声明                 |
| 编辑器语言服务                     | `exports.types`                              | 源码；可直接解析，不依赖已构建声明                           |
| 不支持 TypeScript 的裸 JS 加载器   | 不支持                                       | workspace 包没有 JS 分发入口，也不添加兼容 shim              |

- `bun run clean` 删除 `dist` 与 `*.tsbuildinfo` 后，`bun run typecheck` 仍可重建全部工程；旧产物只影响速度，不影响正确性。
- 不为“干净工作区解析失败”添加 `main`、dist 回退条件、`tsc` 包装脚本或兼容层；保持 Bun / Vite 直接消费源码与 project references 的类型检查方式。

## `@zcode/rpc`：types 与 default 同源

`packages/rpc/package.json` 的唯一公共入口：

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "default": "./src/index.ts"
  }
}
```

- 顶层 `types` 同样指向 `./src/index.ts`。任一模块解析模式（`bundler`、`nodenext`、编辑器）都落到同一份源码，干净工作区不需要 `dist/index.d.ts`。
- `dist/index.d.ts` 不再是公共类型入口；它只是 `tsc -b` 或 `bun run --cwd packages/rpc build` 的 emit 结果，供 `services`、`server`、`ui`、`client` 的 project references 在同一轮构建中复用（TS 会把被引用工程的源码导入重定向到其声明输出）。
- `packages/rpc/tsconfig.json` 保留 `composite` / `declaration` / `declarationMap` / `outDir`：被引用工程必须可 emit。**不要把 `noEmit` 写进该 tsconfig**，否则消费者会报 TS6310（Referenced project may not disable emit）。
- 包内类型检查：`bun run --cwd packages/rpc typecheck` 执行 `tsc -p tsconfig.json --noEmit --composite false`。命令行关闭 composite 后只检查、不写 `dist` 与 `.tsbuildinfo`；根 `bun run typecheck` 的 `tsc -b` 才是构建声明的路径。两者都不依赖旧 `dist`。
- 非 build 模式的 `tsc -p packages/<consumer>` 不会自动补建被引用工程（TypeScript project references 语义），仓库内类型检查统一走 `tsc -b`。

## 当前包的入口盘点（11 个）

| 包                        | 公共入口                                                                               | 构建产物（不作为入口）                                      |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `@zcode/client`           | `.` → `src/index.ts`；`./globals` → `src/globals.d.ts`                                 | `tsc -b` → `dist`                                           |
| `@zcode/design-runtime`   | `.` → `src/index.ts`                                                                   | `tsc` → `dist`                                              |
| `@zcode/model-option-map` | `.` → `src/index.ts`                                                                   | `tsc` → `dist`                                              |
| `@zcode/provider`         | `.` → `src/index.ts`                                                                   | `tsc` → `dist`                                              |
| `@zcode/rpc`              | `.` → `src/index.ts`（`types` 与 `default` 同源）                                      | `tsc` → `dist`（声明供 references 复用）                    |
| `@zcode/server`           | `.` → `src/index.ts`                                                                   | `bun build --target=bun` → `dist/entry-http.js`（最终产物） |
| `@zcode/services`         | `.` → `src/index.ts`；私有别名 `#src/*`                                                | `tsc -b` → `dist`                                           |
| `@zcode/session-control`  | `./contracts`、`./cli`、`./app`、`./testing` → `src/**`；私有别名 `#session-control/*` | `tsc -p tsconfig.build.json` → `dist`（不导出）             |
| `@zcode/shared`           | `.` + 31 个子入口 → `src/**`；私有别名 `#src/*`                                        | `tsc -b` → `dist`                                           |
| `@zcode/ui`               | `.` + 15 个子入口 → `src/**`（含资源 `./styles.css`）                                  | `tsc -b` → `dist`；Vite 打包时消费源码                      |
| `@zcode/web`              | 无 `exports`（应用容器，不被其它包导入）；私有别名 `#src/*`                            | `vite build` → `dist`（最终产物）                           |

说明：

- 私有别名 `imports`（`#src/*`、`#session-control/*`）只在包内部生效，不是对外公共入口；其通配目标仍必须能匹配真实文件。
- `session-control` 的 `tsconfig.json` 不是 composite → `noEmit`，另有 `tsconfig.build.json` 负责 `dist`；该 `dist` 同样不对外导出。
- 所有 public 入口当前都是源码或 CSS 资源；没有任何 dist 入口，因此干净工作区只需依赖安装即可解析与运行。

## 入口预检（P0）

`scripts/architecture/package-entrypoints.mjs`（经 `scripts/architecture/index.mjs` 接入 `architecture:check`）逐条展开每个包的 `exports` / `imports`，包括条件、数组、通配与 `null` 分支：

- 源码、资源目标必须真实存在；通配必须至少匹配一个真实文件或受支持的 TypeScript 输出。
- 拒绝目录目标、越界路径、`%2e%2e` 编码绕过、包外相对路径与空通配。
- `dist/**` 目标只接受由该包 tsconfig 真实 emit 的输出（含继承配置），`noEmit`、仅 JS、仅声明、扩展名不匹配均失败；声明文件允许尚未构建。
- `imports` 的 workspace 目标必须命中目标包真实存在的公共 `exports`；Node 内置模块放行。
- 该检查不接受 `--changed` 范围或 baseline 豁免，也不为新增包提供白名单。修改入口后直接跑 `bun run architecture:check --changed`。

## 修改入口的规则

1. 新增公共入口：目标必须是真实源码或真实资源文件；`types` 与 `default` 同源；通配必须有实际匹配。
2. 只有确实需要发布构建产物时，才允许 `dist/**` 入口：先提供能 emit 该文件的 tsconfig，并在同一次变更中更新本文；禁止用 `noEmit` 配置声明产物入口。
3. 新增 workspace 包：`private: true`、`exports` 指向 `src`、`type: "module"`，并在本文的入口盘点表中补一行。
4. 不新增 dist 回退条件、`main` 字段或运行时 shim 来掩盖“未构建”；不因干净工作区问题更换打包器。
5. 保留 `packages/ui` 的通用控件与 `styles.css` 入口；入口收敛只处理 types/default 指向，不删除未调用的控件或依赖。

## 验收

1. 删除 `packages/*/dist` 与 `*.tsbuildinfo`（保留 `node_modules`）后，`bun run --cwd packages/rpc typecheck` 通过且不生成 `dist`。
2. 同一状态下根 `bun run typecheck` 通过（`tsc -b` 按 references 拓扑构建，不依赖旧 `dist`）。
3. 同一状态下 `bun run build:server` 与 `bun run build:web` 通过：Bun 内联 workspace 源码与非 builtin 依赖，Vite 从 `exports.default` 读取源码；后端产物由 Bun 直接执行。
4. `bun run architecture:check --changed` 的入口预检无新增失败。
5. 任意消费侧都能从 `@zcode/rpc` 同一份 `src/index.ts` 解析类型与运行时，`dist` 是否存在不改变结果。
