import type { AIReqProjectProgress } from "./progress-types.js";

/** Caller identity records provenance and isolates private sessions; it is not authorization. */
export interface AIReqIdentity {
  employeeId: string;
  clientId: string;
  demo?: string;
}

/** Phase-one frontend presentation contracts. No OMP runtime dependency or execution authority. */
export const AIREQ_WORKFLOW_VERSION = 1 as const;
export const AIREQ_WORKFLOW_STAGES = ["planning", "executing", "pr"] as const;
export type AIReqWorkflowStage = (typeof AIREQ_WORKFLOW_STAGES)[number] | "solution";
export type AIReqRequirementStatus =
  | "draft"
  | "solution-ready"
  | "requirements-pr"
  | "formal"
  | "frozen"
  | "deleted"
  | "reviewing"
  | "confirmed";
export interface AIReqObjectRef {
  projectId: string;
  irId: string;
  srId?: string;
}
export interface AIReqNativeSessionRef extends AIReqObjectRef {
  sessionId: string;
  sessionFile: string;
  role: "requirements" | "solution" | "reviewer" | "ir-acceptance" | AIReqWorkflowStage;
  phase: "requirements" | "solution" | "ir-acceptance" | AIReqWorkflowStage;
  round: number;
  modelConfig?: AIReqAgentModelBinding;
}
export interface AIReqFileVersion {
  path: string;
  sha256: string;
  size: number;
}
export interface AIReqProject {
  id: string;
  name: string;
  storageName?: string;
  root: string;
  commonDir: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  defaultBranch: string;
  remote?: string;
  repositoryId: string;
  repositoryUrl?: string;
}
export interface AIReqRemoteRepositoryInput {
  projectId?: string;
  name: string;
  repositoryUrl: string;
  defaultBranch: string;
  /** Existing project updates require its editing baseline; creation uses zero. */
  expectedRevision?: number;
  operationId?: string;
}
export interface AIReqRelease {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
}
export interface AIReqWorktree {
  path: string;
  branch: string;
  baseCommit: string;
}
export interface AIReqProposalFeedbackNote {
  employeeId: string;
  returnedAt: string;
  reason: string;
  resumedAt?: string;
}
export type AIReqReviewAgentId = "a" | "b" | "c" | "summary";
export interface AIReqReviewAgent {
  id: AIReqReviewAgentId;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  session: AIReqNativeSessionRef;
  report: string;
  promptSnapshot?: string;
}
export interface AIReqReview {
  kind?: "original" | "full";
  invalidatedReason?: string;
  held?: boolean;
  agents?: AIReqReviewAgent[];
  humanDecision?: { employeeId: string; decidedAt: string; reviewId: string };
  id: string;
  snapshotDigest: string;
  passed: boolean;
  report: string;
  modelConfig?: AIReqAgentModelBinding;
  inputFiles?: AIReqFileVersion[];
  requestedBy?: string;
  round?: number;
  findings?: {
    id: string;
    level: "blocking" | "suggestion";
    message: string;
    documentPath: string;
  }[];
  reviewer:
    | AIReqNativeSessionRef
    | { sessionId: string; role: "reviewer"; sourceProjectId: string; imported: true };
  createdAt: string;
}
export interface AIReqConfirmation {
  operationId: string;
  snapshotDigest: string;
  confirmedAt: string;
}
export interface AIReqRequirementSnapshot {
  version: 1;
  projectId: string;
  irId: string;
  title: string;
  srs: { id: string; title: string; documentPath: string }[];
  documentPath: string;
  files: AIReqFileVersion[];
  digest: string;
}
export interface AIReqPrFact {
  url: string;
  sourceBranch: string;
  targetBranch: string;
  recordedAt: string;
  platformVerified: false;
  number?: number;
  title?: string;
  body?: string;
  status?: "opened" | "merged" | "closed";
}
export interface AIReqMergeFact {
  commit: string;
  branch: string;
  checkedAt: string;
  files: AIReqFileVersion[];
}
export interface AIReqProposalDelivery {
  candidate: string;
  version: string;
  files: AIReqFileVersion[];
  confirmedBy: string;
  confirmedAt: string;
  pushedCandidate?: string;
  pushedAt?: string;
  prCandidate?: string;
  branch?: { name: string; baseCommit: string; createdAt: string; pushedAt: string };
  mergeScenario?: AIReqProposalMergeScenario;
  mergeCheck?: {
    status: "waiting" | "unmerged" | "incomplete" | "failed" | "merged";
    checkedAt?: string;
    nextCheckAt?: string;
    message: string;
  };
}
export type AIReqProposalMergeScenario =
  | "unmerged"
  | "merged"
  | "incomplete"
  | "failed"
  | "mr-closed"
  | "stale-version";
export interface AIReqRequirementsDecision {
  reviewId: string;
  snapshotDigest: string;
  inputFiles: AIReqFileVersion[];
  opinion: string;
  outcome: "supplement" | "maintain" | "defer";
  result: string;
  employeeId: string;
  createdAt: string;
  review: AIReqReview;
}
export interface AIReqProposalRevision {
  reason: string;
  employeeId: string;
  startedAt: string;
  completedAt?: string;
  snapshot: AIReqRequirementSnapshot;
  merge: AIReqMergeFact;
  materials: AIReqMaterialView[];
  requirementsPr?: AIReqPrFact;
  delivery?: AIReqProposalDelivery;
  review?: AIReqReview;
}
export interface AIReqRequirementDeletion {
  version: 1;
  operationId: string;
  deletedAt: string;
  manualCloseNeeded: boolean;
  requirementsPrUrl?: string;
}
export interface AIReqStageApproval {
  stage: AIReqWorkflowStage;
  round: number;
  operationId: string;
  digest: string;
  files: AIReqFileVersion[];
  approvedAt: string;
  valid?: boolean;
}
export interface AIReqStageMaterial extends AIReqFileVersion {
  stage: AIReqWorkflowStage;
  kind: "solution" | "plan" | "completion" | "ut" | "st" | "delivery";
  round: number;
  valid: boolean;
}
export interface AIReqSrDelivery {
  candidate: string;
  round: number;
  defaultCommit: string;
  inputDigest: string;
  inputs: AIReqFileVersion[];
  files: (AIReqFileVersion & { category: "code" | "test" | "spec" })[];
  manifestPath: string;
  sourceChange: string;
  sourceSpec: string;
  status:
    | "prepared"
    | "verified"
    | "implementation-issue"
    | "git-conflict"
    | "requirement-conflict";
  verification?: { candidate: string; defaultCommit: string; checkedAt: string };
  pushedCandidate?: string;
  prCandidate?: string;
  humanResolution?: { note: string; employeeId: string; resolvedAt: string };
}
export interface AIReqSystemRequirement {
  testingEmployeeId?: string;
  lastAnalysisFailure?: { message: string; at: string };
  testAcceptance?: AIReqTestAcceptance;
  acceptanceHistory?: AIReqTestAcceptance[];
  developmentIssues?: AIReqDevelopmentIssue[];
  planning?: AIReqSrPlanning;
  solutionAnalysis?: AIReqSrSolutionAnalysis;
  progress?: AIReqProgressAnalysis;
  trackingBranch?: { name: string; baseCommit: string; createdAt: string; pushedAt: string; status?: "ready" | "failed" | "deleted"; error?: string; deletedAt?: string; nextCleanupFailure?: boolean };
  ompWebId?: string;
  id: string;
  projectId: string;
  irId: string;
  title: string;
  documentPath: string;
  status: "pending" | "developing" | "completed";
  stage?: AIReqWorkflowStage | "solution";
  round: number;
  delivery?: AIReqSrDelivery;
  deliveryHistory?: AIReqSrDelivery[];
  dependencySrIds?: string[];
  developerEmployeeId?: string;
  startedAt?: string;
  developmentRoot?: string;
  worktree?: AIReqWorktree;
  sessions: AIReqNativeSessionRef[];
  approvals: AIReqStageApproval[];
  materials: AIReqStageMaterial[];
  materialDigest?: string;
  codePrHistory?: AIReqPrFact[];
  codePr?: AIReqPrFact;
  codeMerge?: AIReqMergeFact;
}
export interface AIReqIrAcceptance {
  status: "reviewing" | "issues" | "passed" | "pr-ready" | "pr-submitted" | "completed";
  employeeId: string;
  startedAt: string;
  session: AIReqNativeSessionRef;
  worktree: AIReqWorktree;
  baseCommit: string;
  candidate: string;
  revision: number;
  reportPath?: string;
  reportCandidate?: string;
  reportBaseCommit?: string;
  reportVersion?: AIReqFileVersion;
  srMergeVersion?: string;
  hasFixes: boolean;
  finalPrPath?: string;
  finalPrVersion?: AIReqFileVersion;
  pr?: AIReqPrFact;
  archive?: {
    sourceRoot: string;
    targetRoot: string;
    skipSpecs: boolean;
    moves: (AIReqFileVersion & { sourcePath: string })[];
    fixes: AIReqFileVersion[];
  };
  packageVersion?: string;
  pushedCandidate?: string;
  pushedPackageVersion?: string;
  prCandidate?: string;
  prPackageVersion?: string;
  history?: {
    candidate: string;
    baseCommit: string;
    status: string;
    reportPath?: string;
    finalPrPath?: string;
    prUrl?: string;
  }[];
  archiveResult?: { sourceAbsent: boolean; targetFiles: AIReqFileVersion[]; skipSpecs: boolean };
  merge?: AIReqMergeFact;
}
export interface AIReqSrSolutionAnalysis {
  approach: string;
  dependencyReason: string;
  parallelSrIds: string[];
  uncertainties: string[];
}
export interface AIReqSrPlanningInput {
  developerEmployeeId?: string;
  plannedStart?: string;
  testingEmployeeId?: string;
  operationId?: string;
  expectedRevision?: number;
  plannedEnd?: string;
}
export interface AIReqSrPlanning extends AIReqSrPlanningInput {
  source: "ai" | "manual";
  assumptions: string;
  suggestion?: AIReqSrPlanningInput;
  updatedBy?: string;
  updatedAt?: string;
}
export interface AIReqRequirementGroup {
  originalText: string;
  submittedBy: string;
  sourceIrId?: string;
  contacts?: { business?: string; development?: string; testing?: string };
  contactHistory?: { employeeId: string; at: string; contacts: { business?: string; development?: string; testing?: string } }[];
  originalReview?: AIReqReview;
  originalReviewHistory?: AIReqReview[];
  alignment?: AIReqAlignment[];
  alignmentHistory?: AIReqAlignment[];
  materialHistory?: { version: string; reason: string; changedAt: string; materials: AIReqMaterialView[] }[];
  reviewScenarios?: { original?: AIReqReviewScenario; full?: AIReqReviewScenario };
  heldReviews?: AIReqReview[];
  rejectedReviewResults?: { reviewId: string; reason: string; at: string }[];
  branchCreationFailures?: string[];
  ownerEmployeeId?: string;
  clientDraftId?: string;
  ompWebId?: string;
  id: string;
  projectId: string;
  releaseId: string;
  title: string;
  documentPath: string;
  origin: "local" | "browser" | "import";
  status: AIReqRequirementStatus;
  revision: number;
  srIds: string[];
  files: AIReqFileVersion[];
  evidenceFiles?: AIReqFileVersion[];
  retiredFiles?: AIReqFileVersion[];
  worktree?: AIReqWorktree;
  sessions: AIReqNativeSessionRef[];
  snapshot?: AIReqRequirementSnapshot;
  confirmation?: AIReqConfirmation;
  review?: AIReqReview;
  reviewHistory?: AIReqReview[];
  requirementsPr?: AIReqPrFact;
  merge?: AIReqMergeFact;
  createdAt: string;
  proposalDelivery?: AIReqProposalDelivery;
  proposalDeliveryHistory?: AIReqProposalDelivery[];
  proposalRevisions?: AIReqProposalRevision[];
  revising?: boolean;
  requirementsDecisions?: AIReqRequirementsDecision[];
  deletion?: AIReqRequirementDeletion;
  freeze?: {
    frozenAt: string;
    frozenBy: string;
    title: string;
    snapshotDigest: string;
    files: AIReqFileVersion[];
    srIds: string[];
    dependencies: Record<string, string[]>;
  };
  developmentStartedAt?: string;
  srDependencyFile?: AIReqMaterialView;
  acceptance?: AIReqIrAcceptance;
  proposalStage?: "requirements" | "solution";
  proposalRound?: number;
  developerHandoff?: { employeeId: string; submittedAt: string };
  developerAcceptance?: { employeeId: string; acceptedAt: string; round: number };
  requirementSupplements?: {
    note: string;
    employeeId: string;
    createdAt: string;
    round?: number;
  }[];
  proposalSolution?: {
    path: string;
    employeeId: string;
    generatedAt: string;
    round: number;
    valid: boolean;
    requirementsDigest?: string;
  };
  returnFeedback?: AIReqProposalFeedbackNote;
  returnFeedbackHistory?: AIReqProposalFeedbackNote[];
  /** directory 是 IR 所属 OMP 项目 dir，不是每提案临时目录；会话历史由 OMP 管理。 */
  proposalLocation?: { projectName: string; employeeId: string; directory: string };
}
export interface AIReqOperationReceipt {
  operationId: string;
  /** Request identity captured at admission; absent on historical sample receipts. */
  identity?: AIReqIdentity;
  commandDigest: string;
  type: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  revision: number;
  irId?: string;
  srId?: string;
  steps: { name: string; at: string; detail: string }[];
  error?: string;
  deletion?: AIReqRequirementDeletion;
}
export interface AIReqMaterialView extends AIReqFileVersion {
  projectId: string;
  irId: string;
  srId?: string;
  kind:
    | "ir"
    | "sr"
    | "solution"
    | "test-plan"
    | "acceptance"
    | AIReqStageMaterial["kind"]
    | "attachment"
    | "ir-acceptance-report"
    | "ir-final-pr"
    | "sr-delivery-package";
  stage?: AIReqWorkflowStage;
  round?: number;
  valid: boolean;
  content?: string;
  error?: string;
}
export interface AIReqChangedFile extends AIReqFileVersion, AIReqObjectRef {
  status: string;
}
export interface AIReqRepositoryAIReqelopment {
  repositoryId: string;
  limit: number;
  activeSrs: AIReqSystemRequirement[];
  owners: (AIReqObjectRef & { title: string })[];
}
export interface AIReqWorkflowView {
  todos?: AIReqTodo[];
  projectProgress?: AIReqProjectProgress[];
  ompWebId?: string;
  version: 1;
  revision: number;
  projects: AIReqProject[];
  currentProjectId?: string;
  releases: AIReqRelease[];
  groups: AIReqRequirementGroup[];
  drafts: AIReqRequirementGroup[];
  srs: AIReqSystemRequirement[];
  selected?: AIReqObjectRef;
  materials: AIReqMaterialView[];
  operations: AIReqOperationReceipt[];
  sessions: AIReqNativeSessionRef[];
  repositoryDevelopment?: AIReqRepositoryAIReqelopment;
  repositoryHeads?: Record<string, string>;
  workspace?: { path: string; identity: string };
  running: AIReqNativeSessionRef[];
  changes?: AIReqChangedFile[];
  error?: string;
}
export interface AIReqCommandBase {
  operationId: string;
  expectedRevision: number;
  projectId?: string;
  irId?: string;
  srId?: string;
}
export type AIReqWorkflowCommand = AIReqCommandBase &
  (
    | { type: "createRelease"; title: string }
    | {
        type: "createProposal";
        originalText: string;
        sourceIrId?: string;
        clientDraftId?: string;
        releaseId: string;
      }
    | { type: "importProposals"; releaseId: string; originalTexts: string[] }
    | { type: "assignContacts"; contacts: { business?: string; development?: string; testing?: string } }
    | { type: "runFullReview" }
    | { type: "approveFullReview"; reviewId: string; snapshotDigest: string }
    | { type: "confirmAlignment"; perspective: "business" | "development" | "testing"; version: string }
    | { type: "closeProposalPr"; candidate: string }
    | { type: "retrySrBranch"; srId: string }
    | { type: "reviseProposalMaterial"; target: "requirements" | "solution" | "test-plan"; note: string }
    | { type: "deleteRequirement"; version: 1; projectId: string; irId: string }
    | { type: "submitProposalReview" }
    | { type: "acceptProposal"; reviewId?: string; snapshotDigest?: string }
    | { type: "runRequirementsReview" }
    | { type: "generateRequirements"; note: string }
    | { type: "supplementRequirements"; note: string }
    | { type: "generateProposalSolution" }
    | { type: "returnProposal"; reason: string }
    | { type: "confirmProposal"; version: string }
    | { type: "publishProposal"; candidate: string }
    | { type: "markRequirementsPrSubmitted"; url: string; candidate: string }
    | { type: "markRequirementsMerged"; candidate: string; defaultBranchFilesConfirmed: boolean }
    | {
        type: "recordRequirementsDecision";
        reviewId: string;
        snapshotDigest: string;
        opinion: string;
        outcome: AIReqRequirementsDecision["outcome"];
        result: string;
      }
    | { type: "stop" }
  );
/** Internal generation/merge completion is server-only; browser actions cannot bypass discussion or MR checks. */
type AIReqBrowserCommand = Exclude<
  AIReqWorkflowCommand,
  {
    type:
      | "generateRequirements"
      | "supplementRequirements"
      | "generateProposalSolution"
      | "markRequirementsPrSubmitted"
      | "markRequirementsMerged";
  }
>;
export type AIReqAction = AIReqBrowserCommand extends infer T
  ? T extends AIReqBrowserCommand
    ? Omit<T, "operationId" | "expectedRevision"> &
        Partial<Pick<AIReqCommandBase, "operationId" | "expectedRevision">>
    : never
  : never;
export interface AIReqWorkflowResult {
  operationId: string;
  projectId: string;
  revision: number;
  irId?: string;
  srId?: string;
  status: "completed" | "failed" | "running";
  receipt: AIReqOperationReceipt;
  view?: AIReqWorkflowView;
  error?: string;
  deletion?: AIReqRequirementDeletion;
}
export interface AIReqSelection {
  formalView?: "list" | "detail";
  reviewAgent?: AIReqReviewAgentId;
  materialPath?: string;
  proposalEditing?: boolean;
  proposalStep?: "requirements" | "requirements-review" | "solution" | "intake";
  freeDraftId?: string;
  proposalDraftId?: string;
  proposalDraftReleaseId?: string;
  irAcceptance?: boolean;
  freeSessionId?: string;
  freeFiles?: boolean;
  projectId?: string;
  irId?: string;
  srId?: string;
  stage?: AIReqWorkflowStage;
  stageRound?: number;
  discussionPhase?: "requirements" | "solution";
}

export interface AIReqProgressAnalysis {
  aiPercent?: number;
  inputFingerprint?: string;
  analysisFailure?: { message: string; at: string };
  stale?: boolean;
  percent: number;
  merged: boolean;
  certain: boolean;
  branch: string;
  analysedAt: string;
  codeVersion: string;
  defaultVersion: string;
  implemented: string[];
  remaining: string[];
  issues: { title: string; detail: string }[];
  activity: { commit: string; message: string; at: string }[];
  manual?: { employeeId: string; reason: string; at: string };
}
export interface AIReqNativeSurfaceTarget extends AIReqObjectRef {
  sessionId: string;
  phase: AIReqNativeSessionRef["phase"];
  round: number;
  clientId: string;
}
export type AIReqNativeUiState =
  | { method: "notify"; value: { message: string; type?: "info" | "warning" | "error" } }
  | { method: "setStatus"; value: { key: string; text: string | undefined } }
  | { method: "setWorkingMessage"; value: string | undefined }
  | {
      method: "setWidget";
      value: {
        key: string;
        content: string[] | undefined;
        options?: { placement?: "aboveEditor" | "belowEditor" };
      };
    }
  | { method: "setTitle" | "setEditorText" | "pasteToEditor"; value: string }
  | { method: "rerenderMessage"; value: number }
  | { method: "refreshTranscript"; value: readonly string[] }
  | { method: "setToolsExpanded"; value: boolean }
  | { method: "setHeader" | "setFooter"; value: null };
export type AIReqNativeUiStateEvent = AIReqNativeUiState & {
  t: "native-ui-state";
  target: AIReqNativeSurfaceTarget;
  sequence: number;
};
export interface AIReqNativePredictionSnapshot {
  target: AIReqNativeSurfaceTarget;
  generation: number;
  choices: readonly string[];
}
export type AIReqNativePredictionAction =
  | { type: "cancel" }
  | { type: "draft"; text: string }
  | { type: "shown"; generation: number }
  | { type: "accepted"; generation: number; rank: number };
export interface AIReqPeer {
  id: string;
  name: string;
  role: string;
  status: string;
  projectId: string;
  materials: { title: string; path: string; content: string }[];
  logs: { id: string; time: string; text: string }[];
}

export interface AIReqAgentModel {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  model: string;
  reasoning: string;
}

export interface AIReqAgentModelSettings {
  defaultModel: string;
  agents: AIReqAgentModel[];
}

export type AIReqAgentRole =
  | "requirements"
  | "requirements-review-a"
  | "requirements-review-b"
  | "requirements-review-c"
  | "requirements-review"
  | "solution"
  | "planning"
  | "execution"
  | "ir-acceptance"
  | "skill-design"
  | "progress-analysis";
export interface AIReqAgentModelBinding {
  role: AIReqAgentRole;
  roleName: string;
  modelKey: string;
  modelName: string;
  providerId: string;
  modelId: string;
  reasoning: string;
  inherited: boolean;
  configurationRevision: number;
}

export interface AIReqSkillDesignPreview {
  name: string;
  directory: string;
  revision: number;
  files: { path: string; content: string }[];
  /** Receipt belongs to this exact generated revision; regeneration clears it. */
  savedReceipt?: AIReqSkillSaveReceipt;
}

export interface AIReqSkillDesignDraft {
  goal: string;
  when: string;
  inputs: string;
  outputs: string;
  boundaries: string;
  references: string;
  example: string;
  notes: string[];
}

export type AIReqPrHandoffScenario =
  | "current"
  | "missing-directory"
  | "wrong-repository"
  | "change-conflict"
  | "stale-version";
export interface AIReqPrHandoffFile {
  path: string;
  sourcePath: string;
  targetPath: string;
  version: string;
  digest: string;
}
export interface AIReqPrHandoff {
  repositoryUrl?: string;
  ready: boolean;
  blockers: string[];
  employeeId: string;
  sourceDirectory: string;
  targetDirectory?: string;
  branch: string;
  targetBranch: string;
  changeRoot: string;
  files: AIReqPrHandoffFile[];
}
export interface AIReqPrHandoffInput {
  group: AIReqRequirementGroup;
  project?: AIReqProject;
  developmentRoot?: string;
  developmentDirectory?: { path: string; repositoryRoot?: string; git: boolean };
  employeeId: string;
  scenario?: AIReqPrHandoffScenario;
}

export interface AIReqWorkspace {
  path?: string;
  identity: string;
  kind: "free" | "proposal" | "development" | "reference" | "unavailable";
  error?: string;
  blockedPath?: string;
}

export interface AIReqSkillSaveReceipt {
  operationId: string;
  path: string;
  revision: number;
  target: "project" | "user";
  name: string;
}
export type AIReqReviewScenario = "normal" | "blocked" | "failed" | "hold";
export interface AIReqAlignment {
  perspective: "business" | "development" | "testing";
  version: string;
  employeeId: string;
  confirmedAt: string;
}
export interface AIReqTestAcceptance {
  operationId: string;
  outcome: "passed" | "failed";
  employeeId: string;
  at: string;
  reason: string;
  codeVersion: string;
}
export interface AIReqDevelopmentIssue {
  id: string;
  detail: string;
  failedCodeVersion: string;
  reportedBy: string;
  reportedAt: string;
  status: "open" | "awaiting-retest" | "resolved";
  fixCodeVersion?: string;
  resolvedAt?: string;
}
export interface AIReqTodo extends AIReqObjectRef {
  id: string;
  title: string;
  kind: "business-discussion" | "original-review" | "solution" | "full-review" | "alignment" | "publish" | "development" | "testing" | "fix" | "failure";
  employeeId?: string;
  perspective?: AIReqAlignment["perspective"];
  selection: AIReqSelection;
}
