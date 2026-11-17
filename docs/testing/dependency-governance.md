# 依赖与导出扫描

[`knip.json`](../../knip.json) 定义 Knip 的扫描入口和保留资产。`bun run knip` 是诊断工具，不是自动删除清单；有发现时非零退出不应通过包装脚本伪装成通过。当前没有 pre-push 脚本或手动替代门禁。

## 操作入口

```sh
bun run knip
bun run knip --workspace packages/ui
bun run knip --include files
bun run knip --include dependencies
bun run knip --include exports,types
bun run knip --reporter json
bun run dep:refs <file>:<exportName>
bun run dep:refs --list-exports <file>
```

`dep:refs` 提供静态符号引用分析，不能证明动态运行路径不存在。Knip 能解析字面量动态导入，但同样不是运行时可达性的完整证明。报告必须结合真实入口、消费者与所有权判断。

## 当前扫描范围

- pnpm workspace 为 `packages/*`。Knip 从包 manifest、脚本及工具插件识别默认入口；`workspaces` 配置是覆盖项，不是包白名单。
- 根 `entry` 保留工程测试发现 glob 和显式脚本入口；测试 glob 不代表当前存在用例，工程测试清单为 `[]`。
- server 的 `src/entry-http.ts`、现存模块契约和非导出公共资产按配置显式作为入口。
- UI 保留基础控件、存量 mobile-ui 兼容控件、AI 展示控件、图标与部分通用组件；保留兼容控件不代表手机产品入口。
- 受管模块的 `module.ts` / `contract.example.ts` 是静态分析根和磁盘治理资产，不是运行时入口。
- 全局 `ignore` 当前只有 `.agents/**`；`tags: ["-lintignore"]` 排除对应标记。完整精确路径以配置为准。

保留资产使用 `entry`，使其依赖继续进入图，而不是仅用 `ignore` 隐藏报告。`includeEntryExports` 未启用，入口导出不按一般未使用导出处理。业务组件不因处于 `components` 目录就自动获得保留资格。

## 报告处理

| 类型                               | 判断方式                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| `files`                            | 确认是否存在真实消费者、动态入口或保留职责                  |
| `exports` / `types`                | 结合符号引用和公开契约判断，不能仅凭当前无引用删除 API      |
| `dependencies` / `devDependencies` | 排除 CSS、脚本参数、生成流程和动态消费等盲区                |
| `unlisted`                         | 为真实引用补依赖声明，不用 ignore 掩盖                      |
| `unresolved`                       | 核对别名、包出口和路径                                      |
| `binaries`                         | 核对脚本与工具链声明；Bun 由 mise 提供，不作为 npm 依赖补装 |

新增忽略必须有明确原因与影响范围，不以批量忽略、空壳入口或删除保留控件让报告变绿。真正修改依赖时同步 manifest 和锁文件，安装方式见 [构建工作流](../architecture/web-build-workflow.md)，版本与补丁见 [浏览器依赖](../architecture/browser-dependency-versions.md)。

Knip 与 [`architecture:check`](../architecture/pure-web-module-ownership.md) 互补：前者分析可能未使用的资产，后者检查模块依赖、公开边界和入口有效性。两者都不能由空测试套件代替。
