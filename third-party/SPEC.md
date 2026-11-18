# 第三方许可材料与发行交付

## 产品规则与所有者

第三方复制内容保留各自许可、版权及适用的文件内修改声明。包元数据不能单独替代上游原始材料，也不能编造权利人。生成器收集现有材料，显式检查只校验许可证标识、声明哈希与输入新鲜度，不设置完整许可原文门禁；材料缺口作为来源局限保留，不表示授权材料已补齐。第一方代码的对外许可由开源导出覆盖层提供，不在本目录声明。

| 所有者                                                               | 职责                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `third-party/*.json`、`third-party/upstream/`                        | 当前输入与原文快照的唯一登记入口                                 |
| `third-party/native-search/`、`third-party/runtime/`                 | 已退役发行格式的材料保留区；不是当前 Web 发行输入                |
| `scripts/third-party-npm.mjs`                                        | 解析锁文件生产图与实际安装图、读取包内原文                       |
| `scripts/generate-third-party-notices.mjs`（`licenses.mjs notices`） | 生成 `THIRD-PARTY-NOTICES.md` 与 `inventory.json`                |
| `scripts/licenses.mjs check`                                         | 显式许可标识、声明哈希与输入新鲜度检查                           |
| `scripts/third-party-notices.mjs`                                    | 构建期读取与分发声明；各构建入口只调用这一模块，不另建许可数据库 |

## 当前发行范围

当前产品是固定中文的纯 Web 应用：`packages/web` 构建静态资源，由 `packages/server` 在本地提供 HTTP 服务，业务数据来自内存 mock 后端。发行物只有 Web 部署目录。

- 当前声明输入 = 当前锁文件的生产依赖图 + `copied-components.json` 登记的现存复制源码/素材 + `npm-overrides.json` 的补充原文 + 根 `package.json` 的补丁。
- Desktop（Electron）、CLI、独立 Server 发行包/SEA 与原生搜索工具均已退役，当前仓库没有对应目录或构建入口。
- `third-party/runtime/`、`third-party/native-search/`、`third-party/upstream/` 中仍保留退役格式的许可原文和来源登记，作为历史法律归属材料保存；它们不是当前发行输入，不得复制进 Web 发行，也不得为了通过检查删除。
- 原 `embedded-components.json`（Skia、QuickJS-NG）随 `@napi-rs/canvas`、`quickjs-wasi` 离开依赖图而移除登记：当前 Web 生产图没有内嵌原生/WASM 组件。相应原文快照仍在 `third-party/upstream/`，但不进入当前声明。
- 生成器不得探测目录是否存在后静默跳过：`copied-components.json` 或 `npm-overrides.json` 指向的当前资产缺失时直接失败。

## npm 生产图的范围

- 生产图取所有工作区项目的生产依赖，包括不发布的内部应用；内部应用的构建工具（如 Vite 插件）必须放在 `devDependencies`，否则会把构建工具误算为生产依赖。
- 只登记 pnpm 在当前宿主上会安装的包：锁文件 `packages` 段的 `os`/`cpu`/`libc` 约束与 `pnpm-workspace.yaml` 的 `supportedArchitectures`（`current` 取宿主值）按 pnpm 的可安装规则比对。不可安装的平台包及只经由它们引入的依赖不安装、不分发，不进生产图，也不作为缺失安装报错；不维护按包名的例外名单。
- 同一包名可以同时存在多个兼容版本；声明按 `name@version` 分别登记，不按包名合并。
- 非宽松许可的生产依赖按包名逐项登记人工复核结论，登记同时绑定许可类别，许可变化后重新阻断。当前 Web 生产图没有非宽松许可依赖，`scripts/licenses.mjs` 的 `PROD_REVIEWED` 为空：Mermaid 渲染链的 `mermaid`、`@streamdown/mermaid`、`cytoscape` 等为 MIT/Apache-2.0，`dompurify` 为 `MPL-2.0 OR Apache-2.0`（采用 Apache-2.0 选项）。`elkjs` 不在当前锁图，原消费者 `apps/dev-docs` 已删除；`sharp`/`@img/sharp-*` 也不在锁图，原 Computer Use 分发路径已退役，二者都不能沿用旧理由放行。任何 LGPL/GPL/EPL 或 MPL-only 包进入生产图时，必须按当时真实调用方和发行策略重新登记，否则检查阻断。
- 开源导出树的工作区与锁文件不同于闭源，其声明与 inventory 由导出流程在开源依赖树上重新生成，不沿用闭源声明。

## 补充原文登记

`npm-overrides.json` 只登记当前生产图中、包内缺少完整许可文件的精确版本。每条记录绑定固定上游来源与原文 SHA-256；包名或版本离开生产图即视为过期登记，生成直接失败。升级依赖时必须重新核对来源和原文，不能把旧版本材料套到新版本，也不能编造版权人。`khroma@2.1.0` 这类包没有独立 LICENSE 文件，但记录中的 `license` 仅作为包内元数据缺失时的标识补充，不冒充完整原文。

`boolbase@1.0.0` 与 `remark-github-blockquote-alert@1.3.1` 的发布包和对应源码树均未提供完整许可文件：前者只声明 ISC，后者声明 MIT 且 README 保留 Kenny Wong 署名。补充材料沿用 `evidenceKind: publisher-license-identifier-and-standard-terms`，明确区分发布者声明与标准条款；`reviewEvidence` 固定源码提交和缺失事实，仅用于追溯，不设置完整性门禁，不从作者字段推测版权人或补写年份。

`react-remove-scroll-bar@2.3.8`、`@hono/node-ws@1.3.0`、`ansi-to-react@6.2.6` 的精确 npm 归档都没有 LICENSE/COPYING/NOTICE，对应 release ref 的源码树也没有；`react-remove-scroll-bar` 的 npm gitHead 已不可达，仓库没有 2.3.8 对应的 ref。`react-remove-scroll-bar` 与 `@hono/node-ws` 后来补的 LICENSE 分别晚于 2.3.8（2024-12-15）和 1.3.0（2026-01-07）发布，`@hono/node-ws` 维护者还明确说明该文件从下一个版本起才随包发布；`ansi-to-react` 全部历史都没有许可文件。后补原文以固定 commit、SHA-256 保存在 `third-party/upstream/`，只作版本不匹配的核验证据，不合并进这些版本的声明，也不表示版本对应材料已补齐。

## 复制源码、技能与素材

`copied-components.json` 是复制内容的登记入口，`inventory.json` 保存对应文件、固定上游参考和 SHA-256，根 `THIRD-PARTY-NOTICES.md` 由生成器输出原始版权及许可文本。最初引入的 commit 未记录时保留 `importRevision: null`，不把本次核验的版本当成最初版本。

当前登记项：

| 内容                   | 本地范围                                                                  | 上游许可与修改说明                                                                                                |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| shadcn/ui              | `packages/ui/src/components/ui/`、`packages/ui/src/styles.css` 的衍生部分 | MIT；本地修改包含样式、国际化和组件组合，自有组件不归属于上游。                                                   |
| AI Elements            | `packages/ui/src/components/ai-elements/`                                 | Apache-2.0，Copyright 2023 Vercel, Inc.；本地修改包含样式、导入路径及组件扩展。                                   |
| VS Code IPC 与基础工具 | `packages/rpc/src/` 的现存衍生部分，及 `wire-codec.ts`                    | MIT，保留 Microsoft 原始版权行；本地进行了模块拆分、传输扩展和封装修改，不将所有本地实现归属于上游。              |
| Superpowers 技能描述   | `packages/ui/src/lib/builtinSkillI18n.ts`                                 | MIT，Copyright (c) 2025 Jesse Vincent；只覆盖该文件中的 Superpowers 描述及翻译，原 CLI 插件实现随命令工作区删除。 |
| Material Icon Theme    | `packages/web/public/material-icons/`                                     | MIT；本地按 Web 资源路径引用，不再包含 Desktop 副本。                                                             |

已退役且不再登记为当前输入的材料：Fig autocomplete 生成的 CLI 注册表、CLI design-plugin 的 design-resources 与 html-ppt 模板、Knip 文档镜像及其字体、Desktop 的 Material Icons 副本、dogfood 技能、Superpowers CLI 插件目录。仍可取得的原文快照保留在 `third-party/upstream/`，但不会进入当前声明或 Web 发行；随本地目录一起删除且无上游快照的材料不再声称仍被保留。

## 开发、构建与校验边界

```text
开发 / bootstrap / build → readThirdPartyNotices 等读取已有材料 → Web 构建嵌入声明
显式 notices / check     → 收集现有材料 / 核验标识与哈希 → 更新清单或报告失败
```

- 构建不更新清单，也不隐式运行许可校验；inventory 过期、待核验项都不阻断开发和打包。
- 声明文件仍是打包输入；缺失、无法读取或无法解析时保留原始错误，不生成空声明。
- `readVerifiedNotices(root)` 只由显式检查使用，校验声明与输入哈希；原文或 README 许可段落缺席不阻断生成，也不输出完整性待办门禁字段。
- Windows checkout 的 CRLF 输入在新鲜度哈希中归一化为 LF；上游原文快照与最终声明按原始字节校验。

## 交付入口（本仓库已接入）

| 产物 | 位置                                                      | 接入点                                                         |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Web  | 部署根目录 `THIRD-PARTY-NOTICES.md`，HTML `rel="license"` | `packages/web/vite.config.ts` 的 `thirdPartyNoticesVitePlugin` |

Web 部署根目录的声明同时覆盖随部署提供的服务端。退役发行格式的许可原文与来源继续归档。

## 验收

1. `bun x --bun --package pnpm@10.33.2 pnpm install --frozen-lockfile`：安装快照必须与 `pnpm-lock.yaml` 一致，否则生成器拒绝运行。
2. `bun scripts/licenses.mjs notices`：从最终锁文件和现存资产重新生成声明与 inventory；允许包中没有许可文件或只有 README 许可段落，但显式登记的材料缺失或哈希不符仍然失败。
3. `bun scripts/licenses.mjs check`：校验许可标识、声明哈希与全部输入文件的新鲜度；不支持额外参数或完整性检查模式。
4. `bun run build:web`：验证 Web 产物根目录包含当前 `THIRD-PARTY-NOTICES.md` 且 HTML 带 `rel="license"`。

最终安装包未实际构建时，不声称完成发行审计。
