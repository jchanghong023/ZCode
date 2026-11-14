# provider-provisioning-status

当前治理范围（纯 Web）：数据同步页「模型提供商」分类的本机 Host 服务契约
（`contract.ts` + `index.ts`，通道 `provider-provisioning-status`）。Main 协调器的实现已随桌面裁撤移除；
mock 后端（`packages/server/src/mock/domains/compat-surfaces.ts`）与 `IServiceAccessor` 按同一契约注册与调用。

- `IProviderProvisioningStatusService`：`getStatus({ sourceServerId, waitForIdle? })`、`retry({ sourceServerId })`，
  都返回 `ProviderProvisioningLaneStatus`（`{ lane: "none" }` 或 `{ lane: "present", running, lastResult? }`）。
- 结果的唯一数据源是 Main 协调器的 lane（内存，不持久化）；本服务不缓存、不复制状态。
- 不设超时：Main 对每个请求都应答，没有协调器时回「无 lane」；没有 lane 时 `retry` 不执行。
- 只在桌面本机 Host 注册，不进入远程 workspace RPC 合同、source-settings 服务集合和手机白名单。
