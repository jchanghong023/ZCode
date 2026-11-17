# plugin-host-queries

当前模块保留插件宿主只读查询的严格线格式 schema、类型、候选项限额与稳定错误码，以及官方插件身份／可见性纯规则、安装请求载荷 schema、翻译表与长度校验。不执行 IO，不读取私有设置，不调用 MCP 工具，不持有业务状态。

三个公开入口保持原源码路径，不新增包装层：

- `packages/shared/src/zcode-protocol/plugin-host-queries/contract.ts`：插件宿主只读查询协议。
- `packages/shared/src/plugin-store-visibility.ts`：官方插件身份与可见性纯规则。
- `packages/shared/src/zcode-protocol-v4/pluginInstall.ts`：安装请求载荷与本地化文本边界。

模块依赖外部 `zod` 与 `shared` 的既有协议／官方市场标识。服务侧 `pluginHostQueriesClient.ts` 及无当前消费者的 `getPluginMentionItems` RPC 已删除；旧 `getPluginUserOptionsReader` 说明不是当前入口，也不新增替代读取器或兼容代理。

协议约束：

- 保留 `plugins/readUserOptions` 的插件标识与设置值结果 schema，以及 `plugins/mentionItems` 的请求、候选项和结果 schema。
- 错误数据只提供稳定 `code`，不携带选项值；候选项限额与字段校验继续由既有 schema 定义。
- 线格式保持 strict；保留协议定义不表示当前提供对应 RPC 或插件宿主执行能力。
- 官方身份、可见性与安装载荷校验只约束保留协议，不开放插件发现、推荐、安装或执行能力。
