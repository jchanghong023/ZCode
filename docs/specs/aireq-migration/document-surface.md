# AIReq 只读材料渲染合同

## 范围与所有权

需求、方案、报告和 Skill Markdown 正文统一使用当前 ZCode `MarkdownDocument`（`@uiw/react-markdown-preview` 静态文档阅读器），不再复用聊天 `MessageResponse` 排版。表格、代码、Mermaid 与图片预览继续复用现有基础控件，不复制源控件或引入第二份业务状态。`AIReqMarkdownDocument` 是材料只读策略包装；业务版本/正文仍归 AIReq 服务所有，阅读器仅消费正文、主题与代码设置。视觉与验收合同见 `docs/ui/markdown-preview-renderers.md`。

## 第 2 组材料模型与验收

- 原始短需求是提案表与单列 CSV 唯一正文，独立于 AI 生成的完整业务需求材料；不得将生成文档替换原文。CSV 的模板／导入预览／导出是提案业务操作，不受材料阅读器禁用复制下载的约束。
- IR 共享材料为 `docs/requirements/<ir-id>/{requirements.md,sr-dependencies.json,acceptance.md}`；每 SR 选择读取 `openspec/changes/<sr-id>/{proposal.md,design.md,tasks.md,test-plan.md}` 及 `specs/`。这些是模拟仓库稳定引用，不读写本源码业务文档，不保留 IR/change 旧映射。
- 一个 IR 详情中的 SR 选择只影响独立材料／报告；正式表沿用同页面板，不新增 SR 聊天、文档手工编辑器、执行开发按钮。依赖图只读投影依赖 JSON，不成为第二关系来源。
- 完整包版本及失效原因可见，任何材料变化均失效三路、终审、人工与三方；仅业务需求额外重做前置单评审。历史／旧版本及文档 PR 冻结版只读，无输入器；需修改须关闭未合并 PR 后走正常业务 mutation，不允许在阅读器中绕过冻结。
- 历史材料默认显示只读状态和失效原因；完整版本标识放入可展开的“文件路径与技术信息”，避免内部快照占用正文空间。桌面浏览器截图检查历史版本切换、技术信息展开与返回当前材料。
- 第 2 组原实施验收场景：原文与生成文档并存；至少两 SR 可切独立全材料和测试方案；未生成、缺失、读取失败、失效、冻结和历史各自明确；切对象／版本拒绝迟到读取；正式表、报告及分析页材料版本一致。实际执行范围见下方本组观察及 proposals 的第 2 组收口记录，不是待后续集成补验的清单。下方原生渲染可选端口不变，旧首发／自动化观察仅属第 2 组前历史，不代表本组通过或本次重新验收。

本组实际观察（2026-11-15）：`ir-demo-25` 原文与生成业务文档分开；两个 SR 材料选择均列出独立 proposal／spec／design／tasks／test-plan，测试方案引用 IR 路径及 AC-1／AC-2。PR 确认清单为 13 份完整材料，正式同页面板继续读取相同包。未生成提示、旧阶段只读、三种材料变更后的整包失效、冻结只读和 owner 的迟到结果拒绝均已通过真实浏览器；不新增材料编辑、导出或开发执行入口。通用渲染组件及其忽略目录本组未修改，不重复运行旧通用控件专项扫描。

## 可选公开参数

- `MarkdownDocument.showExportActions?: boolean` 默认 `true`；AIReq 包装固定 `false`。聊天的 `MessageResponse.showExportActions` 合同不变。
- `MarkdownTable.showExportActions`、`CodeBlock.showExportActions` 继续控制实际复制/下载动作；UIW 内建代码复制关闭，避免重复工具栏。
- `false` 不渲染表格复制 Markdown、下载 CSV 和代码复制按钮，不禁用正文选择或浏览器原生复制。
- 表格全屏预览、关闭、内部横滚及代码高亮、换行、Mermaid 阅读/预览保留。
- 材料不传外链回调或工作区路径。普通链接保留目标提示但不启动外部产品入口；文档内标题和脚注锚点正常定位。

历史阶段与旧评审会话必须由同一领域阶段判断设为原生 `SessionPane.readOnly`，不挂载可写输入框和输入辅助；“历史只读”的文案不能代替编辑门禁。返回当前阶段才恢复当前会话输入，不改变旧消息或旧报告。

## 更新与验收

文档阅读器通过当前 props 向表格与代码 renderer 传递导出开关，切换为只读时不残留旧按钮；不把 UIW 的节点参数或布尔控制参数泄漏到 DOM。组件不得在条件分支之后新增 hooks。聊天 renderer 的既有 memo 合同不变。

AIReq 依赖图的第三方署名继续可见、可访问，背景与链接文字使用目标语义 token；只在业务图实例内覆盖 React Flow 默认半透明白底，避免深色主题下灰字与灰底近乎同色，不修改通用 Canvas 或隐藏署名。

原生渲染验收要求：默认消费者操作不变；材料 `false` 时表格与代码均无复制/下载，表格仍可预览/关闭/横滚；切换开关不残留旧操作；材料链接/路径不可启动旧入口。实现变更若涉及以下 ignored 源文件，须按仓库规则补专项 hooks 扫描；本次仅同步文档，不执行扫描：

- `packages/ui/src/components/ai-elements/message.tsx`
- `packages/ui/src/components/ai-elements/markdown-table.tsx`
- `packages/ui/src/components/ai-elements/code-block.tsx`

## 第 2 组之前的原生渲染历史观察

以下旧首发、owner 与自动化记录只保留当时场景及证据边界；旧首发创建已被先建提案后手动讨论取代，AIReq 自动化专属能力已裁撤，owner 不是当前业务权限，不据此恢复旧入口或新增通过声明。

主集成实际观察：PNG 首发自动进入 canonical v4 回复／材料；Skill 两文件预览的 Frontmatter 与正文分离，references/checklist、完整路径及只读详情可见。owner 的完整 1440×889 PNG 经左栏折叠、预览 Tabs 和重开仍保留，四字段与 canonical 正文准确且未发送时预览仍为“尚未生成”；改表单后再次准备保留人工补文及 PNG。

需求历史阶段原生没有 contenteditable，返回当前不改变阶段；自动化 Run 仅留下 stopped 演示记录，More“跳到会话”打开无编辑器的只读历史弹窗，task/workpool 及 actor 只读。自动化 JSON／text 输出已通过实际 CodeViewer 截图观察，不以 DOM 文本替代阅读器验收。正式需求同页报告／材料 Tabs、展开、横滚 300 与分栏切行保留；实际 SDK 后台 interval 45 更新时报告事实保持，Escape 恢复焦点，报告适配视口，不外推非零纵滚保持。

依赖图真实选边原因、缩放、指针平移及适应视图已观察；署名对比度 token 修正是实现记录，不从编译推导最终主题截图通过。上述子集不替代导出按钮、链接、memo 切换及专项 hooks 的完整合同，也不代表所有只读／失败场景均已逐一测试。源研究仅作历史依据，材料和静态资源不在运行时读取源绝对路径；无真实文件／Skill 写入或模型执行。最终检查命令、全页主题和连接精确证据统一以根 `todo.md` 为准，工具与设置观察见 `tools-settings.md`。
