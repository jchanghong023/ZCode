# AIReq mock

在线人员遵循 `docs/specs/aireq/section-navigation-and-ideas.md` 的全系统在线人员规则：服务端连接 owner 唯一持有工号／IP 引用计数，readPresence 读取带 revision 的快照，presence 事件推送相同投影；客户端只读并忽略旧版本，不新增认证、工作流或 v4 状态。

正常文档 MR 的内部模拟事实与交付候选同属 workflow owner。publish 只登记 opened 及真实服务时钟的最早合入时点；既有五秒轮询推进模拟外部状态，再复用当前候选、完整材料与版本核验转正。opened 至少保留十秒，幂等发布不重置，关闭交付后迟到结果无效。platformVerified 保持 false；simulatedMr 与既有故障场景字段一样由 publicBusinessProjection 递归剥离，不增加 RPC 或测试 setter。

分支创建的内部依赖对新 IR 首个 SR 的首次推送保留一次暂时失败，显式内部故障输入优先；公开 retrySrBranch 复用原合入基点进行下一次尝试。branchCreationAttempts 同属内部 owner 并递归剥离。会话与项目热查询使用 workflow-queries 的无缓存只读投影，当前 state 由 workflow 即时传入；不建立第二份可写状态，也不派生全局待办或进度报表。

想法批量导入 `importIdeas(originalTexts)` 由现有 workflow 克隆事务唯一持有：全批非空校验、按批次 revision 和行序分配独立编号、使用实际操作者及服务时间、同一收据提交后广播。任一无效全批回滚，同操作重试返回原回执；不要求项目版本，不创建会话／提案或运行 AI。

想法池与转入版本按 `docs/specs/aireq/section-navigation-and-ideas.md`，业务事实归现有 workflow owner。一次克隆事务中校验全部项目／版本和想法 revision、建立独立提案、移除想法并形成收据；失败回滚，提交后广播，同操作重试复用既有回执。原文和原始提交信息进入各版本提案，实际转入操作者记录在操作回执中。

初始业务数据按 [原型后端业务初始数据](../../../../docs/architecture/mock-backend.md#原型后端业务初始数据)组织，数量与待办只从各 owner 的事实派生。提案导入导出按 `proposals.md` 的契约：`importProposals.proposals` 原子接纳短需求及可选 IR 业务 Markdown，正文仅落在新 IR 的标准 requirements.md，计算真实摘要，不导入其他材料、SR 或批准；沿用版本、幂等与提交后广播。

单一进程生命周期内存 owner 持有共享项目、Release、提案、IR/SR、材料、两类评审、三方确认、联系人、报告、合并／验收问题、分支、配置、Skill 和调度任务。Issue 专属状态、调度、操作、事件及模型角色已裁撤。服务重启恢复样例；关闭连接不取消已接纳工作。每五秒核验文档 PR 的候选、版本与当前完整材料，待合并／关闭不转正。

公开 `MockAIReqService` 实现 `@zcode/services/aireq` bootstrap/call/onDidChange；所有普通调用显式携带合法工号和 clientId，全部合法工号可操作，backend.owner 不授予权限。写操作按各自实际签名保留对象归属、阶段、版本、幂等及参数校验，不承诺所有写入都有 CAS／operationId。`getConnectionServices` 为原生会话逐连接绑定不可变身份并保留既有连接 scope；ALS 仅传递请求上下文，不保存全局当前操作者。
原生命令的 envelope.clientId 除了匹配 v4 握手，还必须匹配 HTTP 连接固定的 clientId；握手自报值不构成覆盖连接身份的授权。接纳后的队列与用户行沿原来源传递，查询、恢复、重试和其他客户端的提升动作不得改写该来源。

业务 `command` 在首次接纳前校验 revision；幂等摘要只比较目标与业务参数，排除 `expectedRevision`／RPC revision。同操作重读版本后优先返回已接纳回执，业务参数变化仍拒绝，不能因 ACK 丢失重复创建 IR。UI 显式重读保留输入及操作 ID，不自动重新发送。

远程白名单为 29 项。bootstrap 提供模型／提示词设置和 revision；前端本地读取端口及 `models.save`／`prompts.save` 的 expectedRevision CAS 不变。

`models.save`／`prompts.save` 没有 operationId；`skillDesign.saveDraft` 及 scheduler 的 `setProjectEnabled`／`configure`／`runNow` 没有请求版本或 operationId，维持当前覆盖保存／调度去重语义。其他操作只按已有签名提供相应版本及回执保证；内存回执不保证跨重启 exactly-once。所有 mutation 均不自动重放，不为理论持久保障扩展接口。

模型目录 facade 将底层 `getView`、`refresh(reason)` 的返回映射为同一 AIReq 供应商／模型目录；刷新实际调用底层 refresh 并传递 reason，不能退化为 getView。目录 revision 仅表示本进程刷新观测，不推进模型配置业务 revision，也不声称刷新真实供应商。

配置保存、分析设置及负责人分配成功后，使用 `@zcode/services/logger` 的现有 `createServiceLogger` 记录实际工号、clientId、操作名和时间；不记录配置正文、提示词或材料。业务动作收据保留实际身份，原有人工决定／进度记录保留操作者，来源 owner 不代替实际操作者。

原生 rows、附件字节、队列、订阅、水位、帧唯一归现有 `MockRuntime/MockZCodeAgentService`；本模块仅提供 admission/completion/seed 业务回调，不建立另一套会话存储。保留需求、评审、方案及隐藏 Skill 的完整内存流程，Skill 不提供导航／设置／搜索入口。AIReq 自动化专属 owner、manifest 和 task/workpool RPC 裁撤，分析调度与通用设施保留。拒绝退休自由聊天、开发执行及验收 Agent 动作。真实能力和上线限制只记部署／交付文档，公开回复和材料仅陈述实际接纳的输入、材料、状态与版本，不宣称未发生的外部执行。

原生完成回复只确认已接纳输入及本次材料版本变化，不把固定内容归因为真实模型分析；评审追问不修改报告或人工决定。无实际规划建议时不初始化 AI 规划，人工配置沿用正式保存动作。Skill 保存由现有 owner 原子登记实际文件内容，收据 path/revision 必须与随后 list/read 一致；失败保留草稿且不产生保存收据。
Skill 已保存正文以 skills owner 的文件映射为唯一内容源；通用虚拟文件服务经本模块公开只读节点接口投影目录与文件，不复制一份保存状态。项目目标和共享目标的祖先列表、stat 与 UTF-8 读取保持一致，目录不能作为文件读取；保存失败不写入映射。

原生完成回调失败不会撤销 accepted 输入或假报完成：assistant 与轮次分别记录 `failed`，会话以可再次输入的 `completedInterrupted` 收口。复用 `businessFailureMessage`：显式安全领域错误保留可操作原文，未知异常仅服务端诊断保存详情；实时帧与历史使用同一安全正文，不包含任意异常 message／stack。输入 ACK 仅表示接纳，随后新消息仍可正常完成。

缺失原生身份返回重新进入工作区的安全业务说明；他人未发布草稿返回不可访问说明，身份／草稿归属判断与已发布共享读取规则不变，不把 fault／INVALID_IDENTITY 字符串当正文。

MR 生产者通过同一公共 `aiReqPrFactSchema` 生成正式布尔核验事实；本后端记录保留 `platformVerified:false`，不得因 DTO 支持 true 而虚构外部核验。提案历史、SR 与整体验收共用同一事实类型。

v4 信封与封闭 payload／firstInput／answer／create config 拒绝未知键；args／content 仍为显式扩展字典。原生 owner 的 conversation 订阅和 rowsRange 从 shared 严格 schema 派生扁平目标校验，先验证原始请求，再预热、登记订阅或读取恢复；保留连接 scope 注入的可信 carrier，不剥离非法客户端键后执行。

## 业务所有权

提案八态由 `@zcode/services/aireq` 的 `proposalState` 统一按当前有效材料、评审、人工／三方确认和候选 PR 事实派生，服务端不保存第二份八态字段。接纳原始需求与方案动作时使用同一事实分类，同时保留报告、材料读取、版本、幂等和已发布 PR 冻结门禁；原 `status`、`proposalStage` 仅保留生命周期与讨论路由职责。转正移出 `drafts`，不生成“已转正”提案状态。

原始短需求 `originalText` 独立保存，新增／CSV 只创建可见提案，不启动 AI 或生成 SR，不等待首发聊天。导入先校验完整批次、当前项目及具体 Release，提交人和时间取服务端实际请求。进入讨论后才使用已有原生业务完成回调生成材料；回调绑定对象、阶段、轮次和版本，不接纳旧结果。

IR 固定包含业务需求 Markdown 和依赖 JSON；每个 SR 的独立 OpenSpec change 包含提案、设计、任务、规格和测试方案。内存 workflow 通过 `saveDocumentFormats` 按现有版本门禁提交全局六种 Markdown 的章节规则。需求检查只处理 IR 正文，方案检查只处理 SR 文档及依赖 JSON，检查失败保留路径、原因与材料供修正。规则变化不重算已检查材料。导入的 Markdown 原样保存并作为需求材料检查，短需求／CSV 不启动检查或 AI。具体规则见[提案规格](../../../../docs/specs/aireq/proposals.md#材料格式校验)。

讨论、导入和修订材料事务仅生成或更新文件与检查结果。人工 submitProposalReview 绑定项目、IR、评审类型和当前快照，文件校验成功且不存在当前轮次才接纳评审，运行结果只回写仍匹配项目、IR、轮次与快照的评审。`runRequirementsReview` 和 `runFullReview` 仅重试失败或缺报告的当前轮次。单路需求评审报告完成后由业务人员确认，方案 A、B、C 三路报告齐备后才运行综合终审；完整可读报告中的负面意见不阻挡人工确认。方案的三个角色按评审 ID、摘要、版本保留各自首次有效确认，可由同工号承担多个角色。最后一项确认准备完整文件候选；仅显式发布提交文档。

材料变更撤销相应检查、评审与确认，保留历史及失效原因。仅方案材料变化不重查业务文件，不撤销需求评审及确认。文档 PR 打开后冻结候选；未合入时关闭并归档，旧候选的迟到结果无效。只有同候选的材料版本与完整清单核验一致才转正并保留同 IR/SR，各 SR 开发分支使用文档合入提交为基点，独立记录结果及重试失败项。正式范围新增另建 `sourceIrId` 关联提案，不重新拆分或跨 Release 迁移。

当前材料读取重试绑定项目、Release、IR、路径、正文摘要及材料轮次，旧请求拒绝，不修改其他版本或历史。材料快照在变更前复制正文、IR 文档路径、方案轮次和 SR 编号、名称及文档路径；历史阅读不从当前对象补齐快照缺项。

报告仅由此 owner 统一写回。分析指纹绑定 SR 材料、任务、代码／默认分支和合并事实，未变可跳过；失败保留上次成功报告并标记失败／过期。首次代码合入后停止分析，迟到结果只留在执行历史。工作流保存的首次合入版本不随默认分支的新提交而变化。

首次合入使 SR 进入待验收，进度为 99%，不要求成功分析报告。`progress.recordTest` 仅接收验收通过，校验正式 SR 归属、预期修订和首次合入版本，记录非空依据、实际操作者、时间及版本；相同操作重放不重复登记。完成后进度为 100%，测试待办消失。全部 SR 完成后才能预览并确认清理登记分支；逐项保留错误，执行 CAS 与操作幂等，保护主分支及历史，不改进度。

定时接纳使用唯一调度 owner 的真实服务时钟 `tick()` 与配置 `intervalMinutes`，没有运行项也检查到期任务；后台五秒检查不等于业务时间推进。退役的 `progressScheduler.advance` 及场景调度不可公开调用，不接受浏览器推进模拟时钟；隔离后端内部验证输入也必须消费同一去重、指纹与版本路径，不冒充真实等待间隔的验收证据。

全局开关只暂停自动接纳，项目开关同时约束自动和手动接纳；新项目默认关闭。已接纳的执行不受后续开关或配置保存影响。批量资格计数与接纳使用相同门禁；单项重试绑定可重试失败的精确项目／Release／IR／SR。已成功分析的相同业务输入仅在手动请求且有效模型、思考强度或追加指令有变化时再次分析，不比较全局配置或工作流修订；执行历史保留每次接纳的快照和未采用的结果。

文档 PR 的 checkedAt／nextCheckAt 及重复状态消息只更新观测投影并发失效事件，不增加业务 revision；仅 MR 实际状态或转正等业务事实增加 revision，避免无关轮询让验收／清理弹窗永久失效。真实业务 CAS 与代码版本门禁仍执行。

联系人／负责人可指定或领取、可同人兼任，代办不暗改归属，操作留实际工号。待办由第一手事实派生，不保存独立完成状态；未分配待认领，AI 正常运行／等合并／等调度不制造待办。共享业务更新提交后发事件，客户端重读，重连不重放。

`prototype.*`、故障控制和场景时钟不属于公共接口。评审阻断／失败／hold、候选／代码合入及分支失败等内部输入只能留在后端私域，仍受正常业务 owner 的材料、阶段、版本、幂等及人工门禁约束，不直接设批准或 100。公共工作流及嵌套历史回执不得泄漏私有故障字段；迟到结果按对象／轮次／版本拒绝。先提交再发事件，重连不重放写入；未知异常仅服务端记录详情，响应、帧与历史均返回稳定安全提示。

场景字段只使用 `internal-scenarios.ts` 服务端类型扩展，由同一 owner 持有。`branchCreationFailures`、`heldReviews`、`trackingBranch.nextCleanupFailure` 等通过 `publicBusinessProjection` 递归移除，包括幂等回执中的历史投影。公开评审通过 agent 状态表达待运行、运行、失败与完成；没有修改这类模拟事实的公开命令。

### 当前 AI 配置实现

模型配置和追加指令保存在服务进程的共享内存中，适用于所有项目和 Release。模型与指令共用八角色目录；IR 需求评审使用独立的 `requirements-review`，方案 A、B、C 保留各自角色和报告，可以使用同一模型。Skill 设计能力继续私有运行，不在 AI 配置目录中。

业务需求和方案讨论创建时绑定已保存的模型、思考强度与追加指令，消息执行沿用会话指令和该次 Submission 选择。评审和进度分析在接纳时绑定配置，完成和历史读取不重采当前设置。模拟后端保留这些输入快照，不据此宣称调用了真实模型。

确认后的角色清单与生效规则见[AI 配置规格](../../../../docs/specs/aireq/tools-settings.md#agent-角色)，手动重分析见[进度分析规格](../../../../docs/specs/aireq/tracking.md#统一进度分析)。

## 只读项目进度

既有 `readWorkflow` 返回的 `view.projectProgress` 覆盖所有项目，每项为 `{projectId, total, releases}`；`releases` 含该项目全部 Release（包括空 Release），每项的 `releaseId`、`title`、`createdAt` 与汇总来自同一项目快照。`total` 与逐 Release 项复用 `AIReqProgressSummary`：提案数、正式 IR 数、正式 SR 数、未分析 SR 数、`percent` 及全部正式 IR 摘要。现有 `view.groups/drafts/srs/materials` 等仍只含当前项目，不能为汇总而跨项目混入。

每次读取从同一 workflow owner 一次取得当前所有项目的进度输入，仅包含正式／提案 IR、SR、Release 和仓库水位，不复制完整材料、操作或会话，也不为每个项目重复派生全局待办。统一经一次 `withPrototypeProgress` 后按项目分组，再调用原公共纯函数 `projectProgress`；当前选择的 SR 行复用这批进度事实并继续经 `withPrototypePlanning`，不扩大其项目范围。项目及 Release 直接累计所有正式 SR 的 `srProgress` 后除以 SR 数，不先平均 IR；提案及其 SR 不入进度。未分析且无合入／有效验收事实的 SR 按 0 并标记；合入 99、匹配版本的人工通过 100，事实优先。无正式 SR 为 `null`，零 SR 正式 IR 保留摘要，未全部完成的显示不得舍入为 100。

聚合只存在于返回投影，不回写 state、不缓存、不增 RPC 或事件通道。正常业务提交事实后仍通过既有 workflow／scheduler 事件使客户端重读，读取本身不改变业务事实、revision 或接纳动作。

项目／具体 Release 与历史由 UI Context 唯一持有；全局总览只读，当前项目统计、待办与近期动态使用同一范围。SR 可选 `statusChange` 由 workflow 成功事务比较实际有效状态后记录 `{from?, to, at}`，读取和初始化不制造变化，失败不发布。原型预置的既存历史按集成规格保留固定时间，不从当前状态反推或按启动时间刷新。静态 SR 的 `automaticCodeMerge:false` 属于 `InternalSystemRequirement`，后台模拟合入跳过，公共投影递归剥离；正常业务操作仍复用原事务路径。
