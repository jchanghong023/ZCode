# Mock 领域模块

`packages/server/src/mock/domains` 是模拟后端的领域装配层：把原来按「簇」堆在一个大文件里的 mock 服务，按实际领域拆成插件、设置、模型、项目、自动化、分享、同步、扩展、工作区资产、兼容面十个目录级模块（每个 `.ts` 一个领域）。

## 边界

- 每个领域文件只导出本域服务类与一个 `register<Domain>MockServices(services, runtime)` 装配函数（`contract.ts` 的 `MockDomainRegistrar`）。
- 集中装配仍在 `packages/server/src/mock/index.ts`：它按固定顺序调用各域装配函数，不反向依赖领域内部实现。
- 领域模块不得读取或改写其它领域的私有字段。跨领域权威状态只有 `MockRuntime`（会话、任务、虚拟文件系统、git、设置、topic 水位）。
- `@zcode/services` 只作为契约输入：领域模块导入服务接口与 descriptor，不导入真实实现。

## 能力语义

各服务直接按已有 wire 契约返回能力值：已实现操作必须有可观察的内存状态转换，未实现操作明确拒绝。这里只按领域拆分代码，不建立能力矩阵实现层；UI 不增加 mock 分支。

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
