# context-composition

当前模块仅保留本目录 `contract.ts` 中 context 组成的 v4 线格式 schema、类型、限额常量与纯投影函数；不执行 IO、查询或订阅，也不持有会话状态。

唯一公开入口为 `contract.ts`。其内部复用 shared 的模型选择与 context usage 粗类别定义，因此模块依赖仅为 `shared`。服务侧 `contextCompositionClient.ts` 及无当前消费者的 `getContextComposition`／`onDynamicContextCompositionChanged` RPC 已删除，不是当前入口。

协议约束：

- 组成只表达类别、条目名和大小，不提供正文；条目名最长 200 字符，每类最多 50 条。
- 细类别通过 `contextCompositionUsageSource` 纯函数投影到既有圆环粗类别，不扩展 shared 的 7 值枚举。
- 线格式保持 strict；本次收口不修改 schema，不通过保留协议定义恢复旧查询或通知。

CLI 分类、草稿预演、修订号 tracker、existing-only 查询及通知合并见历史设计 `apps/zcode-cli/docs/design/v2/model/context-composition.md`。这些描述不是当前仓库中的执行入口或实现承诺。
