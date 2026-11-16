import type { ManagedWorktreeGroup } from "./contract.js";

/** Generic controls consume worktree groups as supplied presentation data. */
export function exampleManagedWorktreeGroup(group: ManagedWorktreeGroup) {
  return { sourceRoot: group.sourceRoot, worktreeCount: group.worktrees.length };
}
