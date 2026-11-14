## 核心原则

- 新增或修改行为前，先更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 仓库形态

本仓库是**纯 Web 应用**：浏览器前端 + 模拟后端服务。桌面 app 与真实 Agent 运行时已删除；`packages/server` 是按 ZCode Protocol v4 实现的**模拟后端**（内存态、确定性数据），通过与真实服务端完全相同的 WebSocket RPC 传输（`@zcode/rpc` ChannelServer）向 UI 提供全部服务。

## 项目目标与 UI 保真

本项目基于上游 ZCode 的浏览器端 UI 构建自有产品（以 AI 为中心的需求澄清与需求跟踪平台，方向演进中）。**不跟随上游更新**，上游代码以 `base` 分支为基线锚点（≈ v3.18.2），仅作参考。完整背景、范围、验收方式与后端替换路径见 [项目目标与 UI 保真策略](docs/project-goal.md)。

- UI 保真：上游来源的 UI 效果（视觉、交互、布局）以 `base` 为唯一基准，禁止为自有功能修改；对上游 UI 文件的改动仅限接线类（导入、导航、数据源适配）。涉及 UI 改动的验收须与 `base` 对照（`git diff base... -- packages/ui`）并做浏览器截图比对。
- 叠加式扩展：自有功能以新增模块接入，遵循架构治理登记（architecture:adopt / exceptions），复用 `packages/ui/src/components/ui` 控件库并遵守 `DESIGN.md`，视觉上与上游原生内容无异。
- 控件保留：**桌面浏览器与手机浏览器依赖的上游基础控件一律保留**——`packages/ui/src/components/ui` 全部内容、`mobile-ui` 等移动端/响应式控件集，以及布局、弹层、图标、表单等通用控件；即使当前无引用也**不得删除**，`knip` / 未使用导出报告不构成删除理由。只允许删除与已裁撤功能强绑定的页面级组件，不确定是否通用时保留。
- 前端与协议按生产质量实现与验证；`packages/server` 模拟后端为原型（内存假数据），只要求协议语义保真，不要求生产级实现；后续由自有后端实现同一套 `packages/services` 契约完成替换。

## 老代码对比基准

- 与老代码（重构前）对比时，统一使用 `base` 分支：它停在 `3f2287ac`（"refactor: 重构为纯 Web 应用（浏览器前端 + 模拟后端）"，2026-11-14）之上，仅追加纯 oxfmt 格式化提交与文档提交（代码内容与 `3f2287ac` 一致，只有空白差异），已推送 `origin/base`。
- 基线尚未评审完毕，后续可能有基线修复提交：只修基线自身的缺陷与失真，不引入自有功能、不做重构；评审完成后才转为冻结。`main` 不合并上游后续提交，但合并基线修复。
- 该分支检出于工作树 `F:\code2026\zcode-baseline`；查老实现优先读该工作树文件或用 `git diff base... -- <路径>` / `git show base:<文件>`，不要在主工作树切换分支。

## 命令与仓库结构

开工前运行 `node scripts/check-workspace-freshness.mjs` 检查基线。Node 版本以 `mise.toml` 为准。

以下命令从仓库根目录执行：

| 用途               | 命令                                                             |
| ------------------ | ---------------------------------------------------------------- |
| 开发（server+web） | `pnpm dev`（mock server :3030 + vite :5173）                     |
| 仅模拟后端         | `pnpm dev:server`                                                |
| 仅前端             | `pnpm dev:web`                                                   |
| 构建               | `pnpm build`（server 产物可托管 web dist 单进程部署）            |
| 类型检查           | `pnpm typecheck`                                                 |
| Lint               | `pnpm lint` / `pnpm lint:fix`                                    |
| 格式检查           | `pnpm fmt:check`                                                 |
| 推送前检查         | `pnpm verify:pre-push`（工作区、Lint、架构检查与受影响工程测试） |
| 架构检查           | `pnpm architecture:check --changed`                              |
| 模块阅读包         | `pnpm architecture:context <module-id>`                          |
| 未使用依赖与导出   | `pnpm knip`                                                      |
| 导出引用查询       | `pnpm dep:refs --list-exports <file>`                            |

工程 Vitest 使用 `pnpm test:engineering <文件>`；工程门禁测试使用 `pnpm test:architecture`（node:test）。范围见 [测试规格](docs/testing/unit-test-quality.md)。`.husky/pre-push` 钩子已移除，推送检查需手动运行 `pnpm verify:pre-push`；移除前的钩子机制见 [pre-push 说明](docs/testing/pre-push-hook.md)。

- `packages/web`：浏览器前端入口（Vite）。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/server`：模拟 Web 后端（Hono + WebSocket RPC + mock 服务集合）。
- `packages/rpc`：VS Code 风格 IPC/RPC 框架（传输层为生产实现）。
- `packages/client`：浏览器连接 SDK（WebSocket → IServiceAccessor）。
- `packages/services`：服务接口与 descriptor（浏览器安全契约层；实现全部在 mock server）。
- `packages/shared`：共享协议与类型（含 `zcode-protocol-v4` 会话协议）。
- `packages/provider`、`packages/model-option-map`、`packages/session-control`：模型选择/选项编译/会话控制契约。
- `packages/design-runtime`：浏览器设计调试运行时。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。

## 模拟后端约定

- mock 服务按 `packages/services` 的接口与 descriptor 注册进 `ServiceCollection`；新增 UI 消费的服务方法必须在 `packages/server/src/mock/` 提供同形状实现（可用 `Parameters/ReturnType` 从接口派生签名）。
- v4 会话流必须用 `@zcode/shared/zcode-protocol-v4` 的 zod schema 产帧并在发射前自校验；`subscriptionId`/`seq`/`logEpoch` 记账不可伪造。
- 模拟数据全部在内存中（虚拟工作区、虚拟 git 状态），不访问真实文件系统、不发起真实网络请求。
- 改 UI 行为时优先让模拟后端贴合真实协议语义，而不是给 UI 加 mock 分支。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- UI 行为改动先更新 spec，确定浏览器验收或可重复运行时场景；交互改动先维护验收场景再改实现。实际执行必要验证，未执行或环境受限时如实说明。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- PR 描述须说明背景、设计意图与修改前后行为；包含 bugfix 时逐项说明触发场景、根因证据、修复机制及回归验证。未确认的根因或引入提交如实标注，不根据模块或时间接近推断归因。
- 涉及状态、时序或异步同步的方案，用图展示所有者及事件顺序。
- 必须执行 `pnpm typecheck` 和 `pnpm lint`，报告真实结果，不将已有失败写成通过。
- 修改 React 组件或 hooks 后，必须运行 `pnpm lint`（Oxlint），检查 `react/exhaustive-deps` 和 `react/rules-of-hooks`。复核本次改动新增及相关的缺失、多余、不稳定依赖与调用位置诊断，不能因仅告警或退出码为 0 就忽略，也不机械补齐整个对象依赖或禁用规则。被根配置忽略的文件须按 [React Hooks 检查](docs/testing/react-hooks-lint.md) 补做专项扫描；渲染问题仍须运行时验证。
- 跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用传输层具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾桌面与移动浏览器的布局、交互、主题和国际化。
- 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），浏览器实现见 `packages/web/src/platform/`，不直接调用 `window.zcode`。
- Zustand 状态位于 `packages/ui/src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 协议

- 浏览器与模拟后端之间是 `/ws` 上的二进制帧协议（`packages/rpc` SocketProtocol），其上是 Channel RPC；会话面为 ZCode Protocol v4（`packages/shared/src/zcode-protocol-v4/`）。
- 协议改动同步更新 `packages/shared/src/zcode-protocol-v4/`，提供严格 zod 校验，mock server 与 UI 同批更新。

## Workspace Identity

- `workspaceIdentity` 用于身份隔离，`workspacePath` 用于路径展示与虚拟工作区键。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`。

## 日志

- UI 使用 `packages/ui/src/logger.ts`，不直接使用 `console.log`。
- 服务日志使用 `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`）。
- `debug` 用于协议原始数据与流式 chunk 等高频诊断；`info` 用于生命周期事件；`warn` 用于可恢复异常；`error` 用于不可恢复错误。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
