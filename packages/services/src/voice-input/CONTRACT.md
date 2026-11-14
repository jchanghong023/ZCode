# voice-input-service

当前治理范围（纯 Web）：Composer 语音输入的本机 Host 服务契约（`contract.ts` + `index.ts`，通道
`voice-input`）。ASR 连接与 ticket 请求实现已随桌面裁撤移除；mock 后端
（`packages/server/src/mock/domains/compat-surfaces.ts`）与 `IServiceAccessor.voiceInputService` 按同一契约
注册与调用。

- `IVoiceInputService`：`start`、`sendAudio`、`finish`、`cancel`；结果经 `onEvent` 发出 `started` /
  `result` / `completed` / `error`。`sendAudio` 为 16kHz 单声道 PCM16LE，started 之前的音频按顺序缓存。
- 唯一数据源是当前会话：同一时间只有一个会话，新的 `start` 取消旧会话；旧会话的回调与事件直接丢弃。
- 每个 attempt 最多发出一个终态事件（`completed` 或 `error`）；`cancel` 后不再发出事件。
- 不设客户端超时，依赖服务端 start / idle / finish 超时。
- 日志不记录识别文本、音频、ticket 和 JWT；错误只按 `VoiceInputErrorCode` 分类暴露。
- 只在桌面 base 连接暴露给 renderer，不进入远程 workspace RPC 合同和手机白名单。
