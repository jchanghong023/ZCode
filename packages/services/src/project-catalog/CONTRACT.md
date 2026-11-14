# 可选择项目目录

当前治理范围（纯 Web）：只读项目目录快照，公开入口 `index.ts` / `contract.ts`，消费者是
`packages/ui/src/workspace-config-catalog`（`readProjectCatalog`）。

- 项目由原 Host 服务独占写入。本模块只经只读端口读取当前 owner 的项目集合，供配置目录与执行定义共用；
  不拥有缓存、tab、连接、任务或第二份项目状态。
- 软删除项目不提供新建候选；空 roots 保留给提交时 `prepareSession` 初始化。
- 选择 ID 使用 Host 与项目 ID 的完整二元组（`selection-id.ts`），不能按 cwd 合并项目；该 ID 不参与
  workspace 身份、执行路径或数据库 key。
- 目录结果不改变 desktop continuous / mobile replayable 的 attachment 与 owner 语义。
