# 纯 Web 模块所有权

模块登记与可执行边界以 [`architecture-policy.yaml`](../../architecture-policy.yaml)、模块 `module.ts` 和 [`scripts/architecture`](../../scripts/architecture) 为准。登记表示代码所有权，不表示当前产品提供该模块名称对应的入口或运行环境。

## 职责

- `packages/web`：浏览器应用装配、平台操作与当前标签页的工号入口。
- `packages/ui`：页面与控件，通过服务契约和注入的平台端口交互。
- `packages/services`：服务契约、descriptor 和服务装配接口；`rpc`、`client` 提供传输与连接能力。
- `packages/server`：HTTP、WebSocket 与领域装配；领域共享既有状态所有者，不复制注册表或状态。
- `packages/shared`：共享协议和纯函数。Node 专用子入口与浏览器安全入口分开，不能从浏览器图引入。

产品范围见 [项目目标](../project-goal.md)，后端实现范围见 [后端说明](mock-backend.md)。

## 模块登记

策略逐模块声明 `id`、`roots`、`managed`、`requires`、`publicEntrypoints`，以及适用的 `layers`、`layerOrder`、`owner`。更具体的根决定文件归属；不能因为外层包已登记，就视其全部源码都已受管。

每个 managed 模块保留四项真实产物：

| 产物                  | 内容                                         |
| --------------------- | -------------------------------------------- |
| `module.ts`           | 模块标识及依赖声明，与策略的 `requires` 一致 |
| `contract.ts`         | 对外契约                                     |
| `contract.example.ts` | 契约使用示例，不复制业务实现                 |
| `CONTRACT.md`         | 当前入口、消费者、职责及不变量               |

产物存在性按登记根检查；不强制测试骨架。新增模块可用现有入口登记：

```sh
bun run architecture:adopt <module-id> --root <dir> --layer <layer> --owner <owner>
bun run architecture:context <module-id>
```

`adopt` 更新登记并生成缺失产物，生成内容仍须填写为真实契约。新增源码受 `unmanaged-new-file` 规则约束；既有未受管文件的准入按策略中的上游快照和精确例外判定。例外只豁免指定规则，不放宽浏览器安全或包入口完整性。

没有现行消费者的模块整项退役时，同步删除其真实治理产物、包出口、策略根、公开入口与其他模块的依赖登记，不保留空壳、不降低 `managed` 或扩展例外。保留的协议 schema、通用展示和原生会话继续沿现有所有者与事件顺序；独立包装退役不表示底层协议也被删除。

## 静态检查

`bun run architecture:check` 执行检查；`--changed` 根据 Git 差异和反向依赖闭包收窄普通规则，支持 `--base <commit>`。包入口、策略路径和浏览器边界仍为全局检查。

当前检查包括：

- 模块产物、策略路径、包 `exports` / `imports` 的有效性。
- `module.ts` 与策略依赖一致、跨模块依赖已声明、只能访问公开入口。
- 层级方向、domain 的 IO 限制、UI 不直接访问实现层、循环依赖。
- 文件上限 800 行、契约上限 300 行、`contract.ts` 公开方法上限 12，以及 lint disable。
- 浏览器图中的 Node 内置模块、原生包和 Node 专用入口。

普通模块规则受 `managedOnly` 与精确例外控制；浏览器安全和结构完整性规则不能由 baseline 豁免。`architecture:report` 输出报告，`architecture:baseline:update` 修改基线，不是修复代码或补齐契约的替代品。

构建与源码消费分别见 [构建工作流](web-build-workflow.md) 和 [内部源码包](internal-source-packages.md)。
