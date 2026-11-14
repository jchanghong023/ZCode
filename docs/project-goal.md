# 项目目标与 UI 保真策略

本仓库源自上游 ZCode（开源 Agent 产品）。上游原产品形态复杂：桌面端、浏览器端与真实 Agent 运行时并存，且携带完整的商业化与重平台功能。本项目的目标不是复刻该产品，而是把它收敛为自有产品的开发基座：**以 AI 为中心的需求澄清、需求跟踪平台**（产品方向演进中，具体功能范围未定型）。

不自研 UI 设计：上游的浏览器端 UI 效果符合预期，作为现成设计资产直接采用，在其上以叠加方式增加自有功能。

## 范围与形态

只保留浏览器端。桌面 app、真实 Agent 运行时、内嵌浏览器、Computer Use、终端、远程主机（SSH / Docker / WSL）、应用内购买与计费、营销触达等商业化与重平台功能，以及反馈中心、模型轨迹、白板/树图、Git 提交图、PDF/Office/PPTX 内联预览、界面多语言（固定中文）等已裁撤（见 `6e56874c`、`3f2287ac` 及后续重构提交）。已裁撤功能及其页面、入口不参与 UI 保真约束；裁撤范围以本文件与相关裁撤提交为准。

**产品仅面向电脑浏览器。** 手机及其他移动屏幕不在支持范围内，不进行相应的布局适配、交互优化或屏幕测试。已有移动端样式和通用控件仅作为存量资产保留，不构成手机支持承诺。

当前形态：浏览器前端 + 模拟后端。`packages/server` 按 ZCode Protocol v4 与真实服务端完全相同的 WebSocket RPC 传输向 UI 提供全部服务，数据为内存态、确定性假数据；唯一例外是本地项目选目录会读取本机真实目录名（只读，不读写文件内容）。

## 当前 Web 拓扑与运行入口

仓库里只有一个可运行拓扑：浏览器前端直连内存模拟后端，不存在桌面 shell、Agent CLI、Host/relay 或远程主机进程。

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

| 约束       | 内容                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI 保真    | 上游来源的**保留 UI**（视觉、交互、布局）以仓库当前实现为基准保持稳定；已裁撤功能及其页面、入口不参与保真。禁止借自有功能改动保留 UI 的风格与交互；允许删除或修改裁撤功能专属的上游 UI，以及接线类适配（导入、导航、数据源、平台能力）与渲染等价的重构。**除用户明确要求，禁止与上游快照 `fec97590` 对比**（源码 diff、截图对照均不作为依据）。 |
| 叠加式扩展 | 自有功能一律以新增模块接入，遵循架构治理登记（architecture:adopt / exceptions），复用 `packages/ui/src/components/ui` 控件库并遵守 `DESIGN.md`，视觉上与上游原生内容无异。                                                                                                                                                                      |
| 控件保留   | **现有上游基础控件一律保留**：`packages/ui/src/components/ui` 全部内容、已有 `mobile-ui` 兼容控件，以及布局、弹层、图标、表单等通用控件；保留资产不代表支持手机屏幕。即使当前无引用也**不得删除**，`knip` / 未使用导出报告不构成删除理由。只允许删除与已裁撤功能强绑定的页面级组件，不确定是否通用时保留。                                      |
| 契约优先   | 前端与协议按生产质量实现与验证；模拟后端为原型，只要求协议语义保真，不要求生产级实现。                                                                                                                                                                                                                                                          |

## 基线与验收

- **不跟随上游更新**：上游代码停在最后一次上游同步提交 `fec97590`（≈ 上游 v3.18.2）；不合并上游后续提交。**除用户明确要求，禁止以该快照作为改动、评审或验收的比对基准**。
- `base` 基线尚未评审完毕，允许在其上提交基线修复（只修基线自身缺陷与失真，不引入自有功能、不做重构），评审完成后转为冻结；`main` 合并基线修复。
- `base` 检出于工作树 `F:\code2026\zcode-baseline`（详见 AGENTS.md「老代码对比基准」），基线修复在该工作树提交，不要在主工作树切换分支。
- 涉及 UI 的改动，验收须满足：
  1. 保留界面的改动仅限接线适配、裁撤清理与渲染等价的重构；自有功能全部落在新增文件。
  2. 不做上游快照对照：不执行 `git diff fec97590...`、不做上游截图比对（除非用户在当次任务中明确要求）。
  3. 仅在电脑浏览器执行运行时验证：在相同数据下，改动前后的实际界面渲染一致；已裁撤页面、入口消失属预期。不执行手机屏幕验收。

## 后端替换路径

前端与模拟后端之间唯一的耦合面是 `packages/services` 的服务接口 / descriptor 与 `packages/shared` 的 Protocol v4 契约。将来对接自有后端时，实现同一套契约即可整体替换 `packages/server`，UI 层零改动。

```text
现在:  浏览器 UI ── WS RPC（Protocol v4）── packages/server 模拟后端（内存假数据）
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

- 需求澄清与需求跟踪平台的具体功能范围、领域模型与页面结构未定，本文档随产品定义演进更新。
- 自有后端的技术选型未定。
