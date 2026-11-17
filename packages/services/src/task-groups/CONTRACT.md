# 任务分组

当前电脑 Web 不装配任务分组；`ITaskGroupService.admit` 与同名 descriptor、accessor、频道、
代理和内部注册全部退出。原因：原生会话的当前入口没有分组消费者，不能为旧侧栏保留空成功服务。

只保留通用展示仍可使用的 group DTO；这些类型不持有分组状态，不复制会话事实，不构成公开 RPC。
