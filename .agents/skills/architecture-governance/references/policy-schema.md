# Policy schema

`architecture-policy.yaml` contains `version: 1`, a list of modules, global thresholds, and optional exceptions.

Each module has an `id`, one or more `roots`, optional `managed: true`, `requires`, `provides`, `publicEntrypoints`, and an optional `owner`. Existing modules may remain unmanaged while they are in baseline migration.

路径预检覆盖全部模块（含 unmanaged）的每个 `roots`、`publicEntrypoints` 和所有 `exceptions[].paths`，不受 `--changed` 或 baseline 豁免。root 可为现存文件或目录；公开入口必须为文件，可按仓库或模块 root 相对路径解析。精确例外可指向文件或目录；通配例外使用 Node 内置 glob，必须命中真实文件，跳过 `node_modules` 与 `dist`。裁撤模块时删除失效登记及其 `requires` 引用，只清除已删模块或不存在路径的 baseline 记录；保留现存模块治理状态与已有缺产物记录，不批量补空产物。

`global.browserScopes`、`global.browserPackages`、`global.nodeEntrypoints`、`global.nativePackages` 默认均为 `[]`，分别声明浏览器源码范围、浏览器安全包面、Node 专属公共入口和原生依赖，供全局浏览器边界检查使用。运行时依赖图包含静态 import/export、字面量 `import(...)` 与 `require(...)`；无插值模板也属于字面量，不猜测计算表达式。`import type`、`import("...")` 类型表达式及全成员 type-only 的 import/export 保留类型边标记，避免当作运行时 IO；浏览器契约对 Node 专属实现的类型引用仍受边界约束。

Global keys: `maxFileLines`, `maxContractLines`, `maxPublicMethods`, `forbidCycles`, `forbidDeepImports`, `managedOnly`, `newFilesRequireManagedModule` (default true), `newFileScopes` (default `[packages, apps]`) and `newFilesEnforcedSince` (date; tracked files first added before it are not subject to `unmanaged-new-file`, untracked files always are). Canonical layer names are `contract`, `domain`, `app`, `adapters`, `ui`; `layerOrder` lists them from lowest to highest and a layer may only import lower layers.

Date-only `newFilesEnforcedSince` values start at 00:00:00 UTC, independent of the current clock and host timezone. Explicit timestamps retain their timezone. The live checker and exported upstream snapshot use the same history query.

The policy owns path and layer topology. A module's `module.ts` owns its local dependency declaration. Do not add a second hand-maintained dependency graph. Register a new module only after its paths exist: the implementing owner supplies `module.ts`, `contract.ts`, `contract.example.ts`, and `CONTRACT.md` with real behavior, while the registration writes only the policy entry (`id`, `roots`, layers, owner, file-level `publicEntrypoints`, and the exact `requires` mirrored by `module.ts`). Do not pre-register later-phase directories or scaffold empty artifacts to satisfy registration.

An `unmanaged-new-file` exception is for an edit that touches only existing files: list the exact files (or an existing narrow directory) actually changed; do not use a wildcard to open an entire unmanaged tree. Exceptions cannot waive browser-boundary or path-integrity rules, and they do not replace registering a new source directory.

`global.acceptedUpstreamCommits` optionally records reviewed upstream admissions as `{ commit, previousHead, reason }`. Both hashes must be full commit SHAs already merged into HEAD. Only paths introduced by that upstream relative to `previousHead`, with identical Git content and modes in both index and working tree, are exempt from `unmanaged-new-file`. Local additions, edits, renames, untracked files and later edits of previously admitted files remain subject to module registration. Other architecture rules and the real push/CI diff scope are unchanged. Current module ownership and registration rules are recorded in `docs/architecture/pure-web-module-ownership.md`.

`global.acceptedUpstreamSnapshot` optionally points to a generated repository-relative JSON manifest for a separately exported Git history. It is mutually exclusive with nonempty `acceptedUpstreamCommits`. The manifest records public source paths, fixed Git blob IDs and modes, introduced paths, and historical source snapshots from before the enforcement date; both index and working tree must still match. Historical snapshots only preserve the original date scope and do not admit lint diagnostics. It does not admit changed content or waive other rules. See `docs/testing/opensource-export-validation.md` for export generation and regression requirements.
