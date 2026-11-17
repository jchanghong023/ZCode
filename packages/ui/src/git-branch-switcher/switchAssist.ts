import type { GitBranchMutationIssue, GitIdentity } from "@zcode/shared";
import type { GitBranchCommitPreviewFile } from "./display.js";

export type GitBranchSwitchAssistDialogStep = "blocked" | "commit";

export interface GitBranchSwitchAssistState {
  targetBranchName: string;
  currentBranchName: string | null;
  issue: GitBranchMutationIssue;
  affectedFiles: GitBranchCommitPreviewFile[];
  commitFiles: GitBranchCommitPreviewFile[];
  stagePaths: string[];
  fileCount: number;
  totalAdded: number;
  totalRemoved: number;
  identity: GitIdentity | null;
}

export function formatGitBranchIssuePathList(locale: string, paths: readonly string[]): string {
  if (paths.length === 0) {
    return "";
  }

  return new Intl.ListFormat(locale, {
    style: "short",
    type: "conjunction",
  }).format(paths);
}

export function hasGitCommitIdentity(identity: GitIdentity | null): boolean {
  return identity === null || (Boolean(identity.userName) && Boolean(identity.userEmail));
}
