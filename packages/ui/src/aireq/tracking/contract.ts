/** Tracking pages consume read projections; all accepted business state belongs to AIReq service.
 * Events invalidate reads, never replay mutations. Query generations discard late responses.
 * Formal row selection updates only the inspector, preserving mounted table and its UI state.
 */
export interface BranchCopyProps {
  branch: string;
  onMessage(message: string): void;
}
