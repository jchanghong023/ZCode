## 核心原则

- 新增或修改行为前，先更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 仓库形态

本仓库是**纯 Web 应用**：浏览器前端 + 模拟后端服务。桌面 app 与真实 Agent 运行时已删除；`packages/server` 是按 ZCode Protocol v4 实现的**模拟后端**（内存态、确定性数据），通过与真实服务端完全相同的 WebSocket RPC 传输（`@zcode/rpc` ChannelServer）向 UI 提供全部服务。

产品仅面向**电脑浏览器**，不支持手机屏幕，不进行手机适配或屏幕测试。

产品前端与公开接口遵守 [发布边界](docs/specs/aireq-migration/release-surface.md)：前端代码、文案与协议接口必须达到正式上线标准，禁止原型／演示／mock／测试专用／debug 文案和代码，不得保留隐藏、不可达或环境开关控制的相关实现。原型后端的能力限制集中记录在部署／交付文档，不能靠清文案掩盖假成功或冒充真实能力。

## 项目目标与 UI 保真

本项目基于上游 ZCode 的浏览器端 UI 构建自有产品（以 AI 为中心的需求澄清与需求跟踪平台，方向演进中）。**不跟随上游更新**，上游代码停在最后一次上游同步提交 `fec97590`（≈ v3.18.2）。**除用户明确要求，禁止与其对比**：不得把源码 diff、浏览器截图对照作为改动、评审或验收的依据。完整背景、范围、验收方式与后端替换路径见 [项目目标与 UI 保真策略](docs/project-goal.md)。

- UI 保真：上游来源的**保留 UI**（视觉、交互、布局）以仓库当前实现为基准保持稳定，禁止借自有功能改动其风格与交互；已裁撤功能及其页面、入口不参与，裁撤范围见 [项目目标与 UI 保真策略](docs/project-goal.md)。允许删除或修改裁撤功能专属的上游 UI，以及接线类适配（导入、导航、数据源、平台能力）与渲染等价的重构。**除用户明确要求，禁止与上游快照 `fec97590` 对比**（含 `git diff` 上游快照、上游截图比对）；`git diff base... -- packages/ui` 差异核对同样只在用户明确要求时执行。
- 叠加式扩展：自有功能以新增模块接入，遵循架构治理登记（architecture:adopt / exceptions），复用 `packages/ui/src/components/ui` 控件库并遵守 `DESIGN.md`，视觉上与上游原生内容无异。
- 控件保留：**现有上游基础控件一律保留**——`packages/ui/src/components/ui` 全部内容、已有 `mobile-ui` 兼容控件，以及布局、弹层、图标、表单等通用控件；保留资产不代表支持手机屏幕。即使当前无引用也**不得删除**，`knip` / 未使用导出报告不构成删除理由。只允许删除与已裁撤功能强绑定的页面级组件，不确定是否通用时保留。
- 前端与协议按生产质量实现与验证；仅 `packages/server` 模拟后端允许原型实现（内存假数据），仍必须保持真实协议语义。切换生产服务只能替换后端及必要部署配置，前端源码、文案、构建产物、SDK、传输实现与接口契约一行都不改。
- 本轮根 `.todo.md` 按第 1→9 组执行，不以被覆盖的旧任务恢复场景按钮。全局项目／待办、默认全项目总览，项目内概览／需求／分析运行，设置外观／项目配置／AI 配置；Skill 入口继续隐藏，但全部保留实现属于整改范围，允许隔离临时装配进行必要真实浏览器验证，不恢复导航／设置／搜索入口。Sketch 画布与 PNG 附件、原生草稿／人工门禁／通用控件保留。

## 老代码对比基准

- 与老代码（重构前）对比时，统一使用 `base` 分支：它以 `3f2287ac`（"refactor: 重构为纯 Web 应用（浏览器前端 + 模拟后端）"，2026-11-14）为重构锚点，其后追加 oxfmt 格式化提交、文档提交与基线修复提交（当前代码 = `3f2287ac` + 基线修复，见 `git log`），已推送 `origin/base`。
- 基线尚未评审完毕，后续可能有基线修复提交：只修基线自身的缺陷与失真，不引入自有功能、不做重构；评审完成后才转为冻结。`main` 不合并上游后续提交，但合并基线修复。
- 该分支检出于工作树 `F:\code2026\zcode-baseline`；查老实现优先读该工作树文件或用 `git diff base... -- <路径>` / `git show base:<文件>`，不要在主工作树切换分支。

## 命令与仓库结构

开工以当前本地工作区为准，不执行远端新鲜度检查，不因落后远端阻止任务。除非用户明确要求同步远端，禁止自动执行 `git fetch`、`git pull`、`git merge` 或 `git rebase`；不得为通过门禁自行同步。全仓库 JavaScript/TypeScript 仅使用 Bun，版本以 `mise.toml` 为准；`node:*` / `@types/node` 是 Bun 兼容 API/类型，不要求 Node.js。包管理用 `bun x --bun --package pnpm@10.33.2 pnpm <命令>`，不调用依赖 Node/Corepack 的系统 pnpm shim。

以下命令从仓库根目录执行：

| 用途               | 命令                                                     |
| ------------------ | -------------------------------------------------------- |
| 开发（server+web） | `bun run dev`（mock server :3031 + vite :5174）          |
| 仅模拟后端         | `bun run dev:server`                                     |
| 仅前端             | `bun run dev:web`                                        |
| 构建               | `bun run build`（server 产物可托管 web dist 单进程部署） |
| 类型检查           | `bun run typecheck`                                      |
| Lint               | `bun run lint` / `bun run lint:fix`                      |
| 格式检查           | `bun run fmt:check`                                      |
| 架构检查           | `bun run architecture:check --changed`                   |
| 模块阅读包         | `bun run architecture:context <module-id>`               |
| 未使用依赖与导出   | `bun run knip`                                           |
| 导出引用查询       | `bun run dep:refs --list-exports <file>`                 |

工程 Vitest 使用 `bun run test:engineering <文件>`；工程门禁测试使用 `bun run test:architecture`（Bun 执行 `node:test` 兼容 API）。范围见 [测试规格](docs/testing/unit-test-quality.md)。不保留 pre-push 钩子或聚合检查脚本，不要求推送前手动执行聚合检查；必要验证按任务及独立检查命令执行。旧机制仅作为 [历史记录](docs/testing/pre-push-hook.md) 保留。

- `packages/web`：浏览器前端入口（Vite）。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/server`：模拟 Web 后端（Bun + Hono + WebSocket RPC + mock 服务集合）。
- `packages/rpc`：VS Code 风格 IPC/RPC 框架（传输层为生产实现）。
- `packages/client`：浏览器连接 SDK（WebSocket → IServiceAccessor）。
- `packages/services`：服务接口与 descriptor（浏览器安全契约层；实现全部在 mock server）。
- `packages/shared`：共享协议与类型（含 `zcode-protocol-v4` 会话协议）。
- `packages/provider`、`packages/model-option-map`、`packages/session-control`：模型选择/选项编译/会话控制契约。
- `packages/design-runtime`：浏览器设计调试运行时。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。

## 前端与接口上线标准

- 产品前端运行时代码及发布产物不得包含原型场景、测试夹具、调试面板、故障注入、模拟数据、固定回复、占位成功或按后端类型分支的逻辑；公开 HTTP／RPC、descriptor、DTO 与 schema 不得包含对应的服务、字段、参数或控制命令。禁止用改名、隐藏入口、开发模式或空实现规避。
- 模拟数据与模拟执行只允许在 `packages/server` 内部实现，不得泄漏到前端或公开契约；前端只发送业务意图并渲染服务端事实。真实需求的“测试验收”等业务用语、生产诊断日志和独立工程测试不属于测试专用代码禁令，验证夹具不得进入产品运行时依赖图。
- 后端替换沿用同一份前端构建产物、同一套公开接口与协议：包括同源 HTTP／资源、WebSocket 二进制 Channel RPC、服务契约及 Protocol v4。后端差异由后端实现解决，不允许修改前端、增加适配层、扩展契约或重打后端专用前端包。
- 新增行为必须先定义正式业务契约，再实现前端与模拟后端；不得先引入原型／测试／debug 接口，留待上线清理。上线验收须检查发布边界，并在明确实施生产服务替换时验证前端产物与契约完全不变；规则更新不等于现存实现已达标。

## 模拟后端约定

- mock 服务按 `packages/services` 的接口与 descriptor 注册进 `ServiceCollection`；新增 UI 消费的服务方法必须在 `packages/server/src/mock/` 提供同形状实现（可用 `Parameters/ReturnType` 从接口派生签名）。
- v4 会话流必须用 `@zcode/shared/zcode-protocol-v4` 的 zod schema 产帧并在发射前自校验；`subscriptionId`/`seq`/`logEpoch` 记账不可伪造。
- 模拟业务数据与执行只在后端内存 owner 中，不调用真实 AI、Git、数据库或宿主业务文件写入；内存真实完成的操作可以成功，未实现能力明确不可用／不存在。保留的底层 `projectService.readDirectory` 仅只读本机目录名／类型，不读写业务正文，也不构成 AIReq 目录入口；`systemService.info` 返回安全投影，不泄漏真实 home。环境与上线限制只写部署／交付说明，不放登录、帮助、提示词、用户材料或公开 provenance。
- 改 UI 行为必须让模拟后端符合正式业务契约，不得给 UI 加 mock 分支或为模拟实现放宽公开协议。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- UI 行为改动先更新 spec，确定浏览器验收或可重复运行时场景；交互改动先维护验收场景再改实现。实际执行必要验证，未执行或环境受限时如实说明。
- 本轮允许必要电脑浏览器、协议、错误与多连接广播验证，隐藏 Skill 亦在范围内；不得新建 E2E harness、恢复 App 业务单测或增加产品调试接口／window 夹具。每项直接证据与文档齐全才勾选，本轮记录写现有发布边界，历史证据不冒充当前通过。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- PR 描述须说明背景、设计意图与修改前后行为；包含 bugfix 时逐项说明触发场景、根因证据、修复机制及回归验证。未确认的根因或引入提交如实标注，不根据模块或时间接近推断归因。
- 涉及状态、时序或异步同步的方案，用图展示所有者及事件顺序。
- 代码变更组收口一次 `bun run typecheck`、`bun run lint` 与 `bun run architecture:check --changed`，报告真实结果及既有失败；本轮纯规则第 1 组不额外跑类型／Lint。按根 `.todo.md` 的现行工程测试清单和实际影响选择验证；最终构建及同次产物集成只在第 9 组执行，不能代替前组首次行为验证。
- 修改 React 组件或 hooks 后，必须运行 `bun run lint`（Oxlint），检查 `react/exhaustive-deps` 和 `react/rules-of-hooks`。复核本次改动新增及相关的缺失、多余、不稳定依赖与调用位置诊断，不能因仅告警或退出码为 0 就忽略，也不机械补齐整个对象依赖或禁用规则。被根配置忽略的文件须按 [React Hooks 检查](docs/testing/react-hooks-lint.md) 补做专项扫描；渲染问题仍须运行时验证。
- 跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用传输层具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾电脑浏览器的布局、交互、主题和国际化；不做手机屏幕适配或测试。
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
