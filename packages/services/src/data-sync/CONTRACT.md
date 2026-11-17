# 数据同步分类契约

`contract.ts` 仅定义通用 `IDataSyncCategoryService<TPayload>` 形状：列出条目、计算内容哈希、检查写权限、导出及导入。需要路径改写的分类通过显式 targetHomeDir/workspace 参数表达目标。

契约不持有状态、不注册频道，不表示当前产品提供用户配置、MCP 或设备同步执行服务。
