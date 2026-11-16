# AIReq UI

当前产品规则以根 `.todo.md` 第 1–172 行已确认要求为准；其已完成任务与收口记录保留各自历史版本边界。

公开入口为 AIReqApplication 与 AIReqApplicationProps；替代旧聊天产品，不并行挂载 Root/App。

工作台与设置各呈现固定 68px 图标侧栏，切换时使用相同位置并释放正文空间；两者保持独立导航和既有未保存门禁。

共享业务事实仅归 aireq-contract 所描述的服务端 owner。shell 仅持有可失效读取投影、导航和未发送草稿；每次调用显式 identity。元数据和选择读取用代际阻止晚响应覆盖，后台重读不卸载工作区。已有二进制连接按后端和工号建立，项目切换不创建连接；重连只重读，不重发操作。设置的未保存门禁先于导航和退出。基础控件、主题、Provider 和 v4 会话复用当前 UI。

所有合法工号均可修改共享配置及执行满足现有门禁的业务动作；不以固定工号或负责人字段只读，backend.owner 仅为模拟来源。模型／提示词预期版本及脏草稿门禁继续保留。Skill 设计暂从首页主导航隐藏且不测试，不在设置导航或搜索中，旧 `skill` 设置偏好回到项目设置；保留其现有实现和数据。AIReq 自动化主导航和专属数据源裁撤，保留通用控件。

当前可达接口收口以 `docs/specs/aireq-migration/contract-design.md` 的同名章节为准：五个可见导航、四个设置页面、原生 v4 会话／附件与隐藏 Skill 保留；旧 SettingsPage、迁移／数据同步、命令／Hook／Memory 管理、旧插件商店及本机 Host scope 消费链退出。未启用的桌面扩展与受管 worktree transport 接线随接口删除，不以空服务或假返回值维持旧入口；纯展示控件与基础布局／表单资产保留。

Skill 草稿动作可向唯一离开门禁提供当前预览保存阻断原因；原因由 Skill 编辑器校验状态派生，门禁仅展示。

Footer 业务桥仅为 `shell/AIReqWorkspaceFooter.tsx`，复用通用 `WorkspaceSidebarFooter` 的可选 presentation/menu ReactNode 端口；默认通用 footer 行为保持不变。自定义菜单隔离账户、用量及 entitlement 查询，不挂载旧 Coding／Office／登录菜单，也不伪造 UserInfo。业务桥只读既有 context 和 data-source 元数据（含 backend.owner／provenance），项目／Release 选择经 ai.navigate 进入唯一未保存门禁；不保存第二份选择。公开 props 为 onOpenSettings、onManageProjects、onLogout、onHelp 和可选 settingsButtonMode（settings／back）；管理明确打开项目设置，普通齿轮由 shell 恢复当前设置页，back 由 shell 执行受保护返回。主题复用当前 ZCode store 与原生主题菜单；设置 footer 仅保留身份、切换工号、帮助和主题，不导入设置页 section 类型。

onHelp 可接收当前 footer 的 HTMLButtonElement（或 null）；各实例自持触发 ref，不共享不稳定的工作区／设置 ref。`AIReqWorkflowHelp({open,onOpenChange,returnFocusRef?})` 只呈现当前业务说明并在关闭时恢复触发焦点，不持有业务状态或导航；不得沿用旧四阶段、IR/change 或旧完成门禁。

## 第 3 组项目进度与导航

六个真实导航依次为项目进度、待办列表、正式需求、需求提案、进度分析、Skill 设计；登录及刷新默认项目进度（Skill 当前隐藏规则见上文）。主页面共用宽于设置的居中内容列和标题起点；设置保持原生设置内容列。`AIReqMainView` 的 `projectProgress` 挂载真实项目页。项目页只读既有 `readWorkflow` 返回的可选 `view.projectProgress`，经本模块 `contract.ts` 转出 `AIReqProjectProgress`／`AIReqProgressSummary`；不增加 RPC、聚合写入或本地业务缓存。

全项目表始终读取各项目的 `total`，展示项目名称、提案数、正式 IR 数及总进度。下方当前项目详情只使用 Context 唯一项目／Release 选择：全部 Release 读 `total`，具体 Release 读同项目 `releases` 的对应汇总；详情列出全部正式 IR 原文、Release、SR 数、未分析数与进度，并复用正式 IR/SR 同页报告入口。无正式 SR 的 `percent: null` 是空态，不是 0%；缺少投影、读取中及错误也不得伪造 0。

项目进入、Release 选择和报告导航消费既有未保存门禁与历史；前进／后退恢复项目及 Release，不把旧项目 Release 用于新项目。无项目／Release 提供项目设置入口，不自动创建、不选择其他项目兜底。项目页不持有第二业务筛选事实，报告和聚合随既有 owner 事件重读，同一读取代际规则继续生效。项目页与帮助按当前 locale 提供中英文，复用现有主题、字号及电脑布局控件。

## 第 2 组交互合同

登录默认“项目进度”；第 2 组原有四页现已接入上述六导航，依次为项目进度、待办列表、正式需求、需求提案、进度分析、Skill 设计；历史默认待办／五导航／设置 Skill 仅描述当时版本，不是当前入口要求。正式／提案／分析共用项目及 Release，支持全部 Release 读取、具体 Release 创建；待办跨项目。项目／Release 与前进后退消费同一未保存门禁，不自动建项目或偷偷切其他项目。

提案工具栏为新增、导入、导出，表格为提交人／原始需求／提交日期／状态加讨论操作；不挂旧侧栏提案列表或独立新建导航。保存短需求后刷新并留表，不生成 SR 或 AI，失败保留输入；主动讨论才绑定阶段会话。UTF-8 单列 CSV 模板、预览、整批校验、重复提示及全匹配原文导出均走业务 owner；材料阅读器仍只读无导出按钮，二者不能混为同一导出规则。

`shell/remote-data-source.command` 是缺省操作 ID／预期版本的唯一补齐点，保留表格显式 ID；不在 Context 和多个按钮重复准备。命令失败保留具体错误，不被后台成功重读清除；新增／CSV 的显式版本重读保留输入、预览与操作 ID，没有自动写入。完整审查完成后实际选择综合原生会话，方案讨论不能伪选综合头像；旧结果拒绝展示 owner 的原因、轮次／版本及时间，不从旧结果恢复批准。

一个 IR 详情复用阶段对话／只读材料；每 SR 可切独立 change 全材料和测试方案，无 SR 开发聊天或执行按钮。前置单评审与完整三路／终审分开，人工放行后分别显示三个同版视角确认，同人兼任仍三个动作；修改业务／方案／测试材料显式走正常 mutation 并显示整包失效原因。历史、旧版本及 PR 冻结版只读，需修改先关闭未合并 PR。

正式 IR 主行展示短需求、Release、状态及进度，SR 子行展示负责人、有效进度、分支、最新审查及操作，沿用同页报告／材料面板。分析页读取同一最新成功报告；原 AI 分与有效值分开，合入固定 99，人工测试通过才 100。失败问题不能直接再通过；新修复合入待复测后验收。只在整个 IR 全部 SR 100 时预览清理清单并二次确认，逐项显示失败、只重试未成功项。

待办显示我的／待认领／全部，点击定位 IR/SR 及阶段；联系人可指定／领取，代办只留实际操作人、不改负责人、不引入权限。待办是服务端投影，不增加本地勾选完成状态。模拟控制始终标明模拟，经现有 data source 正常操作，不直接改业务投影或设置 100；刷新重连不重放写操作。

当前场景和证据边界见 `docs/specs/aireq-migration/integration.md` 当前组；本合同／示例不表示真实浏览器或工程检查已经执行。
