## 基本规则

- 行为修改前先更新对应现行 spec，明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前源码、`package.json` 与 `architecture-policy.yaml` 为准。文档只描述当前系统，直接改写相关规则；不追加历史补丁、计划流水或相互覆盖的版本，不保留失效命令和文件引用。
- 未明确授权修改时先只读调查，区分源码事实、运行证据与假设。保留无关本地改动，不恢复不在当前产品内的模块。
- 不自动执行远端新鲜度检查或 `git fetch/pull/merge/rebase`。只有用户明确要求才同步远端。

## 当前系统

AIReq 仅支持电脑浏览器；UI 验证使用桌面尺寸。按任务从[文档索引](docs/README.md)选读对应规格。产品入口及支持范围见[系统范围](docs/README.md#系统范围)。

## 产品与接口边界

- 前端与公开接口遵守 [发布边界](docs/specs/aireq/contract-design.md#发布边界)。不得引入原型场景、测试夹具、调试面板、故障注入、固定回复、占位成功或按后端类型分支的运行时代码。
- 模拟数据与执行只允许在服务端内部；前端发送业务意图并显示服务端事实。生产诊断与“测试验收”业务不属于测试专用代码。
- 后端替换只更换服务端实现及必要部署配置，不改前端源码／文案／产物、SDK、传输、descriptor、DTO 或 schema，不加适配层或后端专用前端包。
- 保留已有通用控件与图标、`components/ui` 全部内容和已有 `mobile-ui`，即使未引用也不得仅据未使用报告删除。兼容资产不等于手机支持。
- 不恢复当前范围外的产品入口。未经明确要求，不与上游快照或 `base` 做源码／截图对比；不在主工作树切换到旧实现分支。

## 工具链与命令

JavaScript／TypeScript 只用 `mise.toml` 固定的 Bun。`node:*` 与 `@types/node` 是兼容 API／类型，不要求 Node.js。依赖管理使用 `bun x --bun --package pnpm@10.33.2 pnpm <命令>`，不调用系统 pnpm／Corepack shim，不以 `bun install` 替代。

启动与构建见[快速开始](README.md)，依赖诊断和清理见[依赖与清理](README.md#依赖与清理)。自动化测试分为前端 UT 和后端 ST，见[测试说明](docs/testing/unit-test-quality.md)。

## 模块与接入

- 跨包使用公开入口。调整模块依赖、公开契约或状态归属时，按需查阅 [AIReq 架构审查](.agents/skills/architecture-governance/SKILL.md)。
- 修改 UI 前读 `DESIGN.md`；领域词汇见 `CONTEXT.md`。组件通过 hooks 访问服务，平台操作使用 `IPlatformService`，不直接调用 `window.zcode`。

## 状态与协议

- 业务事实归 `MockAIReqService/workflow`；原生会话行、附件、队列、订阅和水位归 `MockRuntime/MockZCodeAgentService`。避免重复 owner、多条写路径或用超时掩盖同步问题。
- 服务通过现行 interface／descriptor 注册；UI 新消费方法必须提供同形状服务端实现，不能给 UI 加 mock 分支。
- v4 帧复用 `packages/shared/src/zcode-protocol-v4` 的严格 zod schema，发射前校验，`subscriptionId`／`seq`／`logEpoch` 不可伪造。协议变更同批更新契约、生产消费者与模拟实现。
- 身份 key 为 `workspaceIdentity?.trim() || workspacePath`；身份隔离与展示路径不可混用。
- 写操作校验并提交后再通知；重连只恢复订阅及重读，不自动重放写操作。明确事件顺序、版本、幂等和迟到结果边界。
- 模拟 Agent 的执行保留在内存中。原型保存项目代码源配置并发布共享文档，实际代码准备由正式后端实现。未支持能力明确失败，不能空成功。底层目录读取仅只读名称／类型，不构成业务目录入口；系统信息返回安全投影。

## 验证与交付

- 按实际影响选择最小充分验证。UI 行为必须在真实电脑浏览器验证；未执行或受环境限制时如实说明，不用静态检查代替运行证据。
- 正式后端的测试与验收凡需调用模型，一律使用隔离的 OMP 配置连接本地 VidaiMock；不使用真实模型或凭据，模拟服务不可用时报告阻塞，不回退真实端点。接入说明见[不调用真实模型的正式后端联调](docs/testing/unit-test-quality.md#不调用真实模型的正式后端联调)。
- 代码变更收口一次 `bun run typecheck`、`bun run lint`、`bun run architecture:check --changed`；文档修改只核验相关事实、命令、链接与格式。已有结果仍适用时不重复检查。
- React 组件／hooks 改动必须复核 Hooks Lint，包括缺失、多余和不稳定依赖及调用位置；忽略文件按 [Hooks 检查说明](docs/testing/unit-test-quality.md#react-hooks-检查) 专项检查，不禁用规则或机械补整个对象依赖。
- 不新增占位测试、永久验收 harness、产品调试接口或 window 夹具。测试编写须基于明确需求与消费者可观察行为；没有测试不等于通过。
- 修复 bug 用中文注释说明原因和依据；设计缺陷先对齐，不堆叠兜底。状态／时序方案用图表达 owner 和事件顺序。
- PR／交付说明包含真实背景、行为变化、根因证据与实际验证，不根据模块或时间接近推断归因，不把文档规则当已完成证据。
- Zustand 广播字段防回环，局部草稿不冒充服务端事实；含 JSX 的 hooks 使用 `.tsx`。

## 日志

UI 使用 `packages/ui/src/logger.ts`，服务使用 `createServiceLogger(scope)`，不直接 `console.log`。高频协议／chunk 用 debug，生命周期用 info，可恢复异常用 warn，不可恢复错误用 error。日志、示例和提交不包含凭据、真实用户数据或内部服务地址。
