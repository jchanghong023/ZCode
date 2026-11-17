# storage

当前治理范围（纯 Web）：仅保留 `contract.ts` 中的类型契约
（`IStorageService extends StorageManagementApi`）及共享存储类型再导出。
扫描／清理实现与桌面装配已移除；无当前挂载入口的
`packages/ui/src/resource-manager` 页面及其独占存储 UI 不再挂载。
当前没有此契约的运行时 UI 消费者或扫描／清理实现，不表示 Web 设置页或 Host 已提供存储管理。

以下为保留接口的语义约束，不是当前运行能力或已通过验收的声明：

- 同一时刻至多一个 running job；`startScan` 隐式取消旧 job，`cancelScan(jobId)` 对非当前 job 是 no-op。
- 同一 job 内进度快照的 `bytes` 只增不减；`status` 只能从 `scanning` 到 `complete | cancelled | failed`。
- `clean` 只删除 catalog 显式匹配且通过 `cleanPlan` 校验的路径；受保护白名单在任何类别下都不删；失败逐
  路径记入 `failures`，不抛整体异常。
- `entries` 只聚合到规则命中路径的下一级并有数量上限；快照体积与文件总数无关。
- 数据根解析与路径校验属于扫描／清理实现职责；当前契约模块不读取环境变量、设置或文件系统。
- 此契约不进入 task realtime 链路，不改变 `desktop-continuous` / `web-remote-replayable` 交付语义。
