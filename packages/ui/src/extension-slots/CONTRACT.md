# 扩展插槽（Renderer）

当前 AIReq Web 不启用桌面扩展 transport。旧本机扩展服务、store、adapter、沙箱视图及其专属挂接已退出；不得通过空服务或不可用代理恢复这些接口。

保留 `contract.ts` 中的纯展示 DTO、`domain/` 纯选择／格式化函数、白名单图标与 `ExtensionMentionOptionContent`。这些资产只消费显式输入，不读取服务或持有宿主状态。公开入口为 `index.ts`、`contract.ts` 和纯候选行组件；当前 composer 与 mention 不再登记扩展插槽。
