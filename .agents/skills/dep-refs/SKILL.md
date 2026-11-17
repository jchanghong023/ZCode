---
name: dep-refs
description: Inspect TypeScript export references in this workspace, list exports, and trace callers or re-exports before changing a public symbol.
disable-model-invocation: true
---

# Dep Refs

Use the repository's `bun run dep:refs` CLI to answer symbol-level questions before changing or deleting TypeScript exports. Run commands from the repository root.

## Workflow

Start broad when deleting code:

```bash
bun run knip
```

Use `knip` to find likely unused exports, then inspect any risky or unclear export with `dep:refs`:

```bash
bun run dep:refs packages/services/src/aireq/progress.ts:srProgress
```

List all exports in a file when the exact symbol name is unknown:

```bash
bun run dep:refs --list-exports packages/services/src/aireq/progress.ts
```

Use scoped scans for fast exploration only when the scope is intentionally limited:

```bash
bun run dep:refs --scope packages/services packages/services/src/aireq/progress.ts:srProgress
```

Before claiming an export is safe to delete, prefer an unscoped `dep:refs` run so cross-package callers are not missed.

## JSON Mode

Request machine-readable output explicitly:

```bash
bun run dep:refs packages/services/src/aireq/progress.ts:srProgress --json | jq .
```

Use JSON when summarizing many symbols, feeding results to `jq`, or comparing `references` and `reExports` counts programmatically.

## Interpreting Results

Treat `References (0)` and `Re-exports (0)` as "no static references found", not as proof that no dynamic usage exists.

If a symbol only appears under `Re-exports`, trace the outward barrel path before deleting. A re-export can still be part of the public surface even when there are no direct internal imports.

For refactors, report concrete callers with file and line from the CLI output, then decide whether to update callers, preserve the export, or delete it.
