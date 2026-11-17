## 基本规则

- 行为修改前先更新对应现行 spec，明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前源码、`package.json` 与 `architecture-policy.yaml` 为准。文档只描述当前系统，直接改写相关规则；不追加历史补丁、计划流水或相互覆盖的版本，不保留失效命令和文件引用。
- 未明确授权修改时先只读调查，区分源码事实、运行证据与假设。保留无关本地改动，不恢复不在当前产品内的模块。
- 不自动执行远端新鲜度检查或 `git fetch/pull/merge/rebase`。只有用户明确要求才同步远端。

## 当前系统

纯 Web 电脑浏览器应用：`packages/web`／`packages/ui` 前端，通过同源 `/ws` 二进制 SocketProtocol＋Channel RPC 访问 `packages/server` 内存模拟后端；业务会话使用 ZCode Protocol v4。

全局页面为项目总览、想法池；当前项目／具体 Release 页面为当前项目、需求共创、开发任务、进度分析、我的待办。侧栏统一持有项目与 Release 选择。设置为外观、项目配置、AI 配置；报告、材料、历史和分析报告使用统一右侧工作区。Skill 设计无公开导航入口但实现保留；Sketch 画布与 PNG 附件保留。

只支持电脑浏览器，不做手机适配或屏幕测试。当前范围见 [系统说明](docs/project-goal.md)，规范入口见 [文档索引](docs/README.md)。

## 产品与接口边界

- 前端与公开接口遵守 [发布边界](docs/specs/aireq-migration/release-surface.md)。不得引入原型场景、测试夹具、调试面板、故障注入、固定回复、占位成功或按后端类型分支的运行时代码。
- 模拟数据与执行只允许在服务端内部；前端发送业务意图并显示服务端事实。生产诊断与“测试验收”业务不属于测试专用代码。
- 后端替换只更换服务端实现及必要部署配置，不改前端源码／文案／产物、SDK、传输、descriptor、DTO 或 schema，不加适配层或后端专用前端包。
- 保留已有通用控件与图标、`components/ui` 全部内容和已有 `mobile-ui`，即使未引用也不得仅据未使用报告删除。兼容资产不等于手机支持。
- 不恢复当前范围外的产品入口。未经明确要求，不与上游快照或 `base` 做源码／截图对比；不在主工作树切换到旧实现分支。

## 工具链与命令

JavaScript／TypeScript 只用 `mise.toml` 固定的 Bun。`node:*` 与 `@types/node` 是兼容 API／类型，不要求 Node.js。依赖管理使用 `bun x --bun --package pnpm@10.33.2 pnpm <命令>`，不调用系统 pnpm／Corepack shim，不以 `bun install` 替代。

| 用途                 | 根目录命令                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| 初始化               | `bun run bootstrap`                                                                 |
| 开发                 | `bun run dev`，server `3031`／web `5174`                                            |
| 分开启动             | `bun run dev:server` / `bun run dev:web`                                            |
| 构建                 | `bun run build`                                                                     |
| 类型检查             | `bun run typecheck`                                                                 |
| Lint／格式           | `bun run lint` / `bun run fmt:check`                                                |
| 架构检查／受控上下文 | `bun run architecture:check --changed` / `bun run architecture:context <module-id>` |
| 依赖诊断／导出查询   | `bun run knip` / `bun run dep:refs --list-exports <file>`                           |
| 清理产物／依赖       | `bun run clean` / `bun run clean:deps`                                              |

前端公共函数 UT 位于 `test/ut/`，运行 `bun run test:ut` 和 `bun run test:ut:typecheck`；ST 位于 `test/st/`，显式运行 `bun run test:st` 和 `bun run test:st:typecheck`，连接已有真实服务；现有 engineering 项目按精确清单登记，见[测试现状](docs/testing/unit-test-quality.md)。不保留 pre-push 钩子或聚合脚本，不要求推送前手动执行聚合检查。

## 模块与接入

- `web`：浏览器入口和平台实现；`ui`：React、hooks、Zustand 及 AIReq 界面。
- `server`：Hono HTTP、WebSocket 与内存服务；`client`／`rpc`：连接、服务访问及二进制传输。
- `services`／`shared`：浏览器安全服务契约与共享协议；`provider`／`model-option-map`／`session-control`：模型选项及会话控制契约。
- `design-runtime`：浏览器设计运行时模块；模块存在不自动构成产品入口。
- 代码改动遵循 `.agents/skills/architecture-governance/SKILL.md`。先检查架构基线，按影响读取模块受控上下文；跨包只用公开入口，不跨域导入实现、不产生循环依赖。
- 修改 UI 前读 `DESIGN.md`；领域词汇见 `CONTEXT.md`。组件通过 hooks 访问服务，平台操作使用 `IPlatformService`，不直接调用 `window.zcode`。

## 状态与协议

- 业务事实归 `MockAIReqService/workflow`；原生会话行、附件、队列、订阅和水位归 `MockRuntime/MockZCodeAgentService`。避免重复 owner、多条写路径或用超时掩盖同步问题。
- 服务通过现行 interface／descriptor 注册；UI 新消费方法必须提供同形状服务端实现，不能给 UI 加 mock 分支。
- v4 帧复用 `packages/shared/src/zcode-protocol-v4` 的严格 zod schema，发射前校验，`subscriptionId`／`seq`／`logEpoch` 不可伪造。协议变更同批更新契约、生产消费者与模拟实现。
- 身份 key 为 `workspaceIdentity?.trim() || workspacePath`；身份隔离与展示路径不可混用。
- 写操作校验并提交后再通知；重连只恢复订阅及重读，不自动重放写操作。明确事件顺序、版本、幂等和迟到结果边界。
- 模拟后端不执行真实 AI、Git、数据库或宿主业务文件写入；未支持能力明确失败，不能空成功。底层目录读取仅只读名称／类型，不构成业务目录入口；系统信息返回安全投影。

## 验证与交付

- 按实际影响选择最小充分验证。UI 行为必须在真实电脑浏览器验证；未执行或受环境限制时如实说明，不用静态检查代替运行证据。
- 代码变更收口一次 `bun run typecheck`、`bun run lint`、`bun run architecture:check --changed`；文档修改只核验相关事实、命令、链接与格式。已有结果仍适用时不重复检查。
- React 组件／hooks 改动必须复核 Hooks Lint，包括缺失、多余和不稳定依赖及调用位置；忽略文件按 [Hooks 检查说明](docs/testing/react-hooks-lint.md) 专项检查，不禁用规则或机械补整个对象依赖。
- 不新增占位测试、永久验收 harness、产品调试接口或 window 夹具。测试编写须基于明确需求与消费者可观察行为；没有测试不等于通过。
- 修复 bug 用中文注释说明原因和依据；设计缺陷先对齐，不堆叠兜底。状态／时序方案用图表达 owner 和事件顺序。
- PR／交付说明包含真实背景、行为变化、根因证据与实际验证，不根据模块或时间接近推断归因，不把文档规则当已完成证据。
- Zustand 广播字段防回环，局部草稿不冒充服务端事实；含 JSX 的 hooks 使用 `.tsx`。

## 日志

UI 使用 `packages/ui/src/logger.ts`，服务使用 `createServiceLogger(scope)`，不直接 `console.log`。高频协议／chunk 用 debug，生命周期用 info，可恢复异常用 warn，不可恢复错误用 error。日志、示例和提交不包含凭据、真实用户数据或内部服务地址。
