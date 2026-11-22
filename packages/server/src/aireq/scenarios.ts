/** Named, explicit in-memory fixtures; no external model, repository or filesystem operations. */
export const SUPPORTED_AIREQ_DEMOS = [
  "review-chat",
  "proposal-feedback",
  "proposal-intake",
  "requirements-review",
  "empty-projects",
  "empty-releases",
  "empty-requirements",
  "missing-requirement",
  "missing-sr",
  "missing-material",
  "material-read-failure",
  "session-read-failure",
  "send-failure",
  "operation-failure",
  "mr-create-failure",
] as const;

/** Controls provide external mock results only; the ordinary owner still applies all gates. */
export const PROTOTYPE_REVIEW_SCENARIOS = ["normal", "blocked", "failed", "hold"] as const;
export const PROTOTYPE_PROPOSAL_MERGE_SCENARIOS = [
  "unmerged",
  "merged",
  "incomplete",
  "failed",
  "mr-closed",
  "stale-version",
] as const;
