# 第三方材料维护

当前产品是固定中文的纯 Web 应用：`packages/web` 提供界面，`packages/server` 提供本地 HTTP 服务，业务数据来自内存 mock。发行物只有 Web 部署目录，根目录的 [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) 随部署根目录发布，构建后的 HTML 带 `rel="license"` 链接。

Desktop、CLI、独立 Server 发行包/SEA 和原生搜索工具已退役，当前仓库没有对应构建入口，其许可材料不再作为当前发行输入。

## 生成与新鲜度校验

```sh
pnpm install --frozen-lockfile
node scripts/licenses.mjs notices
node scripts/licenses.mjs check
# 材料完整性门禁：reviewRequired 非空时失败，不能靠更新哈希放行。
node scripts/licenses.mjs check --strict
```

- `notices` 只从当前锁文件的生产依赖图和现存复制资产生成 `THIRD-PARTY-NOTICES.md` 与 `third-party/inventory.json`。
- `check` 校验许可标识、声明 SHA-256，以及 inventory 登记的全部输入文件；输入被修改或声明被截断时失败。
- `check --strict` 在材料缺口关闭前如实失败。基础检查通过不等于合规完成。
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

React Best Practices 的真实缺口仍保留在 `copied-components.json` 与 `inventory.json` 的 `reviewRequired`：上游固定参考 `063bee94c3f4df8453406c830b0a7df0f2860278` 只有 MIT 标识、没有完整 LICENSE 文件，本地只保留 Shu Ding / Vercel 署名。2026-11-14 复检当前 `main` 分支仍然没有 LICENSE/COPYING/NOTICE，也没有版权行，因此不能用新分支状态关闭该条。该条目继续由 `check --strict` 阻断，不因本次放行表清理而关闭或降级。

## 复制内容与改编声明

当前登记 shadcn/ui、AI Elements、agent-browser 技能、VS Code IPC/基础工具、Superpowers 技能描述、Material Icon Theme 与 React Best Practices。范围、许可和改编说明见 [SPEC.md](SPEC.md#复制源码技能与素材)。

- Apache-2.0 复制内容中已确认源自上游并经过改编的文件，必须同时保留集中声明和文件内 `Modified by ZCode:` 声明；生成器会校验该标记。
- shadcn 样式继续由 npm 原入口引入，不另复制 CSS。`shadcn@4.1.1` 的 MIT 原文与现有 shadcn 许可快照一致；版本由 UI manifest 和锁文件约束，不把整棵 CLI 依赖算作生产分发。
- 未确认源自上游的自有文件不追加上游归属。
- 最初引入 commit 未记录时保留 `importRevision: null`；固定的许可参考提交不冒充最初复制版本。
- React Best Practices 固定参考 revision `063bee94c3f4df8453406c830b0a7df0f2860278` 全树没有 LICENSE/COPYING/NOTICE 或版权行；README 与 SKILL 仅声明 MIT，raw LICENSE 与 GitHub license API 均返回 404。2026-11-14 复检上游 `main`（tarball SHA-256 `2031cd6d47df03196f79ecf652efb2db125ccd7e0d0000b9a6af10949b814f7f`）同样没有许可文件或版权行。原始 README/SKILL 快照与 SHA-256、已试 URL 及所需材料登记在 `copied-components.json` 的 `reviewEvidence`；`reviewRequired` 保持 `[blocked]`，不能用通用条款、其他仓库文本或推测版权行拼接关闭。

## 已退役材料的保留

`third-party/runtime/`、`third-party/native-search/` 与未被当前登记引用的 `third-party/upstream/` 快照仍保留原始许可文本和来源记录，用于历史法律归属核查。它们不是当前 Web 发行输入：

- 不进入生成器的输入哈希、声明正文或 `inventory.json` 的当前组件列表；
- 不复制到 Web 部署目录；
- 不得因为“未使用”就删除这些合法材料，也不得反过来把历史归属声称为当前依赖。

已退役的登记项包括 Fig autocomplete 注册表、CLI design-plugin 资源与模板、Knip 文档镜像及字体、Desktop Material Icons、dogfood 技能和 Superpowers CLI 插件目录；对应本地路径已随工作区删除。原 `embedded-components.json` 的 Skia、QuickJS-NG 记录也随 `@napi-rs/canvas`、`quickjs-wasi` 离开依赖图而移除；当前 Web 生产图没有内嵌原生/WASM 组件。

## 文件与哈希约定

- 工作区文本输入的新鲜度哈希统一 CRLF → LF，兼容 Windows checkout。
- 上游许可原文、复制素材和最终声明按原始字节计算 SHA-256。
- 相同原文按 SHA-256 去重，声明中同一段文本只出现一次，并列出所有适用组件。
- 包元数据中的许可标识只作描述，不替代原始条款；不从 npm `author` 字段推断版权人。
- 未取得完整许可的复制组件，其原始声明快照与 SHA-256 登记在 `copied-components.json` 的 `reviewEvidence`，只作追溯，不作为许可全文或声明正文输出。
- `upstream/`、`native-search/licenses/` 与 `runtime/` 是原始快照，不要运行格式化工具改写。

## 尚待核验的材料边界

`reviewRequired` 是唯一权威列表；基础检查通过仍可能保留缺口。当前已知类型：

- 复制内容缺少完整上游许可原文：React Best Practices（固定 revision 与 2026-11-14 复检的 `main` 均无 LICENSE/COPYING/NOTICE 和版权行；证据快照、已试 URL 与所需材料见 `copied-components.json` 的 `reviewEvidence`）。
- `react-remove-scroll-bar@2.3.8`：npm 归档 27 个文件无许可文件；npm 记录的 gitHead `b3b1287aad81def2e2ae707274b74531b61ddbaf` 已不可达，仓库也没有 2.3.8 对应的 ref。上游 2025-05-21 才在 commit `7301c160fda44cb8cf2b9fdfde61efad35736196` 加入 MIT LICENSE（Copyright (c) 2025 Anton Korzunov），晚于 2024-12-15 的发布，只能作为证据保留，不能作为该版本的许可原文。
- `@hono/node-ws@1.3.0` 已随后端迁移 Bun 移出依赖图，不再属于当前 `reviewRequired`；此前缺少版本对应许可的核验快照仅保留作历史证据，不表示许可缺口已补齐。
- `ansi-to-react@6.2.6`：npm 归档 4 个文件无许可文件；tag `v6.2.6` 对应的 `145140971e9d83ccac32265f24b1c55dea437896` 树无许可文件，全部历史也没有 LICENSE/COPYING/NOTICE 或版权行，README 只有 BSD-3-Clause 标识链接，无法取得完整原文。
- 后补的 `react-remove-scroll-bar` 与 `@hono/node-ws` LICENSE 原文以固定 commit 和 SHA-256 保存在 `third-party/upstream/`，只作版本不匹配的核验证据，不进入声明正文，也不用于关闭 `reviewRequired`。

这些条目在 `check --strict` 下阻断；需要补充真实证据或移除对应材料，不能靠更新哈希或删除记录通过。

具体规则、交付入口与验收命令见 [SPEC.md](SPEC.md)。
