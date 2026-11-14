# managed-worktree-tasks

当前治理范围（纯 Web）：受管 worktree 的任务编排契约 `contract.ts`（`IManagedWorktreeService`，RPC 通道
`managed-worktrees`）。Git adapter（原 `managed-worktree-repo`）与 Host 装配已随桌面裁撤移除，不再登记
独立模块；mock 后端（`packages/server/src/mock/domains/projects.ts`）与
`packages/ui/src/managed-worktrees` 按同一契约注册与调用。

- 唯一事实源：worktree 是否存在以 `git worktree list` + 受管布局为准（shared `managed-worktree` 布局）；
  「使用它的任务」按 tasks-index `worktree_root` 精确匹配；创建记录与删除租约只在本服务内存中。
- 启动创建的结果只返回 creationId，进度经 `onDidChangeCreations` 推送；创建记录是唯一数据源，renderer 不推算。
- 删除先取得租约，再检查任务与终端，等待已通过闸门的会话操作结束后才执行 `git worktree remove`。
- `dismissCreation` / `continueWithoutWorktree` 先按最后一次命令向执行 owner 查询，已执行即按「会话已启动」
  结束，不删除；撤销预留行只针对尚无事实的行。
- 所有外部副作用经注入端口；本模块不新建第二份任务或 worktree 状态。
- 规格见 `docs/git/worktree.md`（§2.1、§3.3–§3.6、§3.11、§8）。
