---
name: architecture-governance
description: Check ZCode module and layer boundaries for code changes. Generate bounded context for cross-module or ownership changes; skip documentation-only work.
---

# Architecture governance

Use this skill before editing code in the ZCode repository. It is a design guide as well as a gate: the goal is to make the intended architecture obvious before code is generated, so the checker confirms a decision instead of discovering it for the first time.

Current repository scope and retained documentation are indexed by [docs/README.md](../../../docs/README.md). Read [module ownership](../../../docs/architecture/pure-web-module-ownership.md) before treating retained contracts or controls as mounted product capabilities. Current verification policy is [unit-test-quality.md](../../../docs/testing/unit-test-quality.md); retained test infrastructure does not imply existing App test cases or a pre-push hook.

## Before writing code

1. Identify intended files and modules from the task, contracts and current source. Follow the task’s verification instructions; when architecture verification is required, use `bun run architecture:check --changed`. A clean diff does not identify files you have not edited yet.
2. For cross-module changes, state ownership changes, or an unclear contract, use `bun run architecture:context <module-id>` (or `bun .agents/skills/architecture-governance/scripts/context-package.mjs <module-id>`). For a local change with a known contract, read only the relevant contract, retained spec and affected source; expand when a concrete dependency or evidence gap requires it.
3. Follow [AGENTS.md](../../../AGENTS.md) and update the existing relevant spec or contract when behavior changes. Keep documentation about current rules, not task histories, superseding patches or duplicate feature plans.
4. For changes to mutable state, asynchronous behavior, or module boundaries, make the relevant design decisions before coding:
   - **One owner:** name the single component that owns each piece of mutable state. Other layers read through its contract and send commands; they do not keep a second accepted queue, cache, or derived truth.
   - **One path:** reuse an existing command, service, hook, adapter, or contract when it already expresses the behavior. Do not create a parallel helper for the same responsibility.
   - **Explicit boundaries:** choose the layer for every new file and the public contract for every cross-module edge. Layers from low to high are `contract < domain < app < adapters < ui`; a file may import only its own layer or lower ones through their public surface. `domain` is pure (no IO, no `await` on the world), `app` decides side effects through ports, `adapters` executes them, `ui` depends only on this module's `contract.ts`. Quick test: needs `await`? not domain. Knows it is sqlite / MessagePort / a timer? adapters.
   - **Explicit time:** for asynchronous or remote behavior, write the event order, owner/lease, idempotency key, stale-result rule, replay/resume boundary, and desktop versus mobile delivery kind before implementation.
   - **Bounded context:** use the relevant contracts, specs, and tests. A generated reading package helps when dependencies are unclear; do not require a whole-module reading pass for every local edit.
5. If the change alters a public contract, ownership, or allowed dependency, record that decision in the relevant spec/contract before implementation. Editing files in two modules alone does not require a new document. Use the root task boundary for when to consult the user; ordinary authorized implementation choices proceed autonomously.

Use this compact design sketch while planning stateful changes:

```text
input → single owner → command admission → state transition → contract/event
                  └── persistence / replay / projection are derived from the owner
```

For streaming changes, make the current delivery boundary explicit:

```text
browser connection → subscription scope → same owner and ordered watermarks
reconnect → fresh read / subscription, never automatic mutation replay
```

## During and after editing

6. Keep changes inside the declared module and its allowed layer direction. Add a module dependency or public contract before introducing a cross-module edge.
7. When required by the task’s verification instructions, run `bun run architecture:check --changed` after editing. Report new violations separately from baseline violations; include owners and event-order assumptions when affected. Follow the root validation policy and do not claim unrun checks.

The executable policy is `architecture-policy.yaml`; keep its detailed rule definitions there. Check the actual managed-module coverage before claiming the gate verifies a boundary: a passing result does not prove unconfigured modules or runtime semantics are correct. Use `bun run architecture:baseline:update` only when a reviewed change intentionally changes the accepted legacy baseline. CI never refreshes baseline automatically.

Every new source file under `packages/` or `apps/` must belong to a managed module (rule `unmanaged-new-file`). When the change needs a directory that is not managed yet, register it first:

```text
bun run architecture:adopt <module-id> --root <dir> [--root <dir2>] --layer <domain|app|adapters|ui> [--owner <group>]
```

`adopt` infers `requires` from the real imports, scaffolds the four artifacts if missing, and registers the module in `architecture-policy.yaml` without touching existing comments. Fill `contract.ts` and `CONTRACT.md` before adding behavior; keep the module's public surface to one intent per method.

For a new managed module, provide `module.ts`, `contract.ts`, `contract.example.ts`, and a short `CONTRACT.md`. Do not scaffold `contract.test.ts`; retain the existing Vitest configuration and test infrastructure according to the repository verification policy. Keep runtime and persistence details behind the contract. Prefer typed service calls for one-to-one interactions, commands for state changes, and typed events for broadcast facts.

See [policy-schema.md](references/policy-schema.md), [module-contract.md](references/module-contract.md), and [rule-catalog.md](references/rule-catalog.md) when the change needs their detailed guidance. The [golden-module](references/golden-module) fixture is the smallest compliant example.
See [ai-guidance.md](references/ai-guidance.md) for the anti-patterns this workflow is designed to prevent and the questions an agent must answer before proposing code.
