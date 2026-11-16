# AIReq mock

当前产品规则以根 `.todo.md` 第 1–172 行已确认要求为准；其已完成任务与收口记录保留各自历史版本边界。

单一进程生命周期内存 owner 持有共享项目、Release、提案、IR/SR、材料、两类评审、三方确认、联系人、报告、合并／验收问题、分支、配置、Skill 和调度任务。Issue 专属状态、调度、操作、事件及模型角色已裁撤。服务重启恢复样例；关闭连接不取消已接纳工作。每五秒核验文档 PR 的候选、版本与当前完整材料，待合并／关闭不转正。

公开 `MockAIReqService` 实现 `@zcode/services/aireq` bootstrap/call/onDidChange；所有普通调用显式携带合法工号和 clientId，全部合法工号可操作，backend.owner 不授予权限。写操作保留对象归属、阶段、版本、幂等及参数校验。`getConnectionServices` 为原生会话逐连接绑定不可变身份并保留既有连接 scope；ALS 仅传递请求上下文，不保存全局当前操作者。

业务 `command` 在首次接纳前校验 revision；幂等摘要只比较目标与业务参数，排除 `expectedRevision`／RPC revision。同操作重读版本后优先返回已接纳回执，业务参数变化仍拒绝，不能因 ACK 丢失重复创建 IR。UI 显式重读保留输入及操作 ID，不自动重新发送。

配置保存、分析设置及负责人分配成功后，使用 `@zcode/services/logger` 的现有 `createServiceLogger` 记录实际工号、clientId、操作名和时间；不记录配置正文、提示词或材料。业务动作收据保留实际身份，原有人工决定／进度记录保留操作者，来源 owner 不代替实际操作者。

原生 rows、附件字节、订阅、水位、帧唯一归现有 MockRuntime/MockZCodeAgentService；本模块仅提供 admission/completion/seed 业务回调，不建立另一套会话存储。只提供当前需求、评审、方案与主页面 Skill 原型；AIReq 自动化专属 owner、manifest 和 task/workpool RPC 裁撤，需求分析调度器与通用原生设施保留。拒绝退休自由聊天、开发执行及验收 Agent 动作。无真实 Git、模型、文件保存、数据库或外部 IO。

## 第 2 组业务所有权

原始短需求 `originalText` 独立保存，新增／CSV 只创建可见提案，不启动 AI 或生成 SR，不等待首发聊天。导入先校验完整批次、当前项目及具体 Release，提交人和时间取服务端实际请求。进入讨论后才使用已有原生业务完成回调生成材料；回调绑定对象、阶段、轮次和版本，不接纳旧结果。

IR 材料为 `docs/requirements/<ir-id>/` 共享需求、依赖及验收；每 SR 独立 `openspec/changes/<sr-id>/`，包含 proposal、design、tasks、specs、test-plan。路径是内存模拟仓库引用，不写用户业务文件。前置 `originalReview` 单 Agent 加人工通过后才拆 SR；同一方案阶段完善全材料，再三路审查与第四终审、人工放行、三个视角 `alignment`，最后一个 IR 一个完整文档 PR。无后置测试 Agent、不执行 tasks 或编码。

整包任一材料变更撤销完整审查、终审、人工及三方确认，保留历史及失效原因；仅业务需求变更额外重做前置单评审。PR 提交冻结版本，需修改先关闭未合并 PR；仅核实完整同候选合入后保留同 IR/SR 转正，各 SR 分支取该文档合入提交，逐项保存错误，重复核验不复制。正式范围新增另建 `sourceIrId` 关联提案，不重新拆分或跨 Release 迁移。

报告仅由此 owner 统一写回。分析指纹绑定 SR 材料、任务、代码／默认分支和合并事实，未变可跳过；失败保留上次成功并标记失败／过期，迟到结果不覆盖新事实。合入固定有效 99，AI 原始评分作为证据保留；人工 `progress.recordTest` 绑定预期 revision、代码版本、实际操作者及非空依据。失败保持 99 并开问题，修复新版本合入转待复测，人工通过才 100。全部 SR 100 后才能预览并确认清理登记分支；逐项错误、CAS 与操作幂等，主分支和历史受保护、不改进度。

定时接纳使用唯一调度 owner 的本地服务时钟 `tick()` 与真实配置 `intervalMinutes`，没有运行项也检查到期任务；后台检查频率不等于业务时间推进，不得每五秒静默跳过模拟一小时。既有 `progressScheduler.advance` 仅由用户显式“模拟推进下一次调度检查”推进模拟时间，仍消费同一去重、指纹及版本接纳路径，不增 RPC。模拟记录可标 `schedule`，但不可冒充真实等待配置间隔的证据。

文档 PR 的 checkedAt／nextCheckAt 及重复状态消息只更新观测投影并发失效事件，不增加业务 revision；仅 MR 实际状态或转正等业务事实增加 revision，避免无关轮询让验收／清理弹窗永久失效。真实业务 CAS 与代码版本门禁仍执行。

联系人／负责人可指定或领取、可同人兼任，代办不暗改归属，操作留实际工号。待办由第一手事实派生，不保存独立完成状态；未分配待认领，AI 正常运行／等合并／等调度不制造待办。共享业务更新提交后发事件，客户端重读，重连不重放。

`prototype.*` 及分析场景只改变明确模拟外部输入：评审 normal/blocked/failed/hold 与释放、PR 待合并／关闭／正确合入／不完整／错候选、代码合入／新修复、下一次分析或指定分支失败。正常业务入口仍执行全部材料、阶段、版本、幂等与人工门禁；不允许直接设置批准或 100。规格和示例不声称已验收。

## 第 3 组只读项目进度

既有 `readWorkflow` 返回的 `view.projectProgress` 覆盖所有项目，每项为 `{projectId, total, releases}`；`releases` 含该项目全部 Release（包括空 Release），每项的 `releaseId`、`title`、`createdAt` 与汇总来自同一项目快照。`total` 与逐 Release 项复用 `AIReqProgressSummary`：提案数、正式 IR 数、正式 SR 数、未分析 SR 数、`percent` 及全部正式 IR 摘要。现有 `view.groups/drafts/srs/materials` 等仍只含当前项目，不能为汇总而跨项目混入。

每次读取从同一 workflow owner 按项目获取当前事实，并复用 `withPrototypeProgress`／`withPrototypePlanning` 后调用公共纯函数 `projectProgress`。项目及 Release 直接累计所有正式 SR 的 `srProgress` 后除以 SR 数，不先平均 IR；提案及其 SR 不入进度。未分析且无合入／有效验收事实的 SR 按 0 并标记；合入 99、匹配版本的人工通过 100，事实优先。无正式 SR 为 `null`，零 SR 正式 IR 保留摘要，未全部完成的显示不得舍入为 100。

聚合只存在于返回投影，不回写 state、不缓存、不增 RPC 或事件通道。正常业务提交事实后仍通过既有 workflow／scheduler 事件使客户端重读，读取本身不改变业务事实、revision 或接纳动作。示例只演示真实接口调用，浏览器验证由主集成记录。
