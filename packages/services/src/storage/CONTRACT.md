# storage

当前治理范围（纯 Web）：设置页「数据与统计 → 存储管理」的服务契约 `contract.ts`
（`IStorageService extends StorageManagementApi`）。扫描/清理实现与桌面装配已随裁撤移除；仓储契约仍
约束该页面的 Host 实现，`packages/ui/src/resource-manager/storage` 按同形的
`StorageManagementApi` 调用（`startScan` / `cancelScan` / `getSnapshot` / `clean`）。

- 同一时刻至多一个 running job；`startScan` 隐式取消旧 job，`cancelScan(jobId)` 对非当前 job 是 no-op。
- 同一 job 内进度快照的 `bytes` 只增不减；`status` 只能从 `scanning` 到 `complete | cancelled | failed`。
- `clean` 只删除 catalog 显式匹配且通过 `cleanPlan` 校验的路径；受保护白名单在任何类别下都不删；失败逐
  路径记入 `failures`，不抛整体异常。
- `entries` 只聚合到规则命中路径的下一级并有数量上限；快照体积与文件总数无关。
- 数据根来自注入的 `RootsResolverPort`，模块内不读环境变量、不读设置文件。
- 只做桌面端存储管理；不进入 task realtime 链路，不区分 `desktop-continuous` / `web-remote-replayable`。
