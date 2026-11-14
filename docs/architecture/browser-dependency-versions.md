# 浏览器依赖版本收敛

本文件记录浏览器可达的 Markdown / 代码高亮依赖的直接版本选择、收敛依据和保留的重复主版本。它只约束 `packages/ui` 的直接依赖；lockfile 中的最终解析由根 `pnpm-lock.yaml` 决定，发布与打包流程见 [`web-build-workflow.md`](./web-build-workflow.md)。

## 当前决策

| 依赖     | 变更前                 | 变更后   | 依据                                                                                                                                                                     |
| -------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shiki`  | `^4.0.2`（解析 4.0.2） | `3.23.0` | 与 `@pierre/diffs@1.1.22`、`@streamdown/code@1.1.1` 的现有 `^3.0.0` / `^3.19.0` 兼容；被使用的 API 与 bundled language/theme 集合等价。                                  |
| `marked` | `16.4.2`               | `17.0.6` | 与 `streamdown@2.5.0` 的 `^17.0.1` 收敛；`CloudDialogDescription` 使用的 `Marked`、`parse(..., { async: false })`、`renderer.html` 声明与行为在 16.4.2 / 17.0.6 间一致。 |

未改动：`@pierre/diffs`、`@streamdown/cjk|code|math|mermaid`、`streamdown`、`katex`、`motion`、`@rive-app/react-webgl2`、`lottie-web`、`swr`、`zustand`、`core-js`（`packages/web`）、`shadcn`（devDependency，仅供生成与样式流程）以及现有 shadcn CSS。两套 Markdown 渲染与动画库职责不同，不能互相删除或替换。

根 `package.json` 的 `pnpm.overrides` 未新增条目。`shiki` 由直接精确版本和锁文件收敛；`marked` 不能跨主版本 override，原因见下文保留项。

## Shiki 3.23.0 兼容依据

直接运行时只使用 `packages/ui/src/lib/shikiHighlighter.ts` 的三项导出：`bundledLanguages`、`bundledLanguagesInfo`、`createHighlighter`。其余 `shiki` 引用均为类型导入（`BundledLanguage`、`BundledTheme`、`ThemedToken`、`HighlighterGeneric`）。

核对 `shiki@3.23.0` 与 `shiki@4.0.2`：

- `shiki@3.23.0` 入口 `dist/index.d.mts` 导出 `bundledLanguages`、`bundledLanguagesInfo`、`createHighlighter`，并通过 `@shikijs/core` 重导出 `HighlighterGeneric`、`ThemedToken` 等类型；`bundledLanguages` 类型包含当前回退语言 `log`，主题包含 `github-dark` / `github-light`。
- `createHighlighter({ langs, themes })`、`HighlighterGeneric.getLoadedLanguages()`、`codeToTokens(code, { lang, theme })` 在 `@shikijs/types@3.23.0` 与 `4.0.2` 中签名一致；`ThemedToken` 的 `content` / `color` 字段一致。
- 两版本的 bundled language 集合均为 332 项，主题集合相同，无增删（对比 `langs.d.mts` / `langs-bundle-full-*.d.mts` 的 `BundledLanguage`、`BundledTheme` 联合类型）。
- `@streamdown/code@1.1.1` 声明 `shiki: ^3.19.0`，`@pierre/diffs@1.1.22` 声明 `shiki: ^3.0.0`；`3.23.0` 同时满足两者，因此直接依赖改为 `3.23.0` 后整棵锁图只保留一个 `shiki` 主版本。
- `3.23.0` 是 npm 上当前最高的 `3.x` 版本，现有 `^3.x` 消费方会解析到同一版本；升级到 `shiki` 新主版本时必须重新核对上述 API，不得用 override 把第三方跨主版本强制到新主版本。

## Marked 17.0.6 兼容依据

`packages/ui/src/components/cloud-content-dialog/CloudDialogDescription.tsx` 使用：

- `new Marked({ async: false, renderer: { html: ({ text }) => ... } })`
  - `marked@17.0.6` 的 `RendererObject.html` 仍是 `({ text }: Tokens.HTML | Tokens.Tag)`；
  - `Marked` 构造器仍接收 `MarkedExtension`，`async`、`renderer` 选项仍在。
- `marked.parse(text, { async: false })`
  - 该重载在 17.0.6 中仍返回字符串 `ParserOutput`；
  - `class Marked`、`parse`、`parseInline` 的声明与 16.4.2 对比仅为行号位移。

行为核对：以上述同样配置分别加载 `marked@16.4.2` 与 `17.0.6`，对 23 个代表性输入（普通/紧凑/宽松列表、任务列表、嵌套列表、引用、围栏代码、表格、内联 HTML、HTML 转义、换行）比较 `parse` 输出，全部一致。17.0.0 的 breaking change 集中在 list tokenizer / `listItem` / checkbox token 的内部结构，未改变本文件使用的 `html` renderer 和输出路径。

`streamdown@2.5.0` 声明 `marked: ^17.0.1`，因此直接依赖改为 `17.0.6` 后 UI 直接使用与 Streamdown 共用同一 `marked@17.0.6`。

## 保留的重复主版本

| 依赖     | 版本     | 路径                                                  | 保留原因                                                                                                                    |
| -------- | -------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `marked` | `16.4.2` | `mermaid@11.14.0`（经 `streamdown` → `mermaid` 引入） | `mermaid@11.14.0` 声明 `marked: ^16.3.0`，与 17.x 主版本不兼容。为它添加 `marked: 17.0.6` override 属于跨主版本强制，禁止。 |
| `shiki`  | `3.23.0` | 唯一版本                                              | 无重复。                                                                                                                    |

`marked@16.4.2` 只服务 Mermaid 图解析，不参与 `CloudDialogDescription` 或 Streamdown 的 Markdown 渲染。后续若 Mermaid 迁移到 `marked@17`，可删除该重复版本；在该上游发布前不得用 override 消除。

## 变更与验证

修改 `packages/ui/package.json` 中 `shiki` / `marked` 直接版本时：

1. 先按上述 API 面重新核对目标版本的类型声明，并保留验证证据（不需要提交临时脚本或下载的包）。
2. 运行仓库统一安装，确认 lockfile 中 `shiki` 只有 `3.23.0`，`marked` 只有 `17.0.6`（UI/Streamdown）与 `16.4.2`（Mermaid）两组。
3. 运行统一构建，并按浏览器验收确认代码块高亮、Cloud 描述 Markdown 列表/HTML 转义和 Streamdown 消息渲染无回归。

可用检查：

```bash
pnpm install
pnpm why shiki -r
pnpm why marked -r
```

变更前 bundle 资产基线（`local://p1p3-bundle-before.json`）：JS chunk 2,440 个、总计 30,801,553 bytes，入口 `index-DqB4-oRa.js` 5,964,110 bytes。收敛后的重装、构建与浏览器高亮验收由主代理统一执行；本文件不声明未测得的体积变化。
