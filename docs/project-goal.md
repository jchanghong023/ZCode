# 项目目标与 UI 保真策略

本仓库源自上游 ZCode（开源 Agent 产品），当前产品目标已明确为 **AIReq：以 AI 为中心的需求和 ISSUE 管理平台**。仅迁入 `oh-my-pi/packages/aireq-frontend` 当前实际可达的业务功能与操作语义，以当前 ZCode 基座提供登录、需求管理、工具及设置入口；不保留并行旧普通聊天产品，也不恢复停用的编码执行流水线。

AIReq 不是架构、UI 或几何基准。架构、服务接入、布局、控件、配色、字体和全部显示效果均以**当前检出的 ZCode**及 `DESIGN.md` 为准；不复刻 AIReq 的坐标、间距或默认分栏比例，不复制旧前端工程／通用组件／主题，不拉取上游或与上游快照、`base` 做对照。本次迁移规格位于 [docs/specs/aireq-migration/](specs/aireq-migration/integration.md)，规格先于行为实现。

## 范围与形态

只保留浏览器端。当前产品包含需求提案澄清、四路评审、方案／依赖与工期预估、模拟 MR 入库、正式需求人员排期与进度、需求分析、Issue 新建／分析／进度、独立 Skill 设计、自动化和 AIReq 设置。桌面 app、真实 Agent／模型运行时、OMP CLI/TUI、Host/relay、内嵌浏览器、Computer Use、终端、远程主机、商业化／计费／营销、旧产品账号入口、普通任务／自由聊天列表、文件树、Git 审查、通用白板、Office/PDF/PPTX 预览等不作为可见产品入口。提案／Skill 的业务对话复用当前会话能力；输入框 Sketch 只回填 PNG，不等于恢复通用白板。已裁撤页面及原产品结构不再受旧 UI 保真条款保护；通用组件资产仍必须保留。

**产品仅面向电脑浏览器。** 手机及其他移动屏幕不在支持范围内，不进行相应的布局适配、交互优化或屏幕测试。已有移动端样式和通用控件仅作为存量资产保留，不构成手机支持承诺。

当前交付形态仍为浏览器前端＋服务端内存模拟后端；本次迁移尚须依 `todo.md` 逐项实施与实际验收。AIReq 普通业务通过 `packages/services/src/aireq` 的浏览器安全类型／descriptor，经同源 `/ws` 二进制 Channel RPC 接入；真正业务对话继续使用当前 Protocol v4 帧与渲染链，普通领域方法不冒充会话帧。模拟后端唯一持有共享业务、样例回复、报告、分支／MR 与模拟 Skill 保存结果；无真实模型、Git/MR 平台、业务数据库、认证、员工目录、音频采集或真实文件写入。AIReq 项目只配置名称、远程仓库和默认分支，Release 继承仓库，不要求用户选择服务器目录或个人开发目录；原目录浏览能力不构成本次产品入口。

## 当前 Web 拓扑与运行入口

仓库里只有一个可运行拓扑：浏览器前端直连内存模拟后端，不存在桌面 shell、Agent CLI、Host/relay 或远程主机进程。

唯一登录入口为本地自报工号：一个小写 a–z 字母加八位数字，保留前导零，无密码且不验证本人；浏览器标签页持有当前标识。普通业务 RPC 每次显式携带不可变身份；原生 v4 服务通过逐连接固定身份 facade 保持请求隔离，禁止全局可变操作者。工号不是可信认证、服务路由或多租户隔离键；固定 Web 所有者／访客规则只保留原型配置修改边界，不扩为真实 RBAC。

所有工号共享同一 mock 进程内的项目、Release、IR／SR、Issue、材料和报告；未发送草稿按用户／客户端／项目／Release 或会话隔离，浏览选择、连接和外观保留各自作用域。切工号不切后台账号、凭据、模拟配置归属或共享数据。刷新／关闭／断线不重置已接纳业务或服务任务，重连只重读、不自动重发；mock 进程重启才恢复初始样例。模拟 workspace 标识只是现有会话接线所需的内部资源身份，不是让用户配置真实目录或创建另一条 Host 连接。

```text
浏览器
  packages/web（Vite 入口 main.tsx、浏览器平台实现 src/platform）
  packages/ui（React 组件、Zustand store、V4 会话界面 src/v4）
        |
        | /ws WebSocket（开发期由 Vite 代理到模拟后端）
        v
  packages/client（浏览器连接 SDK：connectViaWebSocket）
        |
        v
  packages/rpc（SocketProtocol 二进制帧 + Channel RPC，ChannelServer 在服务端）
        |
        | 服务接口 / descriptor：packages/services
        | 会话 wire 契约：packages/shared/src/zcode-protocol-v4
        v
  packages/server（Hono HTTP + WebSocket；src/mock/index.ts 集中装配 mock 服务）
        └─ MockRuntime：内存权威状态 + MockTopicLog（logEpoch/seq 水位）
```

| 入口           | 命令 / 文件                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| 同时启动前后端 | `pnpm dev`（模拟后端 :3030，Vite 前端 :5173，`/api`、`/ws` 代理到 :3030）                           |
| 仅模拟后端     | `pnpm dev:server` → `packages/server/src/entry-http.ts`（`PORT` 可覆盖）                            |
| 仅前端         | `pnpm dev:web` → `packages/web/src/main.tsx`                                                        |
| 构建           | `pnpm build`（`build:server` + `build:web`；`ZCODE_WEB_STATIC_ROOT=<web dist>` 单进程托管静态资源） |
| 初始化         | `pnpm bootstrap`（工具链校验、patch 依赖刷新、install、build）                                      |
| 浏览器验收     | 打开 <http://localhost:5173>，在真实浏览器中按页面实际操作验证                                      |

协议与装配的事实来源是代码与 [模拟后端规范](architecture/mock-backend.md)、[Web 构建与清理工作流](architecture/web-build-workflow.md)；本文只固定形态与边界。

## 四条约束

| 约束       | 内容                                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI 保真    | **当前检出的 ZCode 架构、布局、基础组件与视觉**是唯一设计依据；所有新 AIReq 页面、弹窗、材料和输入框采用当前 token、`text-ui-*`、图标及交互状态。AIReq 仅提供功能，不将其页面几何或旧视觉当作验收约束；不恢复原普通聊天产品。禁止与上游快照或 `base` 做源码／截图对照；仅本次用户另行要求时例外。             |
| 模块化接入 | AIReq 领域类型／纯派生放 `packages/services/src/aireq`，浏览器安全公开入口为 `@zcode/services/aireq`；UI 放新增 `packages/ui/src/aireq`；server 实现在单进程内存 owner 下接入集中装配。先登记 managed 模块、合同及依赖边；只做必要主壳接线，不整体搬源 Root/App，不恢复旧产品入口，不留下兼容别名或双轨实现。 |
| 控件保留   | **现有上游基础控件一律保留**：`packages/ui/src/components/ui` 全部内容、已有 `mobile-ui` 兼容控件，以及布局、弹层、图标、表单等通用控件；保留资产不代表支持手机屏幕。即使当前无引用也**不得删除**，`knip` / 未使用导出报告不构成删除理由。只允许删除与已裁撤功能强绑定的页面级组件，不确定是否通用时保留。    |
| 契约优先   | 前端与协议按生产质量实现与验证；模拟后端为原型，只要求协议语义保真，不要求生产级实现。                                                                                                                                                                                                                        |

## 基线与验收

- **不跟随上游更新**：上游代码停在最后一次上游同步提交 `fec97590`（≈ 上游 v3.18.2）；不合并上游后续提交。**除用户明确要求，禁止以该快照作为改动、评审或验收的比对基准**。
- `base` 基线尚未评审完毕，允许在其上提交基线修复（只修基线自身缺陷与失真，不引入自有功能、不做重构），评审完成后转为冻结；`main` 合并基线修复。
- `base` 检出于工作树 `F:\code2026\zcode-baseline`（详见 AGENTS.md「老代码对比基准」），基线修复在该工作树提交，不要在主工作树切换分支。
- 涉及 UI 的改动，验收须满足：
  1. 新业务以新增 AIReq 模块接入，使用当前组件；只清理本次确实淘汰的专属入口、调用和死分支，不删除通用底层资产或无关本地修改。
  2. 不执行上游快照／`base` 对照，当前主题和本次规格就是视觉验收依据。
  3. 仅在真实电脑浏览器验证浅色／深色／系统主题、普通／较窄窗口、父面板排版、拖拽、滚动、键盘／焦点、复制反馈和草稿保留；业务布局变化及旧入口消失是预期，不执行手机屏幕验收。
  4. 按用户要求，全部代码和文档完成前不运行任何验证；完成后集中复用已有检查、测试及必要浏览器场景，不新增测试文件或用例。

## 后端替换路径

替换边界同时包含同源 HTTP 启动元信息、静态站点和浏览器可访问的资源 URL，以及
`packages/services` 的服务接口 / descriptor、`packages/rpc` 的二进制 Channel 传输与
`packages/shared` 的 Protocol v4 契约；不能只实现 TypeScript 接口或只替换 WebSocket。
完整对接要求见 [模拟后端规范 §8](architecture/mock-backend.md#8-真实后端替换契约)。
真实后端实现这一整套契约后，替换 `packages/server`，不得再以 UI 特判适配后端差异。

```text
现在:  AIReq UI ── 同源 WS Channel RPC（会话用 Protocol v4）── server 内存模拟后端
目标:  浏览器 UI ── 同一套契约 ────────── 自有后端（真实数据）
```

替换面按层次固定为：

| 层                     | 内容                                                                                        | 替换时是否必须保持         |
| ---------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| 浏览器 UI              | `packages/web`、`packages/ui`（含 `packages/ui/src/v4`）                                    | 不改                       |
| 连接与传输             | `packages/client`（浏览器连接 SDK）、`packages/rpc`（SocketProtocol + Channel RPC）         | 不改；自有后端实现同一传输 |
| 服务契约               | `packages/services` 的接口与 descriptor（`ServiceCollection` 注册形状）                     | 必须保持同形               |
| 会话 wire 契约         | `packages/shared/src/zcode-protocol-v4`（zod schema、帧、命令、fault 词表）                 | 必须保持同形               |
| 模拟实现（唯一替换点） | `packages/server`：`src/mock/index.ts` 装配、`MockRuntime`/`MockTopicLog` 状态与 topic 水位 | 整体替换为真实实现         |

因此现阶段对模拟后端的要求是：贴合真实协议语义（zod 产帧自校验、记账字段不可伪造、不给 UI 加 mock 分支），而不是实现质量。

## 历史 Desktop/CLI 实施记录

本仓库的协议、会话投影和 UI 规格来自上游桌面产品与 Agent CLI 的实现。纯 Web 重构（`3f2287ac`）删除了 Electron 桌面 shell、真实 Agent 运行时、Host/relay 与 `apps/zcode-cli` 代码，但保留了它们的文档与验收证据：

- `docs/v4-refactor/`：V4 重构的协议规格与实施轨迹，包含 CLI/Host/relay/desktop main 的原始拓扑；
- `docs/testing/`：桌面 E2E、CLI/CUA 与覆盖矩阵的历史记录；
- `docs/git/`：发布链路（release-it/CI）与桌面阶段验收的历史记录。

这些文档里的进程名、路径、命令与行数描述的是**重构前产品或当时基线**，不是本仓库当前可执行入口；其中仍适用的协议字段、reason code、投影语义与产品结论保持原文，不因进程名已删除而删改。当前拓扑与命令以上文「当前 Web 拓扑与运行入口」、代码和 [docs/architecture/](architecture/) 为准。

## 纯 Web 架构边界与门禁

- `architecture-policy.yaml` 只登记当前存在的模块、公开入口和例外路径；删除模块时同步移除其依赖边及 baseline 记录。现存模块的治理状态不因清理失效路径而降级，既有缺产物记录不扩展为新的豁免。
- 架构路径预检不受 `--changed` 限制：精确路径必须存在，通配例外必须仍匹配实际文件。失效登记直接阻断门禁，不能由 baseline 接受。
- 浏览器安全边界由浏览器源码范围和明确声明的公共入口定义；检查运行时传递依赖，覆盖相对路径、workspace exports、`#src/*`、TypeScript paths、动态导入和字面量 `require`。类型专用引用不视为运行时 IO，但浏览器契约不得借类型导入依赖 Node 专用实现；需要的 DTO/schema 放在浏览器安全契约中。
- Node 内置模块、原生依赖和 Node 专用公共入口不得进入浏览器运行时依赖图。Node 专用工具可以保留，但必须明确归属且不通过浏览器安全入口公开；无当前消费者的已裁撤桌面凭据实现不迁入 mock 后端。
- workspace 包的 exports/imports 声明必须有有效目标：源码、资源目标直接存在，构建目标由对应源码及 TypeScript 输出配置支持；通配目标必须匹配文件。此检查不要求预先生成 dist，不改变现行源码与 project-reference 消费方式。
- 验收：失效 root、公开入口、精确/通配例外、包导出及包内别名均使检查失败；浏览器经根入口、子入口或别名间接引入 Node 依赖必须失败，类型安全契约及合法 Node 入口通过。定向工程回归在临时目录构造场景，不修改真实仓库制造违规。

## 未决事项

- 本次可见功能范围、领域模型和页面结构由 `todo.md` 与 [AIReq 迁移规格](specs/aireq-migration/integration.md) 固定，不再以“功能未定”阻挡已授权入口替换；未逐项举证前不得声称迁移或真实外部能力已完成。
- 自有后端的技术选型未定。
