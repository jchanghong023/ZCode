# plugin-host-queries

当前模块仅保留本目录 `contract.ts` 中插件宿主只读查询的严格线格式 schema、类型、候选项限额与稳定错误码；不执行 IO，不读取私有设置，不调用 MCP 工具。

唯一公开入口为 `contract.ts`。源码仅依赖外部 `zod`，无其他受管模块依赖。服务侧 `pluginHostQueriesClient.ts` 及无当前消费者的 `getPluginMentionItems` RPC 已删除；旧 `getPluginUserOptionsReader` 说明不是当前入口，也不新增替代读取器或兼容代理。

协议约束：

- 保留 `plugins/readUserOptions` 的插件标识与设置值结果 schema，以及 `plugins/mentionItems` 的请求、候选项和结果 schema。
- 错误数据只提供稳定 `code`，不携带选项值；候选项限额与字段校验继续由既有 schema 定义。
- 线格式保持 strict；保留协议定义不表示当前提供对应 RPC 或插件宿主执行能力。
