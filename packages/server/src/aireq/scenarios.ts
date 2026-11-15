/** Named, explicit in-memory fixtures; no external model, repository or filesystem operations. */
export const SUPPORTED_AIREQ_DEMOS = [
  "analysis-scale",
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
