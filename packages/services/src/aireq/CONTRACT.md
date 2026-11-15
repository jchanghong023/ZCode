# AIReq shared contract

Browser-safe public entry: `@zcode/services/aireq`. No React, Node, transport implementation or mutable business store lives here. Domain functions inspect supplied snapshots only. Historical delivery fields remain readable; retired execution and acceptance commands are not public operations.

`IAIReqService.bootstrap(identity)` reads metadata and configuration. `call(identity, path, args, selection?)` is the only business RPC lane, on the existing binary Channel. Every invocation carries employeeId/clientId and optional named demo. The server validates identity, permissions, current versions and idempotency before changing its single shared in-memory state. After committing it emits `onDidChange`; clients re-read the current projection and discard stale reads. Refresh/reconnect never replays mutations. Process restart restores sample data.

`AIReqDataSource` describes non-React UI integration: synchronous configuration projections, async domain operations, native session/workspace resolution and subscriptions. Unsent drafts and selection belong to each client; accepted projects, releases, requirements, tasks and reports belong only to the server. Native conversations use the current v4 service, not fake business event frames. Failures reject and retain user input; no fallback to another object's sample. Issue types, operations and events are retired; requirement-report risk fields remain supported.

Model and prompt saves require the editing baseline `expectedRevision` as the second argument. Model revision comes from `models.revision`; prompt snapshots (including bootstrap) carry `revision`. The server compares the corresponding version atomically before saving and increments it on success. A stale baseline rejects without modifying saved values; clients retain their dirty draft and must not silently advance its baseline when a change event arrives.

Project repository updates carry `expectedRevision` and a stable `operationId` in their input. Existing-project writes require the captured project revision at admission; creation uses zero. Analysis execution details may retain an immutable `promptSnapshot` (additional instructions plus opaque revision token), independent of subsequent configuration changes.

See `docs/specs/aireq-migration/contract-design.md` for permissions, material version gates and completion rules. The example demonstrates typed reads and event invalidation without creating duplicate work.
