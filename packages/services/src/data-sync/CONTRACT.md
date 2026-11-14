# data-sync-service

当前治理范围（纯 Web）：数据同步的分类服务形状，公开入口 `index.ts` / `contract.ts`。实现文件已随
纯 Web 裁撤移除；mock 后端（`packages/server/src/mock/domains/sync.ts`）与设置页
（`packages/ui/src/data-sync`）按同一契约注册与调用，方向由调用方决定，服务不写死 source/target。

- `IDataSyncCategoryService<TPayload>`：`listSyncItems` / `getSyncContentHashes` /
  `checkSyncWriteAccess` / `exportSyncItems` / `importSyncItems`。
- `IUserConfigSyncService`（通道 `user-config-sync`）：子智能体、命令、钩子共用一个通道，每个方法多
  一个 `category`；未知 category 直接报错。`IUserConfigSyncService` 用服务描述符声明，不注册别名通道。
- `IDeviceSyncStateService`（通道 `device-sync-state`）：按 sourceServerId 记录上次同步结果，是设备列表
  的唯一读取源；不缓存到别处。
- `getSyncContentHashes({ keys, targetHomeDir })` 由调用方按目标端路径计算来源端哈希；需要路径改写的
  分类（MCP、插件）先改写再比较。
- 比较与冲突判定在 Renderer 纯函数中完成：推送永不删除目标端独有条目，`importSyncItems` 只处理 `items`
  中列出的 key；`overwrite` 必须带目标端哈希，不一致返回 `conflict` 且不写入。
- 服务本身不判断 UI 范围，也不区分离线设备；离线与能力缺失由调用方按 source-settings attachment 处理。
