# 第三方材料维护

当前产品是固定中文的纯 Web 应用：`packages/web` 提供界面，`packages/server` 提供本地 HTTP 服务，业务数据来自内存 mock。发行物只有 Web 部署目录，根目录的 [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) 随部署根目录发布，构建后的 HTML 带 `rel="license"` 链接。

Web 部署根目录的声明同时覆盖随部署提供的服务端。

Desktop、CLI、独立 Server 发行包/SEA 和原生搜索工具已退役，当前仓库没有对应构建入口，其许可材料不再作为当前发行输入。

## 生成与新鲜度校验

```sh
bun x --bun --package pnpm@10.33.2 pnpm install --frozen-lockfile
bun scripts/licenses.mjs notices
bun scripts/licenses.mjs check
```

- `notices` 只从当前锁文件的生产依赖图和现存复制资产生成 `THIRD-PARTY-NOTICES.md` 与 `third-party/inventory.json`。收集已有许可文件和 README 许可段落，不要求每个包提供完整许可原文。
- `check` 校验许可标识、声明 SHA-256，以及 inventory 登记的全部输入文件；输入被修改或声明被截断时失败。不提供完整性检查模式，也不接受额外参数；通过检查不等于合规认证。
- 构建只读取已有声明，不更新清单；inventory 过期或存在待核验项不阻断 Web 构建。
- 修改 `copied-components.json`、`npm-overrides.json` 或依赖后必须先运行 `notices` 再运行 `check`。直接对旧 inventory 运行 `check` 会因输入哈希或已删除登记失败，这是预期的过期信号，不是绕过检查的理由。
- 生成器先归一化 CRLF 再严格比对 `pnpm-lock.yaml` 与 `node_modules/.pnpm/lock.yaml`；安装快照过期时必须先执行 frozen install，不能直接重生成。

当前输入以生成后的 `inventory.json` 为准。本文不记录易过期的包数量；数量、精确版本和待核验项从清单读取。

## 当前输入登记

| 文件                                                                 | 作用                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `third-party/copied-components.json`                                 | 当前仍存在的上游复制源码、技能与素材；登记根目录、许可原文与改编文件 |
| `third-party/npm-overrides.json`                                     | 生产图中缺少完整许可文件的精确版本及固定上游原文                     |
| `third-party/upstream/`                                              | 上述登记的原文快照与包元数据快照                                     |
| `scripts/license-texts/Apache-2.0.txt`                               | Apache-2.0 复制组件的完整许可全文                                    |
| `pnpm-lock.yaml`、`pnpm-workspace.yaml`、各 workspace `package.json` | 生产依赖图与早退校验的输入                                           |

`npm-overrides.json` 的每条记录只对当前生产图中的 `name@version` 有效。包离开生产图后登记即过期，生成器报 `Stale npm notice override`；必须按实际依赖删除或替换记录，不能保留无关条目。升级包版本时重新核对上游来源和原文 SHA-256；不得把旧版本材料套到新版本，也不得编造版权人。

`copied-components.json` 的根目录缺失时生成器直接报 `Missing copied component path`，不会把缺失文件当成“已退役”而跳过。上游原文引用失败同样直接失败。

## 生产图许可放行

`scripts/licenses.mjs` 的 `PROD_REVIEWED` 只登记当前生产图中实际可达的非宽松许可依赖。当前该表为空：Mermaid 渲染链的 `mermaid`、`@streamdown/mermaid`、`cytoscape` 等为 MIT/Apache-2.0，`dompurify` 为 `MPL-2.0 OR Apache-2.0`（采用 Apache-2.0 选项）。

- `elkjs` 不在当前锁图，原消费者 `apps/dev-docs` 已删除；不能继续按内部文档站理由放行。
- `sharp`/`@img/sharp-*` 不在当前锁图，原 Computer Use 分发路径已退役；不能继续按截图用途放行。
- 判断可达性以当前 `pnpm-lock.yaml` 的生产闭包为准，不以残留 `node_modules` 或日志中的旧包为准。
- 任何 LGPL/GPL/EPL 或 MPL-only 包重新进入生产图时，必须按真实调用方、二进制分发方式和替换策略重新登记；未登记即由 `check` 阻断。

## 复制内容与改编声明

当前登记 shadcn/ui、AI Elements 组件、VS Code IPC/基础工具与 Superpowers 技能描述。范围、来源和修改记录见 [copied-components.json](copied-components.json)。

- Apache-2.0 复制内容中已确认源自上游并经过改编的文件，必须同时保留集中声明和文件内 `Modified by ZCode:` 声明；生成器会校验该标记。
- shadcn 样式继续由 npm 原入口引入，不另复制 CSS。`shadcn@4.1.1` 的 MIT 原文与现有 shadcn 许可快照一致；版本由 UI manifest 和锁文件约束，不把整棵 CLI 依赖算作生产分发。
- 未确认源自上游的自有文件不追加上游归属。
- 最初引入 commit 未记录时保留 `importRevision: null`；固定的许可参考提交不冒充最初复制版本。

## 文件与哈希约定

- 工作区文本输入的新鲜度哈希统一 CRLF → LF，兼容 Windows checkout。
- 上游许可原文、复制素材和最终声明按原始字节计算 SHA-256。
- 相同原文按 SHA-256 去重，声明中同一段文本只出现一次，并列出所有适用组件。
- 包元数据中的许可标识只作描述，不替代原始条款；不从 npm `author` 字段推断版权人。
- 未取得完整许可的复制组件，其原始声明快照与 SHA-256 登记在 `copied-components.json` 的 `reviewEvidence`，只作追溯，不作为许可全文或声明正文输出。
- `upstream/` 保存当前声明及核验所需的原始快照，不要运行格式化工具改写。

## 尚待核验的材料边界

材料缺口保留在 `npm-overrides.json` 的 `reviewEvidence` 与声明的来源局限中，仅供追溯，不作为自动门禁。当前已知类型：

- `react-remove-scroll-bar@2.3.8`：npm 归档 27 个文件无许可文件；npm 记录的 gitHead `b3b1287aad81def2e2ae707274b74531b61ddbaf` 已不可达，仓库也没有 2.3.8 对应的 ref。上游 2025-05-21 才在 commit `7301c160fda44cb8cf2b9fdfde61efad35736196` 加入 MIT LICENSE（Copyright (c) 2025 Anton Korzunov），晚于 2024-12-15 的发布，只能作为证据保留，不能作为该版本的许可原文。
- `boolbase@1.0.0`：发布包和 `9837d5bf4f30390ac6384a6bc605ca2d69ade4bf` 源码树均无完整许可文件，只有 `package.json` 的 ISC 标识；没有版权行，不能从 author 字段推断版权人。
- `remark-github-blockquote-alert@1.3.1`：发布包和 npm gitHead `bb71a22d33ff6118d91531ac118bac8445625530` 的源码树无完整许可文件；README 只有 `MIT © Kenny Wong`，未提供完整 MIT 授权条款。

这些记录不阻断声明生成与校验；已有归属、原文和证据仍须保留，不能把检查通过表述为材料缺口已关闭。

## Web 交付验证

运行 `bun run build:web`。核对 `packages/web/dist/THIRD-PARTY-NOTICES.md` 与根声明字节一致，并确认构建后的 `index.html` 通过 `rel="license"` 引用声明。
