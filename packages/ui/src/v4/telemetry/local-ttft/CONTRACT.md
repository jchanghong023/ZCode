# Renderer 首输出观测

Renderer 持有一次发送观测。首输出仅来自 online 实际内容，ACK、检查点和历史快照不计入。DOM 与绘制估计匹配同一会话、轮次和正文行；日志失败不影响会话投影。

共享字段与限额由 `packages/shared/src/local-ttft/CONTRACT.md` 及其 `contract.ts` 定义，写入通过现有 adapter 注入，不建立另一份会话状态。
