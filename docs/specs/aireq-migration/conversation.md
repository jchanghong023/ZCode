# 原生对话适配

## 边界与唯一所有者

AIReq 页面只导入 `aireq/conversation/AIReqSessionPane`；调用者维持现有 V4PaneConversationProvider 的明确 scope。v4 不导入 AIReq；SessionPane 增加可选 `conversationExtension`、embedded、composerPlaceholder、composerAriaLabel、conversationEmptyState、externalTextInsertRequest、onExternalTextInsertApplied、composerInputPreview、onInputPreview、composerTools、composerTrailingTools。未传端口时保持当前原生行为。原生 Draft owner、附件上传/移交事务、临时模型与思考等级、命令 registry 和订阅水位继续是唯一事实源，不新增聊天存储。

`conversationExtension.prepareFirstSend(text, options, preparedSessionId)` 在显式首次发送等待原生预热 binding 就绪并占用 promotion 生命周期后，把同一 sessionId 登记为 provisional；`openFirstDiscussion(text, options, preparedSessionId)` 将其传给 `createProposal.preparedSessionId`，返回的 sessionId 必须相同。SessionPane 在 dispatch 前登记首发结算回调；accepted/duplicate ACK 或权威接纳帧只授权原 Composer 结算，原附件 adopt 与草稿结算完成后才消费对应 commandId 的回调、提升 binding 并由 `onFirstSendAccepted(sessionId)` 发布提案选择，不走普通任务发布路径。创建使用页面稳定 clientDraftId，失败重试复用 provisional，不自动重发。未知回执的显式重试复用现有 pending command registry 的 commandId/clientId/issuedAt；原输入未核实时拒绝改写 payload。此端口不在 effect、挂载、刷新或重连调用。正文、附件与模型配置由原 Composer 冻结，拒绝由原事务恢复；已接纳正文不再恢复。首次提交不切换组件或草稿 scope，避免源端 open/take/finish 跨组件 handoff 的附件所有权竞态。

首发复用既有原生预热 draft session，不再分配第二个消息／附件目标。`prepareFirstSend` 接收原生预热 sessionId，`createProposal.preparedSessionId` 仅在显式发送中携带；mock 核实该 session 由当前连接操作者在同一 workspace 创建，再把它登记为 provisional 的业务讨论会话。预热本身不创建提案。这样附件先在原生草稿上传，接纳后仍引用同一 session 的真实字节；失败保留原草稿和附件，不放宽跨会话／跨操作者的附件校验。创建、订阅及附件操作使用同一请求 workspace，不能让 createSession 回退到 mock 默认目录而在订阅时使用业务 workspace。

已接纳会话的共享边界由 canonical workflow 唯一裁决：精确 session ref 必须仍归属于已发布的提案／正式需求及其历史，`pendingFirstMessage` 必须为 false；仅登记预热、绑定 proposalKey 或创建 provisional 都不代表发布。原生 bridge 只暴露此只读谓词，不另建 actor allowlist。发布后其他 renderer／employee 可以通过原 binary/ws RPC 读取同一 session 的 canonical rows；原始 prepared-draft owner 与首发收据仍保留，私有预热、失败首发及 Skill 会话不因此共享。所有读取仍核实原 workspacePath／workspaceIdentity，不因 sessionId 文本相同放宽隔离。

附件字节仍由原生 owner 唯一持有。跨 actor 读取必须同时满足上述已发布会话谓词、字节的 session/workspace 归属及 canonical userInput 行实际采用该 ref；传入 target.rowId／entityId／attachmentIndex 时必须精确匹配。队列、pendingStartInput 与已上传但未采用的附件只供原上传 actor 读取，不能因同一会话已经发布而泄漏。上传、abort 与新 Submission 的附件校验继续核实当前 actor，禁止把别人的已发送 ref 重新作为自己的附件提交。首发仍使用同一 sessionId、workspace、commandId 与收据，不删除 nativeDraft 记录、不重发、不创建替代会话。

临时模型与模式属于本次 Submission，不是会话默认值。SessionPane 只为 followupMode 同步 Session 配置，显式发送将 Composer 冻结的 modelSelection／mode／planEnabled 随 sendText 原子提交；不通过 switchModelConfig 或业务提案提升改写共享 Session。mock 接纳后将该配置保留在原生 userInput 行，队列提升沿用队列项配置，模拟回复使用对应输入的模型；业务 session.modelConfig 仍保留角色创建快照。首次接纳后工具栏恢复会话默认值并不能证明本轮选模丢失，必须通过原生 conversationRowsRangeV4 读取对应 sourceCommandId 的 userInput.modelSelection（包括 reasoningLevel）和回复模型核对。拒绝重试仍保留原文、PNG、session 与命令身份，不另发消息；平台默认、新草稿和历史会话不得被本轮临时选择改写。

业务首发幂等 ID 由 UI 草稿槽与当前原生预热 sessionId 共同组成。同一预热首发的显式重试保持同一 ID；完成首发后在同一项目／Release 新建另一提案时，新的原生草稿必须产生新的业务 ID。不能永久把“项目＋Release”这个输入槽当作一份提案的幂等 ID，否则第二份提案及刷新后的新提案会错误命中旧记录。

## 输入辅助

外部草稿使用既有 externalTextInsertRequest 与 requestId ACK，仅回填不发送。append 模式仅替换完整存在的 replaceText，否则追加；相同全文已存在时不重复插入。onInputPreview 提供完整 canonical text，不从摘要猜测匹配。composerInputPreview 仅在非空全文 trim 精确匹配时显示摘要，完整编辑器保持挂载。composerTools/composerTrailingTools 接收 appendText（实际插入成功布尔值）、addFiles（实际接纳 ID）、disabled、focusInput；扩展位置和展示服从当前 ZCode 原生输入器，不以 AIReq 的按钮坐标或顺序判定视觉保真。语音示例追加当前编辑器，Sketch 完整 PNG 走既有附件管线，不创建业务对象也不发送。取消和失败不改原输入。临时模型/思考选项、附件预览使用目标当前实现，不复制旧 v4。embedded 取消旧任务推荐及新草稿居中，不重建输入框；评审会话通过 autoFocusEnabled=false 不抢焦点。

## 事件顺序与隔离

显式发送 → Composer 冻结并 claim 原草稿 → 业务 provisional（稳定 clientDraftId）→ 预登记首发结算回调 → 原生 sendText/命令 registry → accepted/duplicate ACK 或权威接纳帧（两者无先后保证）→ 原正文结算及附件 adopt → 消费同一命令的首发回调并发布业务选择。此前真实 PNG 首发已接纳且产生回复／材料却留在空草稿：权威帧先完成唯一结算，而旧实现在 ACK await 返回后才登记回调，后续结算因 finalized 提前返回，导致选择未发布。登记已前移至 dispatch 前；主集成实测 PNG 首发自动打开 accepted 提案 `draft-demo-245` 及 canonical v4 回复／材料，同项目下一份独立提案 `draft-demo-248` 也自动打开，无需侧栏补救。因此不能把登记放在 ACK 之后，也不能为补偿导航重发消息。已知拒绝 ACK、provider 拒绝或未发出命令的失败清除对应回调；未知回执保留迟到权威结算，不自动重发。旧命令结算不得消费新命令的回调。业务原生工作区使用服务端项目 root 与 `aireq-mock:<projectId>`；私有草稿槽才按 client/employee/project/release 隔离，不能把私有槽当作 workspaceIdentity，项目或身份变化不能复用草稿。已接纳消息只从现有 v4 snapshot 渲染，业务列表只从服务重读。晚到操作不得改变新选择。

纯浏览器 File／Sketch PNG 通过 attachmentPut 预上传，`staged=false`，不进入主机 localPath 暂存移交；此次保留原生 Composer 单次 finalize／adopt 语义，不增加附件重试队列或再次发送。主机 staged 附件的 transfer/adopt 异常处理属于既有独立路径，本次不改其语义，也不把它描述为浏览器 PNG 的可达失败。

显式“重新连接”先等待可选 `onBeforeReconnect(): Promise<void>`，业务宿主只恢复当前确切 session 对应的可重读事实，成功后再重试原 v4 lease；失败停留并保留原故障与输入。回调不能恢复其他历史／自动化／Skill 会话；等待期间切换 pane／session／workspace 后不得重试新目标，不自动重发消息或创建会话。未提供端口的通用消费者保留既有重连语义。

## 源端可达性裁决

源 `AIReqNativeSurface.tsx:24–38` 明确两种数据源都没有 native-surface 传输，hook 永远不提供 target/snapshot，predictionAction 直接拒绝。因此源 AIReqNativePredictions 虽被 Composer 装配，实际上永远不显示，不是当前可达产品功能；tools-settings 的输入建议验收只适用于未来存在真实能力的情况。本次不制造预测样例、不添加第二传输，也不迁移 ANSI widget/header/footer 的不可达占位层。

已实测连续两次首发自动导航、同 owner／workspace 预热和浏览器非 staged PNG 上传；发送拒绝保留正文与完整 PNG，明确双击重试只接纳一份提案。Skill 的完整 canonical 草稿、摘要匹配、人工补文、表单再次准备、Tabs、左栏折叠及 1440×889 PNG 均保留，未明确发送时不生成文件。“管理模型”往返保留原正文、PNG 与临时选模，工作页隐藏且 inert，不自动发送；Sketch 取消与语音示例追加不改变业务阶段。

跨客户端实测 `draft-demo-36` 的同一原生会话只有三行（turnHeader、userInput、assistantText），输入记录思考等级 medium，业务角色创建快照仍为 high；第二员工读取同一回复及 32996 字节、1440×889 PNG。错误行、附件索引、workspace 和 ref 均被实际 RPC 拒绝；独立 Skill 会话的其他 actor 原生读取及业务读取也均被拒绝。显式会话故障重连恢复原 session，不自动重发。完整命令、浏览器覆盖、模拟边界及证据限制统一记录于根 `todo.md`。

## 原生输入工具扩展

提案和 Skill 通过同一原生输入扩展提供语音示例与 Sketch；上下文、模式、模型、发送及扩展布局均复用当前 ZCode Composer 的原生实现和插槽，不复制源输入器、不以原版几何或按钮坐标验收。未使用扩展端口的通用消费者保持不变；不新增草稿或发送链。只核对功能可达、失败保留输入、辅助输入不自动发送及当前 ZCode 的显示规范。
