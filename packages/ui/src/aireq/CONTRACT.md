# AIReq UI

在线人员遵循 `docs/specs/aireq/section-navigation-and-ideas.md` 的全系统在线人员规则：服务端连接 owner 唯一持有工号／IP 引用计数，readPresence 读取带 revision 的快照，presence 事件推送相同投影；客户端只读并忽略旧版本，不新增认证、工作流或 v4 状态。

公开入口为 `AIReqApplication` 与 `AIReqApplicationProps`。前端只消费 `@zcode/services/aireq` 的正式数据源与现有原生 v4 会话，不保存第二份业务事实。

## 导航与范围

`AIReqContext` 唯一持有项目、具体 Release、对象选择、页面、提案任务与浏览器历史。提案入口为需求工作台，独立任务和审查详情通过同一 owner 导航；任务参数仅属于 UI 历史与对象 URL，不增加业务 owner 或服务端选择 DTO。侧栏选择项目及 Release，无全部版本选项。全局页面为项目总览与想法池；项目内页面为当前项目、需求共创、我的待办、开发任务和进度分析。没有显式目标时进入项目总览。

待办先按当前项目和具体 Release 过滤，再统计和筛选我的／待认领／全部；概览统计同范围全体人员。待办的需求名、SR 名和职责来自服务端同源投影，分配使用实际 assignmentPerspective，不从文案猜测，不提供勾选完成状态。

导航、历史、项目／版本切换、设置往返和退出均消费唯一未保存门禁。Context 不建立项目读取缓存或平行范围。读取以代际拒绝迟到结果；业务事件只使投影重读，重连不自动重放写入。

当前项目的上下文返回来源仅由 Context 导航状态持有，并随同身份、会话的浏览器历史恢复；仅显式从概览打开目标时产生。侧栏直达、切项目／Release 清除来源，返回复用 select 与既有门禁。Shell 保留同范围概览挂载以保存筛选和滚动，不保存第二份业务投影；返回带使用既有顶部空间，和正文列对齐。具体规则及验收见分区导航规格。

## 工作区

进度分析的[页面规格](../../../../docs/specs/aireq/section-navigation-and-ideas.md#页面与正文)要求有具体 Release 才可查询和执行分析。当前 `AIReqShell` 的无 Release 空态覆盖需求共创、开发任务和我的待办，进度分析页仍会发送未指定 Release 的过滤条件，由服务端按项目全部 Release 查询。

想法池导入／导出单列原始需求 CSV；正式导入只发 `importIdeas`。转入选定版本经正式命令原子创建提案。需求共创的新增与批量导入立即创建提案，不自动运行 AI、拆 SR 或批准；业务 Markdown 只对应新 IR 的 requirements.md。

讨论复用原生会话。用户从需求澄清或方案设计提交当前材料版本后才启动对应评审。评审页读取材料校验与执行事实，只重试当前失败或缺报告的尝试；当前完整报告可供业务确认或三方分别确认，意见不作门禁。需求确认固定项目、IR、评审 ID 与材料摘要，已失效时重新阅读后才能再次打开。第三个角色确认后，只在交付弹窗核对完整清单并授权后提交当前文档 PR 候选。历史、旧版本及 PR 冻结材料只读。提案转正后，正式需求页显示每个 SR 的实际开发分支与失败原因，只重试失败分支。

右侧统一多 Tab 由 `side-pane/AIReqSidePaneContext.tsx` 管理，报告、材料、历史与分析共享打开、激活、关闭、恢复、排序和完整视图控制；每个 Tab 保留自己的对象和 Release。Tab 注册离开门禁，不建立第二份业务 owner。具体契约见 `docs/specs/aireq/unified-side-pane.md`。

当前 `AIReqWorkbench` 在首选材料的内容摘要变化时会重置文件选择。材料重试请求仅携带目标和路径，当前材料的反馈也没有绑定内容版本。历史依赖图仍收到当前 IR 的方案轮次和 SR 清单。目标规则见[材料阅读规格](../../../../docs/specs/aireq/unified-side-pane.md#材料阅读)。

## 身份与展示

`zai-motion` 与既有主题共用 store 和广播路径。浏览器首屏和 store 使用本地保存的有效选择，缺省为 `zai-motion`；只有本地用户切换会保存主题，广播不覆盖本地选择，重连不重置 store。`AIReqMotion` 只负责本地装饰和一次性动画。减少动态效果或性能模式开启时停用主题动效与新增指针监听。行为见[默认动效主题](../../../../DESIGN.md#默认动效主题)。

Web 入口固定同一 clientId 供 AIReq identity、WebSocket、v4 握手和命令信封使用。全部合法工号可读取共享已发消息及附件，并执行满足对象、版本、幂等及阶段门禁的操作；负责人用于分工和待办派发。原生 composer 按工号、客户端、工作区和会话隔离私有草稿、未发附件及输入历史。断线保留同工号的会话绑定，显式恢复仅重读原有会话，不重放命令。见[连接身份规格](../../../../docs/specs/aireq/connection-identity.md#2-工作区与会话)。

现行设置包含外观、项目配置和 AI 配置三个入口。目标一级入口见[文档格式规格](../../../../docs/specs/aireq/tools-settings.md#文档格式)。AI 配置含模型、Agent 指令及分析设置。共享模型和指令使用编辑基线和草稿门禁。当前 AI 配置仍列出 Skill 设计角色，Skill 私有会话、附件、预览及保存链保留在现有实现中。进度分析的项目开关当前使用「自动分析」文案，实际同时控制项目的自动和手动分析。目标角色和文案见[设置规格](../../../../docs/specs/aireq/tools-settings.md#agent-角色)。Sketch 保留真实画布及 PNG 附件。

Footer 业务桥复用通用 footer 的展示端口，仅提供当前工号、切换、帮助和主题等辅助工具；不挂载旧账户交易菜单，不消费后端来源元数据。页面共用居中内容列与主题 token。工具错误展示安全正文，不把错误码当用户文案；MR 平台核验只读取正式布尔事实，不由状态或链接推断。

业务规格见 `docs/specs/aireq/section-navigation-and-ideas.md`、`proposals.md`、`tracking.md` 与 `tools-settings.md`。公开服务边界见 `contract-design.md`；部署限制见 `docs/architecture/mock-backend.md`。
