# project-storage

当前治理范围（纯 Web）：项目组织态的持久化契约——`contract.ts`（迁移与装配端口）与
`repository-contract.ts`（仓储事务面），并由 `project` 模块消费。SQLite 实现、迁移 SQL 与 CLI 交接
已随桌面/CLI 链路移除；契约是未来的唯一写入口，调用者持有 app SQLite 连接，CLI 不导入此模块。

- `ProjectStorageContract.migrate(db, context)`：版本化加法迁移，同事务交接旧版本的新增行、删除与标题
  意图；每次启动调用，不重算已处理项。`repository(db, hostId)` 与 `admitTaskIdentity(db, task, hostId)`
  共用同一连接与可信 Host 身份，不读取或修改 CLI db.sqlite。
- 迁移 ID 与 SQL/checksum 一经发布不再改写；已发布的历史迁移不重跑、不重排、不自动清理项目。
- `ProjectRepositoryContract` 的写方法（save/delete/move/reorder/reserveCreatedTask）不写 `cli_*` 列；
  列表与目录解析在同步读事务中完成，不跨 await。
- 缺 root 的移动需要 `addMissingRoot`；恢复必须同 Host 且 roots 集合完全相同；项目唯一名称在写事务中分配。
- 预留在 CLI 首发前提交，重试不覆盖已有归属与执行目录快照；`findCreationReceipts` 只读，不带 workspace。
- 归档、置顶、未读与归位仍由本模块的组织态拥有；执行后端过滤不写旧数据、不改迁移。
