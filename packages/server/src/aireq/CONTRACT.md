# AIReq mock

想法批量导入 `importIdeas(originalTexts)` 由现有 workflow 克隆事务唯一持有：全批非空校验、按批次 revision 和行序分配独立编号、使用实际操作者及服务时间、同一收据提交后广播。任一无效全批回滚，同操作重试返回原回执；不要求项目版本，不创建会话／提案或运行 AI。

想法池与转入版本按 `docs/specs/aireq-migration/section-navigation-and-ideas.md`，业务事实归现有 workflow owner。一次克隆事务中校验全部项目／版本和想法 revision、建立独立提案、移除想法并形成收据；失败回滚，提交后广播，同操作重试复用既有回执。原文和原始提交信息进入各版本提案，实际转入操作者记录在操作回执中。

初始业务数据按 `docs/specs/aireq-migration/integration.md` 的“原型后端业务初始数据”组织，数量与待办只从各 owner 的事实派生。提案导入导出按 `proposals.md` 的 2026-11-17 规格：`importProposals.proposals` 原子接纳短需求及可选 IR 业务 Markdown，正文仅落在新 IR 的标准 requirements.md，计算真实摘要，不导入其他材料、SR 或批准；沿用版本、幂等与提交后广播。

本轮整改与组序以根 `.todo.md` 现行任务为准，持续规则见 `docs/specs/aireq-migration/release-surface.md` 和不冲突的领域规格；被覆盖的旧任务不授权恢复场景按钮／接口，历史证据不等于本轮通过。

单一进程生命周期内存 owner 持有共享项目、Release、提案、IR/SR、材料、两类评审、三方确认、联系人、报告、合并／验收问题、分支、配置、Skill 和调度任务。Issue 专属状态、调度、操作、事件及模型角色已裁撤。服务重启恢复样例；关闭连接不取消已接纳工作。每五秒核验文档 PR 的候选、版本与当前完整材料，待合并／关闭不转正。

公开 `MockAIReqService` 实现 `@zcode/services/aireq` bootstrap/call/onDidChange；所有普通调用显式携带合法工号和 clientId，全部合法工号可操作，backend.owner 不授予权限。写操作按各自实际签名保留对象归属、阶段、版本、幂等及参数校验，不承诺所有写入都有 CAS／operationId。`getConnectionServices` 为原生会话逐连接绑定不可变身份并保留既有连接 scope；ALS 仅传递请求上下文，不保存全局当前操作者。
原生命令的 envelope.clientId 除了匹配 v4 握手，还必须匹配 HTTP 连接固定的 clientId；握手自报值不构成覆盖连接身份的授权。接纳后的队列与用户行沿原来源传递，查询、恢复、重试和其他客户端的提升动作不得改写该来源。

业务 `command` 在首次接纳前校验 revision；幂等摘要只比较目标与业务参数，排除 `expectedRevision`／RPC revision。同操作重读版本后优先返回已接纳回执，业务参数变化仍拒绝，不能因 ACK 丢失重复创建 IR。UI 显式重读保留输入及操作 ID，不自动重新发送。

远程白名单严格保留 29 项：移除 `models.read`／`models.revision`／`models.bindingChanged`／`prompts.read` 的 wire schema 与分派，旧路径返回 UNKNOWN_PATH，不保留兼容别名。bootstrap 继续调用后端内部模型／提示词读取与 revision 函数，内部绑定比较也保留；前端本地读取端口及 `models.save`／`prompts.save` 的 expectedRevision CAS 不变。十项隐藏 Skill 操作、私有原生材料生成链保留，退役场景控制不恢复。

`models.save`／`prompts.save` 没有 operationId；`skillDesign.saveDraft` 及 scheduler 的 `setProjectEnabled`／`configure`／`runNow` 没有请求版本或 operationId，维持当前覆盖保存／调度去重语义。其他操作只按已有签名提供相应版本及回执保证；内存回执不保证跨重启 exactly-once。所有 mutation 均不自动重放，不为理论持久保障扩展接口。

模型目录 facade 将底层 `getView`、`refresh(reason)` 的返回与 `onDidChange` 事件统一映射为同一 AIReq 供应商／模型目录；刷新实际调用底层 refresh 并传递 reason，不能退化为 getView 或透传底座目录事件。目录 revision 仅表示本进程刷新观测，不推进模型配置业务 revision，也不声称刷新真实供应商。

配置保存、分析设置及负责人分配成功后，使用 `@zcode/services/logger` 的现有 `createServiceLogger` 记录实际工号、clientId、操作名和时间；不记录配置正文、提示词或材料。业务动作收据保留实际身份，原有人工决定／进度记录保留操作者，来源 owner 不代替实际操作者。

原生 rows、附件字节、队列、订阅、水位、帧唯一归现有 `MockRuntime/MockZCodeAgentService`；本模块仅提供 admission/completion/seed 业务回调，不建立另一套会话存储。保留需求、评审、方案及隐藏 Skill 的完整内存流程，Skill 允许隔离临时浏览器装配验证但不恢复导航／设置／搜索入口。AIReq 自动化专属 owner、manifest 和 task/workpool RPC 裁撤，分析调度与通用设施保留。拒绝退休自由聊天、开发执行及验收 Agent 动作。真实能力和上线限制只记部署／交付文档，公开回复和材料仅陈述实际接纳的输入、材料、状态与版本，不宣称未发生的外部执行。

第 5 组实施约束：原生完成回复只确认已接纳输入及本次材料版本变化，不把固定内容归因为真实模型分析；评审追问不修改报告或人工决定。无实际规划建议时不初始化 AI 规划，人工配置沿用正式保存动作。Skill 保存由现有 owner 原子登记实际文件内容，收据 path/revision 必须与随后 list/read 一致；失败保留草稿且不产生保存收据。
Skill 已保存正文以 skills owner 的文件映射为唯一内容源；通用虚拟文件服务经本模块公开只读节点接口投影目录与文件，不复制一份保存状态。项目目标和共享目标的祖先列表、stat 与 UTF-8 读取保持一致，目录不能作为文件读取；保存失败不写入映射。

原生完成回调失败不会撤销 accepted 输入或假报完成：assistant 与轮次分别记录 `failed`，会话以可再次输入的 `completedInterrupted` 收口。复用 `businessFailureMessage`：显式安全领域错误保留可操作原文，未知异常仅服务端诊断保存详情；实时帧与历史使用同一安全正文，不包含任意异常 message／stack。输入 ACK 仅表示接纳，随后新消息仍可正常完成。

缺失原生身份返回重新进入工作区的安全业务说明；他人未发布草稿返回不可访问说明，身份／草稿归属判断与已发布共享读取规则不变，不把 fault／INVALID_IDENTITY 字符串当正文。

MR 生产者通过同一公共 `aiReqPrFactSchema` 生成正式布尔核验事实；本后端记录保留 `platformVerified:false`，不得因 DTO 支持 true 而虚构外部核验。提案历史、SR 与整体验收共用同一事实类型。

v4 信封与封闭 payload／firstInput／answer／create config 拒绝未知键；args／content 仍为显式扩展字典。原生 owner 的 conversation／sessions-index／workspace-config 订阅和 rowsRange 从 shared 严格 schema 派生扁平目标校验，先验证原始请求，再预热、登记订阅或读取恢复；保留连接 scope 注入的可信 carrier，不剥离非法客户端键后执行。

工作流查询只读取已驻留且归属匹配的原生会话，不触发草稿预热。当前原生 runtime 无工作流引擎、
run／artifact／node 内容；runs 枚举为空，指定 run 的读取返回正式 capabilityUnsupported 和可读说明，
不忽略标识返回固定空文件／正文／清单。此限制不影响本领域需求工作流 owner 的已有完整内存流程。

## 第 2 组业务所有权

原始短需求 `originalText` 独立保存，新增／CSV 只创建可见提案，不启动 AI 或生成 SR，不等待首发聊天。导入先校验完整批次、当前项目及具体 Release，提交人和时间取服务端实际请求。进入讨论后才使用已有原生业务完成回调生成材料；回调绑定对象、阶段、轮次和版本，不接纳旧结果。

IR 材料为 `docs/requirements/<ir-id>/` 共享需求、依赖及验收；每 SR 独立 `openspec/changes/<sr-id>/`，包含 proposal、design、tasks、specs、test-plan。路径是内存模拟仓库引用，不写用户业务文件。前置 `originalReview` 单 Agent 加人工通过后才拆 SR；同一方案阶段完善全材料，再三路审查与第四终审、人工放行、三个视角 `alignment`，最后一个 IR 一个完整文档 PR。无后置测试 Agent、不执行 tasks 或编码。

整包任一材料变更撤销完整审查、终审、人工及三方确认，保留历史及失效原因；仅业务需求变更额外重做前置单评审。PR 提交冻结版本，需修改先关闭未合并 PR；仅核实完整同候选合入后保留同 IR/SR 转正，各 SR 分支取该文档合入提交，逐项保存错误，重复核验不复制。正式范围新增另建 `sourceIrId` 关联提案，不重新拆分或跨 Release 迁移。

报告仅由此 owner 统一写回。分析指纹绑定 SR 材料、任务、代码／默认分支和合并事实，未变可跳过；失败保留上次成功并标记失败／过期，迟到结果不覆盖新事实。合入固定有效 99，AI 原始评分作为证据保留；人工 `progress.recordTest` 绑定预期 revision、代码版本、实际操作者及非空依据。失败保持 99 并开问题，修复新版本合入转待复测，人工通过才 100。全部 SR 100 后才能预览并确认清理登记分支；逐项错误、CAS 与操作幂等，主分支和历史受保护、不改进度。

定时接纳使用唯一调度 owner 的真实服务时钟 `tick()` 与配置 `intervalMinutes`，没有运行项也检查到期任务；后台五秒检查不等于业务时间推进。退役的 `progressScheduler.advance` 及场景调度不可公开调用，不接受浏览器推进模拟时钟；隔离后端内部验证输入也必须消费同一去重、指纹与版本路径，不冒充真实等待间隔的验收证据。

文档 PR 的 checkedAt／nextCheckAt 及重复状态消息只更新观测投影并发失效事件，不增加业务 revision；仅 MR 实际状态或转正等业务事实增加 revision，避免无关轮询让验收／清理弹窗永久失效。真实业务 CAS 与代码版本门禁仍执行。

联系人／负责人可指定或领取、可同人兼任，代办不暗改归属，操作留实际工号。待办由第一手事实派生，不保存独立完成状态；未分配待认领，AI 正常运行／等合并／等调度不制造待办。共享业务更新提交后发事件，客户端重读，重连不重放。

`prototype.*`、故障控制和场景时钟不属于公共接口。评审阻断／失败／hold、候选／代码合入及分支失败等内部输入只能留在后端私域，仍受正常业务 owner 的材料、阶段、版本、幂等及人工门禁约束，不直接设批准或 100。公共工作流及嵌套历史回执不得泄漏私有故障字段；迟到结果按对象／轮次／版本拒绝。先提交再发事件，重连不重放写入；未知异常仅服务端记录详情，响应、帧与历史均返回稳定安全提示。规格要求不代表待实施代码已通过。

场景字段只使用现有 `internal-scenarios.ts` 服务端类型扩展，由 workflow／progress 同一事务 owner 持有，随项目／IR／SR 和评审 ID／轮次保存与消费。`branchCreationFailures`、`heldReviews`、`trackingBranch.nextCleanupFailure` 不属于公开 DTO；对外 `publicBusinessProjection` 递归移除私有字段，包括幂等回执内的历史视图。评审不再具有公开 `held` 标志，等待由 agent 的 pending／running 表达，人工放行只认当前轮次完整报告。

## 第 3 组只读项目进度

既有 `readWorkflow` 返回的 `view.projectProgress` 覆盖所有项目，每项为 `{projectId, total, releases}`；`releases` 含该项目全部 Release（包括空 Release），每项的 `releaseId`、`title`、`createdAt` 与汇总来自同一项目快照。`total` 与逐 Release 项复用 `AIReqProgressSummary`：提案数、正式 IR 数、正式 SR 数、未分析 SR 数、`percent` 及全部正式 IR 摘要。现有 `view.groups/drafts/srs/materials` 等仍只含当前项目，不能为汇总而跨项目混入。

每次读取从同一 workflow owner 按项目获取当前事实，并复用 `withPrototypeProgress`／`withPrototypePlanning` 后调用公共纯函数 `projectProgress`。项目及 Release 直接累计所有正式 SR 的 `srProgress` 后除以 SR 数，不先平均 IR；提案及其 SR 不入进度。未分析且无合入／有效验收事实的 SR 按 0 并标记；合入 99、匹配版本的人工通过 100，事实优先。无正式 SR 为 `null`，零 SR 正式 IR 保留摘要，未全部完成的显示不得舍入为 100。

聚合只存在于返回投影，不回写 state、不缓存、不增 RPC 或事件通道。正常业务提交事实后仍通过既有 workflow／scheduler 事件使客户端重读，读取本身不改变业务事实、revision 或接纳动作。示例只演示真实接口调用，浏览器验证由主集成记录。
