# AIReq 只读材料渲染合同

## 范围与所有权

需求、方案、报告和 Skill 材料复用当前 ZCode `MessageResponse`、`MarkdownTable`、`CodeBlock`，不复制源通用控件、排版实现或 CSS。源 `AIReqMarkdownDocument` 仅作为业务包装语义参考。业务材料版本/正文仍归 AIReq 服务所有；表格预览、滚动及代码换行仍归现有组件实例所有。

## 第 2 组材料模型与验收

- 原始短需求是提案表与单列 CSV 唯一正文，独立于 AI 生成的完整业务需求材料；不得将生成文档替换原文。CSV 的模板／导入预览／导出是提案业务操作，不受材料阅读器禁用复制下载的约束。
- IR 共享材料为 `docs/requirements/<ir-id>/{requirements.md,sr-dependencies.json,acceptance.md}`；每 SR 选择读取 `openspec/changes/<sr-id>/{proposal.md,design.md,tasks.md,test-plan.md}` 及 `specs/`。这些是模拟仓库稳定引用，不读写本源码业务文档，不保留 IR/change 旧映射。
- 一个 IR 详情中的 SR 选择只影响独立材料／报告；正式表沿用同页面板，不新增 SR 聊天、文档手工编辑器、执行开发按钮。依赖图只读投影依赖 JSON，不成为第二关系来源。
- 完整包版本及失效原因可见，任何材料变化均失效三路、终审、人工与三方；仅业务需求额外重做前置单评审。历史／旧版本及文档 PR 冻结版只读，无输入器；需修改须关闭未合并 PR 后走正常业务 mutation，不允许在阅读器中绕过冻结。
- 本组场景（待主集成执行）：原文与生成文档并存；至少两 SR 可切独立全材料和测试方案；未生成、缺失、读取失败、失效、冻结和历史各自明确；切对象／版本拒绝迟到读取；正式表、报告及分析页材料版本一致。下方原生渲染可选端口不变，旧首发／自动化观察仅属第 2 组前历史，不代表本组通过。

本组实际观察（2026-11-15）：`ir-demo-25` 原文与生成业务文档分开；两个 SR 材料选择均列出独立 proposal／spec／design／tasks／test-plan，测试方案引用 IR 路径及 AC-1／AC-2。PR 确认清单为 13 份完整材料，正式同页面板继续读取相同包。未生成提示、旧阶段只读、三种材料变更后的整包失效、冻结只读和 owner 的迟到结果拒绝均已通过真实浏览器；不新增材料编辑、导出或开发执行入口。通用渲染组件及其忽略目录本组未修改，不重复运行旧通用控件专项扫描。

## 可选公开参数

- `MessageResponse.showExportActions?: boolean`，默认 `true`，既有聊天和其他消费者保持当前行为。
- `MarkdownTable.showExportActions?: boolean`、`CodeBlock.showExportActions?: boolean` 同样默认 `true`。MessageResponse 向实际 table renderer 和 CodeBlock 透传；CodeBlock 通过自身 context 控制真实 CopyButton，包括自定义 Header 使用的 CopyButton。
- `false` 时不渲染材料内表格复制 Markdown、下载 CSV 和代码复制按钮，且不启用 Streamdown 内置导出控件。不通过 CSS 遮挡，不禁用正文选择或浏览器原生复制，不改变聊天级操作或其他通用基础控件。
- 表格全屏预览、关闭、内部横滚和增强滚动模式保持可用；代码高亮、换行及 Mermaid 阅读/预览保持现状。不新增下载、带入讨论或其他材料动作。
- 材料调用方传 `showExportActions={false}`，且不传 `onOpenFileLink`、`onOpenCodeViewer`、`onOpenExternalUrl`、工作区路径或文件 citation 开关。当前链接 renderer 在无打开回调时只显示文本与目标提示，不启动旧文件/Git/外部产品入口。该约束独立于导出开关，开关本身不改变既有聊天链接语义。

历史阶段与旧评审会话必须由同一领域阶段判断设为原生 `SessionPane.readOnly`，不挂载可写输入框和输入辅助；“历史只读”的文案不能代替编辑门禁。返回当前阶段才恢复当前会话输入，不改变旧消息或旧报告。

## 更新与验收

导出开关参与 MessageResponse memo 比较、renderer memo 依赖及 Streamdown 重挂载 key，保证相同正文从可导出切至只读时旧按钮不会缓存残留。表格 toolbar 和 CodeBlock context/copy callback 的 memo 依赖包含开关；组件不得在条件分支之后新增 hooks 或泄漏布尔 prop 到 DOM。

AIReq 依赖图的第三方署名继续可见、可访问，背景与链接文字使用目标语义 token；只在业务图实例内覆盖 React Flow 默认半透明白底，避免深色主题下灰字与灰底近乎同色，不修改通用 Canvas 或隐藏署名。

父级统一验证：默认消费者操作不变；材料 `false` 时表格与代码均无复制/下载，表格仍可预览/关闭/横滚；切换开关不残留旧操作；材料链接/路径不可启动旧入口。以下 ignored 源文件需父级专项 hooks 扫描：

- `packages/ui/src/components/ai-elements/message.tsx`
- `packages/ui/src/components/ai-elements/markdown-table.tsx`
- `packages/ui/src/components/ai-elements/code-block.tsx`

主集成实际观察：PNG 首发自动进入 canonical v4 回复／材料；Skill 两文件预览的 Frontmatter 与正文分离，references/checklist、完整路径及只读详情可见。owner 的完整 1440×889 PNG 经左栏折叠、预览 Tabs 和重开仍保留，四字段与 canonical 正文准确且未发送时预览仍为“尚未生成”；改表单后再次准备保留人工补文及 PNG。

需求历史阶段原生没有 contenteditable，返回当前不改变阶段；自动化 Run 仅留下 stopped 演示记录，More“跳到会话”打开无编辑器的只读历史弹窗，task/workpool 及 actor 只读。自动化 JSON／text 输出已通过实际 CodeViewer 截图观察，不以 DOM 文本替代阅读器验收。正式需求同页报告／材料 Tabs、展开、横滚 300 与分栏切行保留；实际 SDK 后台 interval 45 更新时报告事实保持，Escape 恢复焦点，报告适配视口，不外推非零纵滚保持。

依赖图真实选边原因、缩放、指针平移及适应视图已观察；署名对比度 token 修正是实现记录，不从编译推导最终主题截图通过。上述子集不替代导出按钮、链接、memo 切换及专项 hooks 的完整合同，也不代表所有只读／失败场景均已逐一测试。源研究仅作历史依据，材料和静态资源不在运行时读取源绝对路径；无真实文件／Skill 写入或模型执行。最终检查命令、全页主题和连接精确证据统一以根 `todo.md` 为准，工具与设置观察见 `tools-settings.md`。
