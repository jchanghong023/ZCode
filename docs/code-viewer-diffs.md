# CodeViewer @pierre/diffs 渲染

`packages/ui/src/components/ui/code-viewer.tsx` 现在按 `@pierre/diffs` 的代码文件模型重新实现：

- 用 `FileContents` 表达预览文件：`name`、`contents`、`lang`、`cacheKey`
- 用 `@pierre/diffs/react` 的 `File` 组件渲染
- 只保留代码预览相关参数：语言、高亮开关、行号、换行、主题和字号

旧版手写 Shiki/grid 实现已经移除，当前 CodeViewer 直接由
`@pierre/diffs/react` 的 `File` 组件承载代码行、行号和 annotation 渲染。

Markdown code block 通过 CodeViewer 做只读代码展示，不支持 comment。

## 需求管理产品的高亮资源范围（2026-11-16）

- 产品不是开发执行平台。语法高亮仅保留 Markdown、JSON、YAML；`md`、`yml` 等别名归一到对应语言。其他代码、日志、未知语言保留原文、行号、复制、换行和差异展示，按纯文本渲染，不再加载编程语言语法。
- 高亮主题只保留 GitHub Light / GitHub Dark。旧本地设置中的已删除主题按原明暗槽归一到这两个主题；设置选项、文档预览、会话代码块、内联差异、主线程与 diff worker 使用同一范围。
- 所有 Shiki 使用者（包括第三方渲染库）必须消费受限 bundle；不能只限制运行时选项却继续把全量语言／主题写进生产产物。保留 Oniguruma WASM，避免重新引入已确认的 JavaScript 正则代码区膨胀问题。
- Markdown 内嵌编程语言不再高亮；Mermaid 图形、数学公式、需求材料及其交互不属于本次 Shiki 删除范围。
- 验收：生产构建不再包含未保留的语法／主题分块；中文 Markdown、JSON、YAML 在浅／深主题可读；编程语言或未知 fence 按纯文本显示且正文不丢失；旧主题设置可恢复；原生需求讨论与材料预览可用。报告实际产物变化，并执行类型、Lint、架构与电脑浏览器验证。

### 本轮实际验证

- 统一的 `document-highlighting` bundle 由 Shiki 官方工厂创建；Vite 的 Shiki 根入口解析覆盖第三方 diff 库，worker 保留 Oniguruma WASM。生产模块图仅包含 `markdown`、`json`、`yaml` 与 `github-light`、`github-dark`。
- 同口径生产构建 JS（不含独立 worker 资产）从 17,683,405 B 降至 8,980,981 B，减少 8,702,424 B（49.2%）；逐分块 gzip 合计减少 1,540,616 B。数值同时包含本轮插件退役带来的变化，不归因于 Shiki 单项。
- Bun 直接运行真实受限 highlighter：三种语言 × 两个主题均保留中文原文并产出颜色 token；Markdown 内嵌 TypeScript 不触发额外语法加载，未知／编程语言映射 text，旧主题按槽归一化。
- 真实生产页面验证外观设置只有两种高亮主题，浅／深预览实际显示中文 JSON；需求讨论发送成功并生成服务端明确标记的内存模拟材料，JSON／YAML 有高亮，TypeScript 原文完整且颜色 token 为零。浏览器无运行错误；临时提案通过产品删除入口清除。
- 最终类型、Lint、架构检查通过，Lint 零诊断；三个被根 Lint 忽略的已修改 React 渲染控件补做 Hooks 专项扫描，零诊断。未测试隐藏 Skill，不声明真实模型／Git 能力。
