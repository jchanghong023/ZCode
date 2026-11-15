/** Tracking pages consume read projections; all accepted business state belongs to AIReq service.
 * Events invalidate reads, never replay mutations. Query generations discard late responses.
 * Issue scope is project-only; drafts and request IDs survive Release changes and failures.
 * Formal row selection updates only the inspector, preserving mounted table and its UI state.
 */
export type IssuePage = "issueCreate" | "issueAnalysis" | "issueProgress";
export interface BranchCopyProps {
  branch: string;
  compact?: boolean;
  onMessage(message: string): void;
}
