# AIReq shared contract

在线人员遵循 `docs/specs/aireq/section-navigation-and-ideas.md` 的全系统在线人员规则：服务端连接 owner 唯一持有工号／IP 引用计数，readPresence 读取带 revision 的快照，presence 事件推送相同投影；客户端只读并忽略旧版本，不新增认证、工作流或 v4 状态。

想法 CSV 导入使用正式 `importIdeas(originalTexts)` 命令，在全局 workflow 中原子创建全部想法；提交身份与时间由服务端登记，沿用 command 的严格校验、版本、幂等与提交后广播。导出只读取当前搜索匹配原文并下载单列 CSV，不增加导出 RPC。格式、草稿门禁与验收见分区导航和想法池规格。

分区导航和想法池的当前业务契约见 `docs/specs/aireq/section-navigation-and-ideas.md`。全局想法及可分派版本随工作流同源读取；createIdea / updateIdea / transferIdea 复用现有 command、身份、版本、幂等和广播。转入原子创建各目标版本提案并消费想法，原文和提交信息保留，不建立跨项目父需求或进度。

Browser-safe public entry: `@zcode/services/aireq`. No React, Node, transport implementation or mutable business store lives here. Domain functions inspect supplied snapshots only. Product behavior is requirement and solution discussions, optional reviews, and version confirmation.

`IAIReqService.bootstrap(identity)` reads metadata and configuration. `call(identity, path, args)` is the only business RPC lane, on the existing binary Channel. It rejects extra arguments; each operation takes its target from `args`. Identity contains only employeeId/clientId; extra identity fields and URL scenario controls are rejected. All valid employees may operate; backend.id is an opaque preference-isolation key, not authorization. The server validates identity, ownership, parameters and each operation's applicable version and idempotency rules before changing its single shared in-memory state. After committing it emits `onDidChange`; clients re-read the current projection and discard stale reads. Refresh/reconnect never replays mutations. Process restart restores sample data; receipts do not survive it.

`AIReqDataSource` describes non-React UI integration: synchronous configuration projections, async domain operations, native session/workspace resolution and subscriptions. Unsent drafts and selection belong to each client; accepted projects, releases, requirements, materials and review reports belong only to the server. Native conversations use the current v4 service, not fake business event frames. Failures reject and retain user input; no fallback to another object's sample.

Current reachable service boundary: `IServiceAccessor`, the client proxy and service channel registry expose only current AIReq/native conversation dependencies. Retire window project/controller, cloud content, credential, Source Server workspace/management, device sync, extensions/views/grants, native voice, off-peak tasks, highspeed cards, skill/plugin/user-config/settings sync, legacy plugins/commands/hooks/memory/feedback and managed-worktree RPC contracts end to end. Pure presentation DTOs may remain without descriptors or compatibility proxies. Hidden `skillDesign.*`, native v4 lifecycle/attachments and generic controls remain unchanged.

The [Web service list](../../../../docs/specs/aireq/contract-design.md#1-权威契约与公开范围) defines exposure. `model-selection` only provides `getView`, without a directory event; AIReq model writes use `models.save`. Web exposes neither Provider Settings nor System RPC. The settings channel accepts one Web preference patch and provides a readback; prompts remain under AIReq. The file channel covers mentions, metadata, existence checks, previews and byte ranges, not host directory browsing.

Embedded native discussions, including Skill discussions, do not mount draft recommendations. Subagent records are part of parent conversation frames; Web does not publish a separate subagent catalog.

The retired standalone skills RPC is not retained for its catalog: current mentions/slash commands use the native agent catalog, while hidden `skillDesign.*` operations retain their separate business purpose. Retire unconsumed skill mutation/prompt-context/common-directory helpers and subagent creation, editing, deletion, model-override, primary-directory and enabled-state management methods. Store/hook self-references are not current UI consumers. Provider/model-selection descriptors remain browser-safe contracts; unused former Host facade factories are not retained as a second implementation path.

Model and prompt saves require the editing baseline `expectedRevision` as the second argument, but have no operationId. Model writes carry only the default model and each role's ID, model and reasoning; the owner's names and descriptions are read-only. Model settings/revision and prompt snapshots/revision come from bootstrap, not separate read RPCs. The server compares the corresponding version atomically before saving and increments it on change. A stale baseline rejects without modifying saved values; clients retain their dirty draft and must not silently advance its baseline when a change event arrives.

Discussion and review bindings freeze the public role, model, reasoning and prompt snapshot on admission. Provider and runtime model identity remain with the native owner; the settings revision is available on bootstrap, not on each binding. Reads and session recovery use `AIReqWorkflowTarget`; material reader paths and Release/history controls are not extra workflow keys.

Read-only code source settings carry `expectedRevision` and a stable `operationId` in their input. Existing-project writes require the captured project revision at admission; creation uses zero.

The allowlist defines configuration reads and writes, workflow reads and commands, and native session and file recovery. Configuration and project workspace reads use bootstrap metadata. Workflow commands, project saves and Skill preview saves retain their signature-specific version and idempotency guarantees. Model and prompt saves use revision only. Skill draft saves replace only the editable form fields and preserve server-owned conversation notes.

AIReq-specific automation operations and their native manifest are retired; generic automation controls remain outside this contract. Skill entrypoints remain hidden from main navigation, settings and search. Its retained implementation preserves exact employee/client session isolation, attachments, preview, save receipts and the unsaved-draft guard without exposing product entrypoints.

The workflow owner records admitting request identity and contact assignment history internally. Public receipts expose only `actorEmployeeId` for the operation records UI, omitting it when the historical actor is unknown; they do not expose the full identity or client ID. These mock records are not a durable audit database.

## Document versions and reviews

- Each IR has a requirements session and a solution session. Requirements is open to every employee. Solution and version confirmation require membership on the project's development or testing list, or the administrator.
- Current materials are projected in `view.materials`. The group projects `documentVersion` once files first exist, `documentHistory` for previously confirmed full snapshots and `documentReviews` for review runs. Release counts are derived from all IRs in the Release.
- An accepted material change updates an unconfirmed version in place. The first change after confirmation creates the next version; no actual file change leaves the version unchanged. Confirmation captures the server's latest full set of documents, keeps the current number, and records the admitting employee and time.
- `reviewDocuments` dispatches an independent read-only review against the latest file snapshot in the chosen Agent. Its report belongs to that conversation. `stale` is computed against current files and may change even when the version number stays the same. Reviews never write files or gate confirmation.
- `validateDocumentVersion` reads the latest material without changing the workflow. It reports version, file count, and the path and reason for each missing or invalid file. `confirmDocumentVersion` repeats the check before saving. On a validation failure its failed receipt includes the report in `documentValidation`.
- `confirmDocumentVersion` and `reviewDocuments` use the server's current materials and the same operation ID deduplication as other commands. Their caller's view revision does not gate admission. Other editing commands keep their existing CAS.
- Intake preserves the original short requirement. Optional Markdown content in a batch import begins V1. CSV export keeps the original text. The configured document headings govern the check before confirmation.

## Release surface

The normal binary RPC rejects all retired `prototype.*`, private scenarios, sample-model and collaboration-fixture operations. Its typed operation map, wire schemas, server registration and browser adapter expose the same business-only list. Nested parameters, operation/revision identifiers, model fields and selections are validated before domain admission. Explicit business failures use `BUSINESS_RULE_VIOLATION`; unknown exceptions become safe generic failures, including failures stored in result DTOs.

Bootstrap returns the contract version, opaque backend ID, business capabilities, optional `initialProjectId`, `projects.workspaces`, current model/prompt settings and optional Skill storage targets. The browser never fans out workflow queries to initialize this directory. Workspace kind is `proposal` or `unavailable`; read-only targets do not gain native edit access. The public workflow projection omits internal project/repository metadata, audit fields, `clientDraftId`, duplicate review-agent prompt snapshots and mock controls. Public workflow views and confirmed document snapshots do not carry a second constant version marker.

Deployment limitations belong only to the existing release and backend-replacement documentation, not login/help, prompts, user materials or public provenance. Actual in-memory operations may succeed; unsupported capabilities fail explicitly and no result claims external AI, repository verification, host-file writes or durable storage.

File paths, content hashes and byte lengths identify the input files of each review and determine whether a material save changed any file. Public documents do not include execution internals or request digests.

Navigation selection belongs only to UI Context: project, concrete Release and history. The service supplies same-owner workflow facts; reads do not write business facts.
