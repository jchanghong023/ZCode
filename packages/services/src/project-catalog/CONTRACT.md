# 可选择项目目录

当前治理范围（纯 Web）：只读项目目录快照，公开入口 `index.ts` / `contract.ts`，消费者是
`packages/ui/src/workspace-config-catalog`（`readProjectCatalog`）。

- 本模块只经 `IProjectService.readTree` 读取与 mention 相同的安全同源投影，并取其中的 `projects`，
  不枚举宿主目录、demo 项目或其他身份的私有草稿，不拥有缓存、tab、连接、任务或第二份项目状态。
- 软删除项目始终过滤，不提供新建候选；空 roots 不产生配置目录，不初始化目录或恢复已裁撤的项目准备能力。
- 选择 ID 使用 Host 与项目 ID 的完整二元组（`selection-id.ts`），不能按 cwd 合并项目；该 ID 不参与
  workspace 身份、执行路径或数据库 key。
- 目录结果不改变 desktop continuous / mobile replayable 的 attachment 与 owner 语义。
