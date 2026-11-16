# remote-input-prediction

当前模块仅保留 `contract.ts` 中输入预测的 v4 线格式 schema、类型、限额常量与 `emptyInputPredictionResult` 纯函数；不执行 IO、模型调用或会话状态修改。

当前 Web 不提供输入预测 RPC，Host 不再宣告 `capabilities.inputPrediction`；服务侧环境变量开关、对应 mock 方法与开关测试已删除，不属于本模块入口。

协议不变量：

- 请求与结果使用严格对象 schema；保留 `sessionId`、非负整数 `revision` 以及可选 `draft`／`requestId` 的既有格式和长度限制。
- 结果最多 3 个候选；候选为非空白单行续写文本，最多 40 字符，置信度范围为 0–1。
- `emptyInputPredictionResult` 仅为非 `show` 决策构造空候选、零置信度结果，提供 `requestId` 时原样携带。

历史手机远控 ghost hint 的 Host 转发、CLI handler／sidecar、模型调用及取消时序见 `docs/web-remote-control/mobile-input-prediction.md`；这些是历史设计，不是当前实现或公开入口，也不构成恢复已删开关的要求。保留协议定义不表示当前支持预测请求。
