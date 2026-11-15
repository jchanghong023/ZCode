# Mock 领域模块

`packages/server/src/mock/domains` 是模拟后端的领域装配层：把原来按「簇」堆在一个大文件里的 mock 服务，按实际领域拆成插件、设置、模型、项目、自动化、分享、同步、扩展、工作区资产、兼容面十个目录级模块（每个 `.ts` 一个领域）。

## 边界

- 每个领域文件只导出本域服务类与一个 `register<Domain>MockServices(services, runtime)` 装配函数（`contract.ts` 的 `MockDomainRegistrar`）。
- 集中装配仍在 `packages/server/src/mock/index.ts`：它按固定顺序调用各域装配函数，不反向依赖领域内部实现。
- 领域模块不得读取或改写其它领域的私有字段。跨领域权威状态只有 `MockRuntime`（会话、任务、虚拟文件系统、git、设置、topic 水位）。
- `@zcode/services` 只作为契约输入：领域模块导入服务接口与 descriptor，不导入真实实现。

## 能力语义

各服务直接按已有 wire 契约返回能力值：已实现操作必须有可观察的内存状态转换，未实现操作明确拒绝。这里只按领域拆分代码，不建立能力矩阵实现层；UI 不增加 mock 分支。

产品账号 OAuth 服务不再注册：不返回固定账号、假授权 URL 或空登录成功。工号只由浏览器标签页保存，
不需要后端账号会话契约；模型与工具凭据仍通过原 ICredentialService / Provider 服务访问，
工号切换或退出不触发这些服务的删除、解绑或设置重置。

终端、Git 检查点、营销、Desktop Provider Provisioning、会话分享和商业订阅交易不属于当前产品，
不再注册兼容空壳。Provider 设置、模型目录、用量投影及当前 AIReq／自动化内存业务仍沿既有契约访问。

当前后端的 `MockRuntime` 与项目服务是共享业务事实源，不按浏览器工号、连接或 subscriptionId 分区。
工作区身份按服务器主机及绝对目录稳定派生，贯穿 HTTP 元信息、prepare/resolve、任务、controller 和 v4 topic；
identity 不是旧远程 Host 的连接开关。目录选择只读服务器目录，虚拟文件与 Git fixture 不改为真实 IO。
项目服务与窗口项目服务必须注册同一个项目实例，不能各持一张内存表；项目保存/删除/恢复先更新该表，
再经既有 WindowProjectChanges 通知所有浏览器刷新。controller 任务投影覆盖当前后端的所有会话目录，
不能只保留启动目录；工作区快照从默认目录与会话事实派生，不新增第二份工作区业务状态。
路径型 v4 请求仍沿用既有 wire topic 键，mock 只在内部统一业务身份与水位，再按订阅的原请求键投递，
避免旧请求和带身份请求变成两套会话，且不要求修改严格帧 schema 或逐连接 facade。

每条 `/ws` 仍有独立 `createZCodeAgentConnectionScope`：握手、conversation / sessions-index /
workspace-config 的订阅归属、帧过滤及断开清理均不得因共享业务数据而移除。取消 A 的订阅不影响 B。
mock controller 仍使用服务实例级订阅表和事件流，未实现同等级的逐连接授权/断开回收；它是原型限制，
不是可复用的生产安全设计。本轮不为此新建安全框架，也不扩大公开 RPC 服务/方法集合。
命令去重、CAS 与命令结果查询亦保持原型简化；真实后端必须依已有 v4 契约实现，不能照搬 mock 的弱化行为。

## 装配顺序

```text
mock/index.ts
  ├─ MockRuntime（唯一权威状态）
  ├─ broadcast（跨窗口总线）
  ├─ domains/settings → domains/models → domains/plugins → domains/extensions
  ├─ domains/assets → domains/sync → domains/projects → domains/automations
  ├─ domains/sharing → domains/compat-surfaces
  └─ zcodeAgent / zcodeTask / project / workspace（协议与文件、Git 面）
```

顺序只影响注册表写入，不表达依赖；任何领域都不应在装配期执行副作用（不写文件、不发网络请求、不启动定时器）。

## 新增领域

1. 先更新 `docs/architecture/mock-backend.md` 的支持矩阵与状态所有者。
2. 在 `domains/` 下新增领域文件，实现真实内存行为或明确拒绝，不留空壳实现。
3. 在 `mock/index.ts` 显式调用其装配函数。
4. 涉及协议帧/命令时，帧必须经 `@zcode/shared/zcode-protocol-v4` 的 zod schema 自校验，ACK 状态遵循 `docs/architecture/mock-backend.md` 的 ACK 规则。
