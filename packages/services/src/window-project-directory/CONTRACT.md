# 窗口项目目录

当前治理范围（纯 Web）：窗口项目目录能力契约（`contract.ts` + `index.ts`，频道 `window-project`、
`window-project-changes`）。窗口 Host 装配与 relay 已随桌面裁撤移除；mock 后端
（`packages/server/src/mock/index.ts`）注册同一组服务。

纯 Web 的 owning Host 是当前连接的后端，所有浏览器工号共用同一项目事实源。
mock 的 `project` 与 `window-project` descriptor 注册同一个项目实例，提交项目表后发出既有只读变化事件；
变化流不持有第二份业务状态。浏览器各自取消 listener，不清空共享项目数据。

- `windowProjectDirectory` 是整体可选的窗口目录能力：项目读写复用 owning Window Host 的现有服务；只读
  变化流只转发该窗口的 `state:projects`，不保存项目或任务状态，不暴露完整 broadcast 写入与 claim。
- 客户端只根据 bridge 的显式能力创建整组 proxy：发布前调用变化服务 `getCapabilities` 并验证 `version: 1`。
  缺能力维持旧版行为；已声明能力但缺服务或就绪失败明确拒绝，不能静默切回 Source 目录。
- 订阅直接沿用原窗口 broadcast；取消订阅释放原 listener。
- bridge 换代由调用者清理旧 proxy 与订阅，不增加独立 attachment、重试、持久化或目录缓存。
