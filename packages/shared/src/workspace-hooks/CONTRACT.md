# Workspace Hook 契约

公开入口 `@zcode/shared/workspace-hooks` 定义 Hook 配置 schema、事件名、快照 DTO、限额与纯配置计算。

模块不读取文件、路径或密钥，不发现配置、不执行命令、不计算文件摘要、不持有业务状态。保留配置类型不表示当前产品提供 Hook 管理服务或执行入口。
