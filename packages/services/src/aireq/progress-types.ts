export const PROGRESS_STATUSES = ["待开发", "开发中", "待合入", "待验收", "已完成"] as const;
export type AIReqProgressStatus = (typeof PROGRESS_STATUSES)[number];

/** The one human sign-off bound to the SR's first default-branch merge. */
export interface AIReqTestAcceptance {
  operationId: string;
  outcome: "passed";
  employeeId: string;
  at: string;
  reason: string;
  codeVersion: string;
}

/** Read-only progress projections; no accepted business state lives here. */
export interface AIReqProgressSummary {
  proposalCount: number;
  formalCount: number;
  srCount: number;
  unanalyzedCount: number;
  percent: number | null;
  requirements: Array<{
    irId: string;
    releaseId: string;
    originalText: string;
    srCount: number;
    unanalyzedCount: number;
    percent: number | null;
  }>;
}
export interface AIReqProjectProgress {
  projectId: string;
  total: AIReqProgressSummary;
  releases: Array<{ releaseId: string; title: string; createdAt: string } & AIReqProgressSummary>;
}
