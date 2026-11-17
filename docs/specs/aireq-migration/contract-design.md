# 公开服务与 AIReq 契约

本文件是当前对接目录，不以内部类成员、旧页面、纯 DTO 或协议 schema 扩大服务能力。[后端拓扑](../../architecture/mock-backend.md)记录实现限制，[连接身份](connection-identity.md)记录身份、版本与幂等，[集成规格](integration.md)记录接线。

## 1. 权威契约与公开范围

- `packages/services/src/aireq/contract.ts` 定义 `IAIReqService` descriptor；公开子入口 `@zcode/services/aireq`。
- `remote-operations.ts` 定义 correlated path/args/result；`AIReqRemotePath` 是 operation map 的键，不接受任意字符串或万能 unknown[] 代理。
- `packages/server/src/aireq/wire-schemas.ts`、`validation.ts` 做运行时校验，静态类型不代替 wire 校验。
- `packages/server/src/http.ts` 的 `publicMembers` 是部署白名单。只公开指定方法／事件；overrides 不绕过白名单，不能反射实现类私有方法。
- `IServiceAccessor`、`RemoteServiceAccess` 和 `createMockServices` 对应同一服务面。当前白名单逐项为下列 12 个频道。

| 频道              | 方法                                                                         | 事件        |
| ----------------- | ---------------------------------------------------------------------------- | ----------- |
| aireq             | bootstrap、call                                                              | onDidChange |
| zcode-agent       | 见下一节                                                                     | 见下一节    |
| file              | searchWorkspaceFiles、stat、checkFilesExist、readMediaPreview、readFileRange | 无          |
| system            | info                                                                         | 无          |
| project           | resolveSessionDirectories、readTree                                          | 无          |
| broadcast         | send                                                                         | onMessage   |
| setting           | get、update                                                                  | 无          |
| zcode-task        | restartWorkspaceProcess                                                      | 无          |
| zcode-session     | readWorkspacePresentation                                                    | 无          |
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

readWorkflow 返回 `{view,session?,workspace}`，将业务投影、原生会话引用与同源工作区配对；正式只读目标不因此开启新的编辑会话。selection 必须来自现行类型／严格 schema，不能作为未校验权限或后端全局当前项目。

onDidChange 类型为 workflow/models/prompts/scheduler/skills(sessionId)/error；可选 backendEpoch/revision/projectId/irId/operationId 只提供失效信息，不是持久事件日志或全局 bootstrap 水位。

## 4. AIReq 操作登记

当前 operation map、wire argumentSchemas 与服务分派对应以下 28 项。表中省略的结构字段、可选性及联合类型以源码类型为准；args 是有序 tuple，不是字段任意拼接对象。P/I/S 分别表示 projectId/irId/srId。

| path                                | args                                                                      | result                                           |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| readWorkflow                        | [selection]                                                               | AIReqRemoteWorkflow                              |
| readPrHandoff                       | [{projectId,irId}]                                                        | AIReqPrHandoff                                   |
| command                             | [action,selection,revision]                                               | AIReqWorkflowResult                              |
| retryMaterial                       | [path,selection]                                                          | boolean                                          |
| retrySession                        | [selection]                                                               | null                                             |
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
| progressScheduler.runNow            | [filter]                                                                  | null                                             |

关键输入语义：

- recordTest 输入为 operationId/expectedRevision/expectedCodeVersion/outcome/reason，outcome 为 passed/failed；不是直接设百分比。
- cleanupBranches 输入为 operationId/expectedRevision/branches；先读 preview，再确认登记分支。
- planning 输入含 operationId/expectedRevision、可选 developerEmployeeId/testingEmployeeId/plannedStart/plannedEnd。
- repository 输入含 operationId/expectedRevision、可选 projectId、name/repositoryUrl/defaultBranch；不接受本地目录。
- Skill target 仅 project/user；会话归属、预览版本、路径与同名冲突均由 owner 校验。prompt 只是准备正文，不发送；saveDraft 不等于保存产物。
- 分析筛选为 projectId/releaseId/irId/srId/srSearch；历史另含 status/since/until。页码从 1 开始，pageSize 仅 25/50；读取历史不启动分析。

## 5. command 动作与领域门禁

服务公开动作白名单：

- 想法：createIdea、importIdeas、updateIdea、transferIdea。
- 配置／提案：createRelease、createProposal、importProposals、assignContacts、deleteRequirement。
- 流程：runRequirementsReview、acceptProposal、returnProposal、runFullReview、approveFullReview、confirmAlignment、confirmProposal、publishProposal、closeProposalPr、reviseProposalMaterial、retrySrBranch。

动作包含 operationId/expectedRevision 及适用目标；updateIdea/transferIdea 另校验 ideaRevision。转入使用非空 projectId/releaseId targets 并原子消费想法；导入提案绑定具体 Release，可带独立 businessDocument。人工放行绑定 reviewId/snapshotDigest，alignment 绑定 perspective/version，发布／关闭绑定 candidate，修改材料限定 requirements/solution/test-plan 与真实修改说明。

原生讨论完成回调才可进入服务端私有材料生成动作；公开面没有手工伪造 AI 结果、代码合入、场景时钟或审批结果的路径。任何材料变化使对应批准失效，异步回调绑定原对象／轮次／版本。完整业务规则分别见[提案](proposals.md)、[进度](tracking.md)、[材料](document-surface.md)和[工具设置](tools-settings.md)，不在本文件重复维护工作流全文。

## 6. 拒绝、文件与设置

未知 path/action、额外封闭字段、非法 tuple／身份／归属／版本／阶段在 owner 执行前拒绝；不返回占位成功。普通 RPC 保持现有 Promise error 语义，不新增统一结果 envelope，也不依赖 Error 自定义属性必定跨 RPC 保留。只有显式安全业务说明对用户保留，未知异常留服务端诊断，不下发内部堆栈。类型化事件错误使用 AIReqRemoteError。

文件 stat.size、分片 offset 按实际 UTF-8 原始字节；目录误读与缺失失败，零字节文件成功，EOF 与 next offset 按原契约。没有公开目录全量索引下载或宿主写盘。

setting.get/update 使用正式 AppSettings，初值由完整 schema 生成；严格 patch 全部验证后一次合并，partial 不补默认，混合非法输入原子失败。语言沿 locale/localePreference，外观沿正式 theme 与 12—20 整数字号 uiFontSizePx。该服务不改变浏览器本地 store owner，也不自动发送广播。

参数版本、幂等和事件时序见[连接身份](connection-identity.md)，不得为表中没有版本／操作标识的接口添加虚构保证。
