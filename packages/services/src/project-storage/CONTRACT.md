# project-storage

当前治理范围（纯 Web）：项目组织态的仓储事务契约——`repository-contract.ts`，由 `project` 模块消费。SQLite 实现、迁移 SQL、迁移端口与 CLI 交接已随桌面/CLI 链路移除；调用者持有 app SQLite 连接，CLI 不导入此模块。

- `ProjectRepositoryContract` 的写方法（save/delete/move/reorder/reserveCreatedTask）不写 `cli_*` 列；列表与目录解析在同步读事务中完成，不跨 await。
- 缺 root 的移动需要 `addMissingRoot`；恢复必须同 Host 且 roots 集合完全相同；项目唯一名称在写事务中分配。
- 预留在 CLI 首发前提交，重试不覆盖已有归属与执行目录快照；`findCreationReceipts` 只读，不带 workspace。
- 归档、置顶、未读与归位仍由本模块的组织态拥有；执行后端过滤不写旧数据、不改迁移。
