import type { ManagedWorktreeEntry, ManagedWorktreeError } from "@zcode/shared";

export interface ManagedWorktreeGroup {
  sourceRoot: string;
  worktrees: ManagedWorktreeEntry[];
}

export interface ManagedWorktreeWorkspace {
  /** 任务所属 workspace（项目主目录）。 */
  workspacePath: string;
  workspaceIdentity?: string;
}

/** Result DTO retained for generic worktree presentation controls. */
export type StartManagedWorktreeCreationResult =
  | { ok: true; creationId: string }
  | { ok: false; error: ManagedWorktreeError };
