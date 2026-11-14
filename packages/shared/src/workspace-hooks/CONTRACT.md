# Workspace Hook contract

唯一所有者：shared 的 `workspace-hooks` 模块。公开入口 `@zcode/shared/workspace-hooks`。

- 提供浏览器与 Node 共用的 Hook 配置 schema、快照 DTO 和纯配置计算；不读取路径、文件、密钥，不产生摘要。
- `services/hooks` 与浏览器可达的同步协议仅消费本契约。Node discovery、digest、mutation 消费同一契约，不再反向定义浏览器类型。
- 文件发现与摘要仍由现存 Node 专用入口负责；本次不改变事件顺序、摘要格式、信任决策或状态所有者。
- 验收由架构工程回归验证契约无 Node 传递依赖，并拒绝浏览器跨入 Node 专用入口。
