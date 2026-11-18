# AIReq 模块与依赖检查

Web 入口负责浏览器装配和平台操作；UI 持有导航、草稿及服务端数据的展示投影。client／rpc 负责连接和传输，services／shared 提供契约和协议，server 实现业务写入及会话服务。具体公开入口、依赖方向和分层以[模块登记](../../architecture-policy.yaml)及各包 manifest 为准。

## 检查范围

- 浏览器依赖检查覆盖策略中的浏览器源码目录和包入口，检查 Node 内置模块、原生包和服务端专属入口。
- 包入口检查核对 workspace 的 `exports`、`imports` 和资源路径。策略引用的根与入口也必须存在。
- 受管模块按登记检查跨模块导入、允许依赖、层级、循环和文件规模。模块以 `module.ts` 声明依赖，策略中的 `publicEntrypoints` 指向实际接口文件，`CONTRACT.md` 记录约束。

## 命令

| 场景 | 仓库根命令 |
| --- | --- |
| 定位一个模块的入口和依赖 | `bun run architecture:context aireq-ui` |
| 检查当前变更及受影响的依赖方 | `bun run architecture:check --changed` |
| 对指定提交比较 | `bun run architecture:check --changed --base <commit>` |
| 策略或检查器变更 | `bun run architecture:check` |

上下文命令默认列出相关文件路径。需要连同直接依赖的契约正文一起查看时加 `--full`。

新增受管模块时，在 `architecture-policy.yaml` 登记模块目录、依赖和公开入口，同步模块的 `module.ts` 与 `CONTRACT.md`，再运行全量检查。检查发现违规时返回非零退出码。

增量模式从 Git 取得本地差异和未跟踪文件。比较基线依次取 `--base`、`ARCHITECTURE_BASE`、CI 提供的提交、上游或默认分支的共同祖先，最后回退到 `HEAD`。浏览器边界与包入口仍全量检查。新增文件按当前目录和依赖关系接受检查。业务验证见[前端 UT 与后端 ST](../testing/unit-test-quality.md)。
