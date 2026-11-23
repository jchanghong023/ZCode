/** Named, explicit in-memory fixtures; no external model, repository or filesystem operations. */
export const SUPPORTED_AIREQ_DEMOS = [
  "empty-projects",
  "empty-releases",
  "empty-requirements",
  "missing-material",
  "material-read-failure",
  "session-read-failure",
  "send-failure",
] as const;
