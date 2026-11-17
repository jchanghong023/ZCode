# 工具、输入辅助与设置

## 设置结构与布局

设置复用当前 ZCode `SettingsPageFrame`、搜索和基础控件，作为电脑浏览器全页覆盖层，不显示原生窗口控制。侧栏宽 256px，与工作台对齐；顶部返回与底部齿轮均经同一门禁返回工作区。

一级导航为外观、项目配置、AI 配置。AI 配置内使用手动激活 Tabs：AI 模型、Agent 指令、分析设置。Skill 不在主导航、设置导航或搜索中；保留组件不是产品入口。

Shell 持有设置开关及已接纳分区。普通齿轮恢复最后接纳分区，项目配置请求明确进入项目，输入器模型入口明确进入模型。原生偏好映射为 appearance／general／modelProvider／personalization／agentBehavior；旧 skill 和未知偏好回项目配置。门禁接纳后才更新偏好，挂载、取消及保存失败不改记忆。

正文与主页共用所属面板内居中的 `max-w-4xl px-4 lg:px-8`、外观标题角色和顶部基线，正文滚动面使用稳定双侧滚动槽，长表局部横滚。项目配置的 Release 明细默认折叠，数量及添加操作始终保留；重复配置说明进入 disclosure，错误和未保存状态保持可见。

## 唯一离开门禁

主页面、对象、范围及浏览器历史归 `AIReqContext`。设置表单只注册保存／丢弃动作，设置页持有一个 pending 导航；分区切换、AI Tab、搜索、返回、齿轮及 Ctrl／Cmd+S 共用最新草稿、保存路径和同步忙锁。

全部相关草稿保存成功后只消费一次 pending；失败或取消保留原页与输入，丢弃只结清对应未保存修改。在途写入不能并发丢弃和卸载。存在草稿时浏览器关闭触发原生离开提醒，弹窗关闭恢复实际入口或原输入焦点。

覆盖层打开时，原工作区、会话及右侧 Tab 保持挂载但隐藏且 inert，正文、附件、临时选模和未发送输入保留。返回不修改 mainView、对象、范围或 history，不发送消息或创建会话。

搜索仅列当前分区及保留的外观／业务设置项，复用中文、拼音模糊匹配及键盘交互。选择结果先结束搜索焦点锁，再经门禁接纳分区及定位目标，最后滚动、聚焦并短暂高亮已挂载行。普通分区切换清空旧定位，取消保留原定位；不恢复裁撤页面。

## 配置与保存

### 外观

主题、界面字号及代码阅读设置由 `StoreProvider` 的现有 ZCode store 唯一持有，不另建主题状态、系统监听或业务存储。主题为系统、浅色、深色，对应当前 Zai 主题；控件使用现有国际化标题提供可访问名称。

重连替换 services 时保留 store、选择及未发送草稿，释放旧广播监听后绑定当前连接；入站更新沿 applyingBroadcast 防回环。离线选择仍应用本地 DOM 和偏好，广播失败记录可恢复诊断，不声称同步成功；重连不重放离线变更。Provider 卸载释放广播和系统主题监听。

### 项目配置

项目、仓库、默认分支及 Release 通过现有配置服务读取和保存。Release 是业务范围，不是 Git 分支。提交时文本控件保持挂载且只读，保存、取消及归属选择禁用；失败恢复编辑并保留原值。Release 数量只在同来源快照读取成功后显示，读取中和失败不显示伪造的 0。

### AI 模型

配置工作流默认模型及各 Agent 的模型／思考强度。“跟随默认”消费同一默认模型，“模型默认”使用模型预设。未保存摘要从 saved／draft 差异派生；保存／取消作用于完整配置。保存携带预期 revision，冲突保留输入，同步忙锁拒绝重复接纳。保存后的模型配置用于新建会话，已有会话保留原绑定，不重写历史。

### Agent 指令

按 Agent 编辑追加指令，不替换内建指令，空值表示不追加。UTF-8 字节计数和超限使用共享 `USER_INSTRUCTIONS_MAX_BYTES`。切 Agent 保留全部草稿和未保存标记；保存／取消作用于所有 Agent。任一超限或 revision 冲突保留输入，不能由快捷键绕过。已保存指令供新评审和分析读取，不重写已有讨论或报告。

模型与指令复用 `SettingsFormActions`：实心保存、ghost 取消，保存中禁用。成功使用 status 与辅助色，失败使用 alert、错误色及“保存失败”前缀，修改或取消清除旧反馈。共享范围和生效说明精简呈现，完整解释放入现有可展开说明。

### 分析设置

分析设置消费同一 progress scheduler。全局自动分析及各项目开关即时保存，统一分钟间隔显式保存；间隔提供 15／30／60／120 分钟及自定义正安全整数，并校验可表示的下次时间。无效输入阻止保存，后台事件不覆盖未保存间隔，owner 投影到达才结清草稿。

暂停不取消运行中分析，已开启项目仍可手动分析。项目搜索及从运行页定位只改变展示，不修改业务范围。项目和调度分区可折叠，搜索定位先展开目标；模型入口定位进度分析 Agent。保留读取／更新失败、重试及保存反馈。

## 原生输入与 Sketch

可编辑会话复用原 composer、附件、模型／思考／模式及 Submission，不复制输入器或草稿 owner。临时模型选项仅作用于本次提交，不修改平台默认或 Session 默认；接纳后工具条恢复 Session 默认不表示提交选项丢失。只读历史不挂载输入辅助。

Sketch 使用浏览器真实 Canvas，位于全页 Dialog 内的现有 HTML iframe，通过既有路径复制主题及字号变量。保留画笔、橡皮、颜色、粗细、绘制、平移、缩放、适应、撤销、清空和尺寸调整。色块未选中也有可见边界；颜色与粗细以 `aria-pressed` 表达状态，手柄支持键盘尺寸调整并保留画布，不误触添加附件。

“添加附件”生成完整画布 PNG，经原 `onAddFiles` 加入当前 composer，绝不自动发送。父页只接纳当前 iframe 的同源消息并校验 PNG 签名；原附件数量和输入状态门禁继续有效。失败向画布反馈原因并保留绘制，成功接纳才关闭，取消不改原草稿，关闭恢复 composer 焦点。主动作使用 primary／primary-foreground 配对色，绘图本身颜色不随界面主题改写。

语音输入沿现有弹层确认可编辑文字后追加原草稿，取消不改输入；具体服务能力见 [内存后端](../../architecture/mock-backend.md)，不能从录音样式推断真实音频服务。

## 保留但隐藏的 Skill

Skill 设计不公开产品入口，也不恢复目录管理。组件保留原生会话、composer、模型设置、可调分栏、表单及临时文件预览。设计会话按工号、client、项目绑定，无项目使用明确个人范围，不与 IR／SR／Release 混用。

说明包括 goal／when／inputs／outputs、boundaries／references／example 及 notes，字段可空，按原序列保存。准备对话先等说明保存成功，再向原 composer 插入完整说明。requestId／ACK 只确认实际应用，8 秒未 ACK 显示可重试错误；保留人工正文、附件和模型，不自动发送或因回填生成文件。再次准备仅替换完整未改片段，否则追加。

对话／文件 Tabs 保留挂载、草稿和分栏，隐藏时 inert。预览按当前 revision 选择有效文件，frontmatter 与正文分开，原始元数据和非 Markdown 使用同一代码字号、主题、行号及换行设置。

技能配套流程图作为普通预览文件参与同一 revision、逐文件确认与原子保存；不因准备说明而自动生成或保存。原型服务可在内部模拟生成无脚本、无外部资源引用的 SVG 流程说明，并在主文件中引用，不将模拟产物表述为真实 AI 执行证据。保存后的 SVG 与主文件共用 Skill 文件 owner；媒体读取从该 owner 返回实际已保存的原始 UTF-8 字节和 `image/svg+xml`，不把附件 ref 当作文件路径，不另外复制媒体存储或写宿主业务文件。

媒体 MIME 由文件实际内容识别，不能只按扩展名返回类型或伪造字节。可选 `maxBytes` 是完整读取的字节预算，必须为非负安全整数；实际文件超预算明确失败，不截断媒体后宣称成功。缺失、目录或无法识别的媒体内容明确失败。stat、分片与媒体共用同一文件节点的原始字节；内存二进制节点不经 UTF-8 解码再编码。

保存要求有效目标、合法名称、无目标同名冲突，并逐一实际预览当前 revision 全部文件。新 revision 清空旧资格；保存前同步单飞锁拒绝重复激活，operationId 由原 owner 幂等裁决。全部文件原子接纳后才显示 path／revision 收据，失败不显示已保存。项目与共享目标分别查重，不提供重命名覆盖旁路，旧响应不能确认新版文件。

说明待结清和未确认预览共同注册原门禁，不能以说明保存绕过预览资格。“保存并离开”不可用时明确原因；失败后允许显式丢弃本版确认保存，但不删除临时预览、会话、未发送正文或附件。新 revision 再次要求确认。

## 实现依据

- `packages/ui/src/aireq/shell/AIReqShell.tsx`
- `packages/ui/src/aireq/settings/AIReqSettingsPage.tsx`、`AIReqProjectSettings.tsx`、`AIReqAgentModelSettings.tsx`、`AIReqPersonalizationSettings.tsx`
- `packages/ui/src/aireq/tracking/analysis/AIReqAnalysisSettings.tsx`、`AnalysisSettings.tsx`
- `packages/ui/src/aireq/tools/AIReqSketchButton.tsx`、`sketch.html`、`AIReqSkillDesignPage.tsx`、`AIReqSkillFilePreview.tsx`
- `packages/ui/src/store/StoreProvider.tsx`

公开接口不会因隐藏组件或通用控件存留而扩展；部署和真实服务能力边界集中见 [内存后端](../../architecture/mock-backend.md)。
