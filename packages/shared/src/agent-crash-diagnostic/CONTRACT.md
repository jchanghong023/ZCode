# Agent 退出诊断

纯函数解析退出码、信号与 stderr 尾部，生成脱敏的错误名、错误码、消息、堆栈、指纹和诊断分类。Windows `0xE0000008` 映射为 `native_out_of_memory`。

`redactAgentDiagnosticSecrets` 处理凭据遮盖，对已处理文本幂等。模块不执行 IO、不持有进程状态；保留诊断算法不表示当前浏览器有桌面 Agent 进程或退出上报宿主。
