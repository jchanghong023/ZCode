# managed-worktree-ui

当前 AIReq Web 不启用桌面受管 worktree 创建／管理 transport。旧创建、分叉、可用性查询、Host 记录订阅和 composer 接线随接口删除，不提供空服务或假结果。

保留纯展示资产：`WorktreeToggle`、`ForkDestinationMenu`／`ForkDestinationContext`、`WorktreeCreatedMarker`／`WorktreeOutputBlock`、worktree 标签与错误展示及其 DTO。会话历史中的 CLI worktree 标记继续正常展示；这些组件不读取已退出的宿主服务。
