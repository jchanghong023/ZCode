# 公开服务与 AIReq 契约

本文件是当前对接目录，不以内部类成员、旧页面、纯 DTO 或协议 schema 扩大服务能力。[后端拓扑](../../architecture/mock-backend.md)记录实现限制，[连接身份](connection-identity.md)记录身份、版本、幂等与二进制接线。

## 1. 权威契约与公开范围

- `packages/services/src/aireq/contract.ts` 定义 `IAIReqService` descriptor；公开子入口 `@zcode/services/aireq`。
- `remote-operations.ts` 定义 correlated path/args/result；`AIReqRemotePath` 是 operation map 的键，不接受任意字符串或万能 unknown[] 代理。
- `packages/server/src/aireq/wire-schemas.ts`、`validation.ts` 做运行时校验，静态类型不代替 wire 校验。
- `packages/server/src/http.ts` 的 `publicMembers` 是部署白名单。只公开指定方法／事件；overrides 不绕过白名单，不能反射实现类私有方法。
- `IServiceAccessor`、`RemoteServiceAccess` 和 `createMockServices` 对应同一服务面。当前白名单逐项为下列 10 个频道。

| 频道              | 方法                                                                         | 事件        |
| ----------------- | ---------------------------------------------------------------------------- | ----------- |
| aireq             | bootstrap、call                                                              | onDidChange |
| zcode-agent       | 见下一节                                                                     | 见下一节    |
| file              | searchWorkspaceFiles、stat、checkFilesExist、readMediaPreview、readFileRange | 无          |
| system            | info                                                                         | 无          |
| project           | resolveSessionDirectories、readTree                                          | 无          |
| broadcast         | send                                                                         | onMessage   |
| setting           | get、update                                                                  | 无          |
| provider-settings | getView、refresh                                                             | 无          |
| model-selection   | getView                                                                      | onDidChange |
| subagents         | list                                                                         | 无          |

Git、文件监听、MCP 同步、独立媒体预览、client-config RPC、skills RPC、任务分组、跨宿主附件转移不属于公开服务。HTTP configs、原生 Skill catalog 与 AIReq Skill 不因此消失。受管 worktree、插件、终端等纯类型或通用展示组件存留不授权对应 RPC。

## 2. 原生 Agent 精确公开成员

方法按用途列出，名称是 Channel 包装方法，不是 wire 路径：

- 偏好／目录：`syncAppRuntimePreferences`、`listSessionSubagents`、`supportsConversationQuoteComment`、`getSkillReferenceCatalog`。
- 握手／会话：`helloConversationV4`、`initializeConversationV4`、`subscribeConversationV4`、`resyncConversationV4`、`unsubscribeConversationV4`、`conversationRowsRangeV4`、`conversationPlansV4`、`sendConversationCommandV4`、`queryConversationCommandsV4`。
- 附件：`attachmentBeginV4`、`attachmentChunkV4`、`attachmentCommitV4`、`attachmentAbortV4`、`attachmentReadV4`。
- 生命周期：`getSessionLifecycle`。

事件：`onDynamicSessionLifecycle`、`onDynamicConversationFrame`、`onAgentRuntimeRestarted`、`onAgentRuntimeLifecycle`。动态事件保留参数化订阅及释放语义。

精确请求／结果由 `packages/services/src/zcode-agent/zcodeAgent.ts` 和 shared `zcode-protocol-v4` 的 transport/command/snapshot/wire schemas 定义，不在文档另造 DTO。Host 内部 flow/dispose 接口不是 Web 公开成员；workspace-config wire 类型存在也不构成公开订阅包装。

## 3. AIReq 服务入口

```ts
bootstrap(identity: AIReqIdentity): Promise<AIReqRemoteBootstrap>;
call<P extends AIReqRemotePath>(
  identity: AIReqIdentity,
  path: P,
  args: AIReqRemoteArgs<P>,
  selection?: AIReqSelection,
): Promise<AIReqRemoteResult<P>>;
readonly onDidChange: Event<AIReqRemoteEvent>;
```

bootstrap 无业务创建副作用，返回 contractVersion、opaque backend.id、当前能力、initialSelection、模型 choices/settings/revision、提示词 saved/draft/revision、projects.developmentRoots 和可选 Skill 存储目标。它不返回私人 composer 草稿、服务注册清单、来源 owner/provenance 或全部分页报告。模型／提示词读取由此提供，本地 prompt draft 端口不是 RPC。

当前 AIReq bootstrap 业务契约版本为 `5`；客户端检测不匹配时不装配数据源。该版本独立于原生 Agent 的 Protocol v4 wire 版本。

`models.settings.agents` 是模型与追加指令页签共用的有序角色目录：`requirements`、`requirements-review`、`solution`、`requirements-review-a`、`requirements-review-b`、`requirements-review-c`、`solution-review-summary`、`progress-analysis`。需求评审独立于方案评审 A；方案评审 A/B/C 的模型选择可相同。「跟随默认」解析工作流默认模型。Skill 设计不属于该目录，既有 `skillDesign` 操作不变。

讨论会话创建时、评审和分析接纳时绑定 `modelConfig`，包含解析后的模型、思考强度和 `promptSnapshot`（已保存的追加指令；空字符串仅用内建指令）。后续设置保存不改写已有会话、已接纳执行或历史报告。讨论提交单次临时模型沿用原生 Submission 语义，不修改会话绑定。

readWorkflow 返回 `{view,session?,workspace}`，将业务投影、原生会话引用与同源工作区配对；正式只读目标不因此开启新的编辑会话。selection 必须来自现行类型／严格 schema，不能作为未校验权限或后端全局当前项目。

`view.documentFormats` 存放全局已保存规则，以 `requirements.md`、`proposal.md`、`design.md`、`tasks.md`、`test-plan.md` 和 `spec.md` 为键，值为必需章节标题数组。提案的 `requirementsCheck` 和 `solutionCheck` 分别投影各阶段当前材料的检查结果 `{issues: {path, reason}[]}`；缺省表示尚未检查，空数组表示通过。保存规则不重算既有结果；方案只引用需求阶段已检查通过的正文。

onDidChange 类型为 presence(snapshot)、workflow、models、prompts、scheduler、skills(sessionId) 和 error。可选 backendEpoch/revision/projectId/irId/operationId 只提供投影失效信息。连接恢复通过重读取得当前事实。

## 4. AIReq 操作登记

当前 operation map、wire argumentSchemas 与服务分派对应以下 29 项。表中省略的结构字段、可选性及联合类型以源码类型为准。args 是有序 tuple。P/I/S 分别表示 projectId/irId/srId。

| path                                | args                                                                      | result                                           |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| readPresence                        | []                                                                        | AIReqPresenceSnapshot                            |
| readWorkflow                        | [selection]                                                               | AIReqRemoteWorkflow                              |
| readPrHandoff                       | [{projectId,irId}]                                                        | AIReqPrHandoff                                   |
| command                             | [action,selection,revision]                                               | AIReqWorkflowResult                              |
| retryMaterial                       | [{projectId,releaseId,irId,path,sha256,round?}]                           | boolean                                          |
| retrySession                        | [selection,sessionId]                                                     | null                                             |
| progress.recordTest                 | [P,I,S,input]                                                             | null                                             |
| progress.cleanupPreview             | [P,I]                                                                     | AIReqBranchCleanupItem[]                         |
| progress.cleanupBranches            | [P,I,input]                                                               | null                                             |
| planning.updateSr                   | [P,I,S,input]                                                             | null                                             |
| projects.saveRepository             | [input]                                                                   | null                                             |
| models.save                         | [settings,expectedRevision]                                               | null                                             |
| prompts.save                        | [value,expectedRevision]                                                  | null                                             |
| skillDesign.session                 | [P]                                                                       | sessionId                                        |
| skillDesign.workspaceIdentity       | [P]                                                                       | string                                           |
| skillDesign.read                    | [sessionId]                                                               | AIReqSkillDesignDraft                            |
| skillDesign.saveDraft               | [sessionId,draft]                                                         | null                                             |
| skillDesign.prompt                  | [sessionId,draft]                                                         | string                                           |
| skillDesign.temporaryDirectory      | [sessionId]                                                               | string                                           |
| skillDesign.readPreview             | [sessionId]                                                               | AIReqSkillDesignPreview 或 null                  |
| skillDesign.listSkills              | [workspacePath]                                                           | SkillSummary[]                                   |
| skillDesign.savePreview             | [sessionId,workspacePath,name,target,expectedPreviewRevision,operationId] | AIReqSkillSaveReceipt                            |
| progressScheduler.read              | []                                                                        | AIReqAnalysisSnapshot                            |
| progressScheduler.queryTasks        | [filter,page,pageSize]                                                    | AIReqAnalysisTaskPage                            |
| progressScheduler.queryRuns         | [historyFilter,page,pageSize]                                             | AIReqAnalysisPage&lt;AIReqAnalysisRunSummary&gt; |
| progressScheduler.readRun           | [id]                                                                      | AIReqAnalysisRun 或 null                         |
| progressScheduler.setProjectEnabled | [P,enabled]                                                               | null                                             |
| progressScheduler.configure         | [enabled,intervalMinutes]                                                 | null                                             |
| progressScheduler.runNow            | [filter,retryRunId?]                                                      | null                                             |

关键输入语义：

- `retrySession` 只恢复指定选择当前绑定的已有原生会话。`sessionId` 必须精确匹配该选择解析出的会话；不匹配或不存在时拒绝，不创建替代会话、不修改材料或重放输入。
- `progress.recordTest` 只提交人工验收通过，输入为 `operationId`、`expectedRevision`、`expectedCodeVersion` 和非空 `reason`，不接收验收不通过或直接设置进度。工作流按正式 SR 归属及修订校验首次合入版本，无须成功的分析报告；记录验收依据、操作者、时间和首次合入版本后有效进度为 100%，相同请求重放不重复记录。
- 正式 SR 的 `codeMerge` 只记录首次合入默认分支的事实，后续提交不替换该版本。`testAcceptance` 只保存与该版本绑定的一条人工验收通过记录；验收期间保留测试待办，完成后移除。
- cleanupBranches 输入为 operationId/expectedRevision/branches；先读 preview，再确认登记分支。
- planning 输入含 operationId/expectedRevision、可选 developerEmployeeId/testingEmployeeId/plannedStart/plannedEnd。
- repository 输入含 operationId/expectedRevision、可选 projectId、name/repositoryUrl/defaultBranch；不接受本地目录。
- Skill target 仅 project/user；会话归属、预览版本、路径与同名冲突均由 owner 校验。prompt 只是准备正文，不发送；saveDraft 不等于保存产物。
- 分析筛选为 projectId/releaseId/irId/srId/srSearch，任务可带 taskState，历史可带 status/since/until。ISO 格式的日期须为真实日历日期（包括月末与闰年），不得将不存在的日期自动归一化；开始晚于结束时拒绝，同一时刻允许。页码从 1 开始，pageSize 仅 25/50；读取历史不启动分析。分析页只在项目和具体 Release 均已就绪时读取和提交。
- `queryTasks.eligibleCount` 与批量 `runNow` 使用同一手动资格，覆盖匹配的全部分页。项目关闭、已合入、分支不可用或已有在途执行的 SR 不接纳；全局暂停仅影响自动分析。分析任务的 `completed` 表示首次合入后已停止分析，不等于人工验收已通过。
- 带 `retryRunId` 的 `runNow` 只接纳该次可重试失败所属的单一项目／Release／IR／SR，filter 必须同范围，服务在接纳时重查手动资格。任务行投影的 `retryable` 来自该任务最近一次失败。
- 执行详情保存 `inputFingerprint` 和接纳时的模型、思考强度、追加指令。无业务变化时，显式手动请求可在生效配置实质变化后重新分析；配置保存本身不派发。合入和业务输入变化后的迟到结果只进入执行历史。

## 5. command 动作与领域门禁

当前实现的服务公开动作白名单：

- 想法：createIdea、importIdeas、updateIdea、transferIdea。
- 配置／提案：saveDocumentFormats、createRelease、createProposal、importProposals、assignContacts、deleteRequirement。
- 流程：submitProposalReview、runRequirementsReview、acceptProposal、returnProposal、runFullReview、confirmAlignment、publishProposal、closeProposalPr、reviseProposalMaterial、retrySrBranch。

动作包含 operationId/expectedRevision 及适用目标；updateIdea/transferIdea 另校验 ideaRevision。转入使用非空 projectId/releaseId targets 并原子消费想法；导入提案绑定具体 Release，可带独立 businessDocument。submitProposalReview 绑定项目、IR、评审类型 kind 和材料快照 snapshotDigest，材料校验通过且该版本尚未接纳时才启动评审；runRequirementsReview／runFullReview 仅用于当前评审失败或缺报告时重试。acceptProposal 绑定 reviewId/snapshotDigest；confirmAlignment 还绑定 perspective/version，首次有效记录按角色保留，最后一个角色自动生成交付候选。发布／关闭绑定 candidate（含当前完整文件清单），修改材料限定 requirements/solution/test-plan 与真实修改说明。

交付投影保留已创建分支、推送及 PR 事实；`proposalDelivery.publishError` 区分 `branch`、`push`、`pr` 三种失败步骤。再次发布同一候选复用已完成的步骤。进入页面或读取候选不提交文档。

关闭未合入 PR 后，该 PR 作为 `proposalDeliveryHistory[].closedPr` 留存；旧候选不再可写或核验。重新提交使用当前候选，并重新绑定完整清单。

`saveDocumentFormats` 提交完整 `documentFormats` 记录，沿用 `command` 的版本检查、幂等和提交后通知，不绑定当前项目或 Release。

原生讨论完成回调才可进入服务端私有材料生成动作；公开面没有手工伪造 AI 结果、代码合入、场景时钟或审批结果的路径。任何材料变化使对应批准失效，异步回调绑定原对象／轮次／版本。完整业务规则分别见[提案](proposals.md)、[进度](tracking.md)、[材料阅读](unified-side-pane.md#材料阅读)和[工具设置](tools-settings.md)，不在本文件重复维护工作流全文。

## 6. 拒绝、文件与设置

未知 path/action、额外封闭字段、非法 tuple／身份／归属／版本／阶段在 owner 执行前拒绝；不返回占位成功。普通 RPC 保持现有 Promise error 语义，不新增统一结果 envelope，也不依赖 Error 自定义属性必定跨 RPC 保留。只有显式安全业务说明对用户保留，未知异常留服务端诊断，不下发内部堆栈。类型化事件错误使用 AIReqRemoteError。

`retryMaterial` 仅重试当前读取：目标、路径、正文摘要 `sha256` 和材料轮次 `round` 须与当前材料一致，否则拒绝，不能恢复其他版本。`materialHistory` 的新快照随材料固定保存 IR 文档路径 `documentPath`、方案轮次 `proposalRound` 和 SR 清单 `srs`（编号、名称、文档路径）。历史依赖图只使用快照；缺少绘图信息时显示原始文件及原因。

文件 stat.size、分片 offset 按实际 UTF-8 原始字节；readFileRange 的 offset、length 必须是非负安全整数，非法范围在读取前拒绝，不取整、不把负偏移解释为从文件尾部计数。length=0 返回空字节；到达或超过 EOF 返回短数组或空数组。目录误读与缺失失败，零字节文件成功，next offset 按原契约。没有公开目录全量索引下载或宿主写盘。

setting.get/update 使用正式 AppSettings，初值由完整 schema 生成；严格 patch 全部验证后一次合并，partial 不补默认，混合非法输入原子失败。语言沿 locale/localePreference，外观沿正式 theme 与 12—20 整数字号 uiFontSizePx。该服务不改变浏览器本地 store owner，也不自动发送广播。`state:theme` 广播只同步会话内外观，不写入浏览器偏好，也不得覆盖该浏览器已有的有效选择。

参数版本、幂等和事件时序见[连接身份](connection-identity.md)，不得为表中没有版本／操作标识的接口添加虚构保证。

## 发布边界

原型阶段按已确认的业务要求完善实现、公开契约和测试。原型验收通过的版本作为正式对接基线。切换正式后端时复用同一份前端构建产物、SDK、二进制传输、descriptor、DTO、协议 schema 和测试。接入 OMP、Git 和持久化使用后端实现与部署配置。前端 UT 和后端 ST 的源码、步骤及断言沿用基线。

原型和正式测试环境通过已有运行配置指定服务地址、测试仓库和前置数据。需要依赖状态的用例，由环境准备所需事实，测试通过同一个公开接口验证。正式环境验证真实 Git 合入时，使用专用测试仓库实际完成合入并读取公开结果。模拟时钟、故障注入、固定回复及测试写入口仅限服务端私域，公开事件和历史回执遵守同一公开数据边界。业务测试验收、无障碍标识和生产诊断各自按公开契约保留。

材料摘要和字节数以实际正文为准；MR 外链、平台核验、AI 原分和规划建议须有对应事实。部署限制、工号与进程内数据的有效范围见[后端说明](../../architecture/mock-backend.md#5-部署限制与后端替换)。退役模块时同步清理入口、依赖与架构登记，保留仍被使用的代码及第三方许可归因。

发布验收关联前端构建、公开契约、测试版本和实际服务入口。替换后端时核对前端产物和契约的字节一致性，并按[测试复用规则](../../testing/unit-test-quality.md#原型与正式环境的测试复用)运行同一套测试，分别记录环境、实测结果和限制。
