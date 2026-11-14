# 可选择项目目录

项目由原 Host 服务独占写入。本模块通过只读端口读取当前 owner 的项目集合，供配置目录和执行定义共用；不拥有缓存、tab、连接或任务。

空 roots 保留给提交时 prepareSession 初始化；软删除项目不提供新建候选。

选择 ID 使用 Host 与项目 ID 的完整二元组，不能按 cwd 合并项目。该 ID 不参与 workspace 身份、执行路径或数据库 key。目录结果不改变 desktop continuous / mobile replayable 的 attachment 和 owner 语义。
