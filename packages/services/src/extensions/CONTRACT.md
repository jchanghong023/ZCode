# 扩展门面（Window Host）

当前治理范围（纯 Web）：三个门面的契约层——`contract.ts`（插槽数据与命令）、`views/contract.ts`
（扩展视图）、`grants/contract.ts`（授权），公开入口 `index.ts`。能力网关、静态表实现与扩展进程
链路已随桌面裁撤移除；mock 后端（`packages/server/src/mock/domains/extensions.ts`）与
`packages/ui/src/extension-slots` 按同一契约注册与消费。

- 业务服务不知道插件存在：扩展只经这三个门面访问 App；新方法按意图归到已有门面。每个契约保持
  最多 12 个公开方法，超出的意图另开门面而不是扩张已有集合。
- 静态表的唯一 owner 是本服务；贡献表 owner 是扩展进程。`ExtensionsContributionsMessage` 中
  `static` 与 `snapshot` / `delta` 是两类 owner 的数据，`detached` 只表示「没有可用快照」，不是第二份
  贡献表，静态表不受影响。
- 订阅顺序固定：先收当前静态表（还没读完清单时 rev 为 0、没有插件），再收贡献表快照，之后是重读后的
  静态表、增量与后续快照。日志流不重放，先订阅再 getLogs。
- Renderer 只报告事实（工作台、语言、seq），不推推算状态；扩展进程状态与日志缓冲的 owner 是 Main 的
  监管器，本服务只转发，不留副本。
- `provideMentionItems` 不设计取消，seq 原样带回；错误折成结果里的稳定码，不抛给 Renderer。
- 设计见 `docs/plugins/extension-host.md`（§3.5、§4、§16、§17）。
