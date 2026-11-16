# Mock 领域模块

`packages/server/src/mock/domains` 是当前 Web 原型的领域装配层，只注册当前界面、原生会话及受保护通用控件仍消费的服务。

## 边界

- 每个领域文件只导出本域服务类与一个 `register<Domain>MockServices(services, runtime)` 装配函数（`contract.ts` 的 `MockDomainRegistrar`）。
- 集中装配仍在 `packages/server/src/mock/index.ts`：它按固定顺序调用各域装配函数，不反向依赖领域内部实现。
- 领域模块不得读取或改写其它领域的私有字段。跨领域权威状态只有 `MockRuntime`（会话、任务、虚拟文件系统、git、设置、topic 水位）。
- `@zcode/services` 只作为契约输入：领域模块导入服务接口与 descriptor，不导入真实实现。

## 能力语义

各服务直接按已有 wire 契约返回能力值：已实现操作必须有可观察的内存状态转换，未实现操作明确拒绝。这里只按领域拆分代码，不建立能力矩阵实现层；UI 不增加 mock 分支。

工号只由浏览器标签页保存，不需要后端账号会话或凭据 RPC；Provider 目录只保留
`getView`、`refresh` 和 `onDidChange`，AIReq 模型设置仍由 AIReq owner 管理。
工号切换或退出不触发共享会话、项目或设置的删除、解绑或重置。
setting 仅保留 get/update；当前个性化提示词通过 AIReq prompts.read/save 访问，
不再保留旧 getUserInstructions/saveUserInstructions 及其模拟路径。

终端、Git 检查点、营销、Desktop Provider Provisioning、会话分享和商业订阅交易不属于当前产品，
不再注册兼容空壳。Provider 设置、模型目录与用量投影仍沿既有契约访问。Issue 与 AIReq 自动化页面、
专属业务 owner、manifest、task/workpool RPC 及接线已裁撤；这不等于裁撤本目录的通用 `automations`
领域、通用控件、原生会话设施或需求分析调度。通用服务继续按既有契约返回能力，不恢复 AIReq 自动化入口。

当前后端的 `MockRuntime` 与项目服务是共享业务事实源，不按浏览器工号、连接或 subscriptionId 分区。
工作区身份按服务器主机及绝对目录稳定派生，贯穿 prepare/resolve、任务和 v4 topic；
identity 不是旧远程 Host 的连接开关。目录选择只读服务器目录，虚拟文件与 Git fixture 不改为真实 IO。
项目只由一个 `MockProjectService` 实例维护；移除窗口项目注册、变化组、controller、Source Server
与受管 worktree，不复制内部项目、任务或会话事实。项目服务仅保留 prepareSession、
resolveSessionDirectories、readDirectory、readProjects、readTree；任务组仅保留原生 admit。
路径型 v4 请求仍沿用既有 wire topic 键，mock 只在内部统一业务身份与水位，再按订阅的原请求键投递，
避免旧请求和带身份请求变成两套会话，且不要求修改严格帧 schema 或逐连接 facade。

每条 `/ws` 仍有独立 `createZCodeAgentConnectionScope`：握手、conversation / sessions-index /
workspace-config 的订阅归属、帧过滤及断开清理均不得因共享业务数据而移除。取消 A 的订阅不影响 B。
原生命令按现有操作者／客户端、sessionId、commandId 去重并提供结果查询；AIReq 业务 owner 另行校验
配置／材料／候选版本、阶段和幂等。原型的结果只在进程内保留，不代表生产持久化或完整通用 CAS；
真实后端必须依已有 v4 契约实现，不得以原型限制取消这些当前正确性门禁。

## 装配顺序

```text
mock/index.ts
  ├─ MockRuntime（唯一权威状态）
  ├─ broadcast（跨窗口总线）
  ├─ domains/settings → domains/models → domains/plugins
  ├─ domains/assets → domains/sync → domains/projects → domains/automations
  ├─ domains/sharing → domains/compat-surfaces
  └─ zcodeAgent / zcodeTask / project / workspace（协议与文件、Git 面）
```

顺序只影响注册表写入，不表达依赖；任何领域都不应在装配期执行副作用（不写文件、不发网络请求、不启动定时器）。

当前领域注册面：setting、client-config、provider-settings、model-selection、usage-stats、
plugin-management、plugin-ui-bridge、plugin-ui-sampling、plugin-ui-app-tools、subagents、skills、mcp-sync、
task-groups、bots、prompt-attachment-transfer、gen-ui。
扩展、凭据、旧插件管理、命令/hook/记忆管理、同步迁移、反馈、语音、云媒体、高速卡与闲时任务
不再注册 mock 或保留专属 fixtures；隐藏的 AIReq Skill 设计操作和数据不在裁撤范围。
两处 AIReq 原生面板均为 embedded，旧草稿推荐不挂载；client-scenes 与 onboarding-record
及其独占推荐 fixtures 一并退役，不影响隐藏 Skill 会话或模型推荐。
skills/subagents 均仅保留原生目录 list；setEnabled、旧管理写面和目录定位接口不再暴露。
skills 的 buildPromptContext/copyToCommon/removeFromCommon/deleteSkill 与 subagents 的
createAgent/updateAgent/deleteAgent/setBuiltInModelOverride/setPluginAgentModelOverride/
getPrimaryUserAgentsDirectory 均无当前调用；隐藏 Skill 设计仍由 AIReq owner 持有。
/api/server-info 及重复配置 handler 退役；保留当前帮助配置 `/api/v1/client/configs`、
身份鉴权 `/ws`、静态资源压缩与 SPA 宿主，不新增替代 REST 接口。

## 新增领域

1. 先更新 `docs/architecture/mock-backend.md` 的支持矩阵与状态所有者。
2. 在 `domains/` 下新增领域文件，实现真实内存行为或明确拒绝，不留空壳实现。
3. 在 `mock/index.ts` 显式调用其装配函数。
4. 涉及协议帧/命令时，帧必须经 `@zcode/shared/zcode-protocol-v4` 的 zod schema 自校验，ACK 状态遵循 `docs/architecture/mock-backend.md` 的 ACK 规则。
