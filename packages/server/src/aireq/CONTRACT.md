# AIReq mock

单一进程生命周期内存 owner 持有共享项目、Release、提案、IR/SR、Issue、材料、报告、配置、Skill 和调度任务。服务重启恢复样例；关闭连接不取消已接纳工作。每五秒核验提案 MR 状态与当前完整材料。

公开 `MockAIReqService` 实现 `@zcode/services/aireq` bootstrap/call/onDidChange；所有普通调用显式携带合法工号和 clientId，写操作在服务端校验权限、版本、幂等及参数。`getConnectionServices` 为原生会话逐连接绑定不可变身份并保留既有连接 scope；ALS 仅传递请求上下文，不保存全局当前操作者。

原生 rows、附件字节、订阅、水位、帧唯一归现有 MockRuntime/MockZCodeAgentService；本模块仅提供 admission/completion/seed 业务回调，不建立另一套会话存储。只提供当前需求、评审、方案、Skill 与自动化原型，拒绝退休自由聊天、开发执行及验收动作。无真实 Git、模型、文件保存、数据库或外部 IO。
