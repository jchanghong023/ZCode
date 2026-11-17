# 内部源码 workspace 包

根仓库和 `packages/*` 的 11 个成员均为私有 ESM 工程。包入口事实源是各包 `package.json`；workspace 包由 Bun/Vite 直接消费源码，不经过 npm 发布或 `dist` 回退。

## 当前入口

| 包                        | 公共入口                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `@zcode/client`           | `.` → `src/index.ts`；`./globals` → `src/globals.d.ts`           |
| `@zcode/design-runtime`   | `.` → `src/index.ts`                                             |
| `@zcode/model-option-map` | `.` → `src/index.ts`                                             |
| `@zcode/provider`         | `.` → `src/index.ts`                                             |
| `@zcode/rpc`              | `.` 的 `types`、`default` 均为 `src/index.ts`，顶层 `types` 同源 |
| `@zcode/server`           | `.` → `src/index.ts`                                             |
| `@zcode/services`         | `.`、`./aireq`、`./logger` → 对应 `src/**`                       |
| `@zcode/session-control`  | `./contracts`、`./cli`、`./app`、`./testing` → 对应 `src/**`     |
| `@zcode/shared`           | `.` 和显式子入口 → 对应 `src/**`，完整列表见包 manifest          |
| `@zcode/ui`               | `.` 和显式子入口 → 对应 `src/**`；`./styles.css` 为 CSS 资源     |
| `@zcode/web`              | 无 `exports`，由 Vite 的 `index.html` 启动                       |

`services`、`shared`、`web` 的 `#src/*` 与 `session-control` 的 `#session-control/*` 是包内 `imports` 别名，不是公共 API。导出路径的名称不代表当前产品存在同名功能入口。

## 消费与产物

- 浏览器 Vite 和后端 Bun 解析 `exports` 的源码入口；编辑器同样读取源码类型。
- 根 `bun run typecheck` 使用 `tsc -b` 和 project references，按引用关系生成所需声明。直接 `tsc -p` 消费方不会自动补建引用工程。
- RPC 的 composite 配置保留声明输出；其独立 `typecheck` 用 `--noEmit --composite false`，不需要既有 `dist`。
- 当前没有公共 `exports` 指向 `dist`。各包的 TypeScript 输出和 `*.tsbuildinfo` 是可重建产物；最终部署产物为 server/web 的 `dist`。
- 不支持 TypeScript 的裸 JS 加载器不是这些私有源码包的运行方式，不为它添加 `main`、dist fallback 或兼容 shim。

构建与清理入口见 [构建工作流](web-build-workflow.md)。

## 入口完整性

[`package-entrypoints.mjs`](../../scripts/architecture/package-entrypoints.mjs) 通过 `architecture:check` 检查全部 workspace 的 `exports` / `imports`，不受 changed 范围或 baseline 豁免：

- 逐一检查条件和数组分支；`null` 分支不产生目标。
- 源码和资源必须是包内真实文件，不能是目录或指向包外的符号链接；通配须有真实文件或受支持的 TypeScript 输出匹配。
- 拒绝越界路径、非法编码和禁用路径段。
- 未生成文件只有在包内 tsconfig 及其继承链可推导出对应 emit 时才成立；不猜测 `dist → src`，`noEmit` 配置不能证明输出存在。
- `imports` 的外部目标仅接受 Node builtin 或现存 workspace 公共导出；不接受悬空或循环映射。

修改入口时保持类型与运行时同源，并同步实际消费者。公共包导出与模块公开入口是两层约束；后者见 [模块所有权](pure-web-module-ownership.md)。Node 专用子入口不得进入浏览器依赖图。
