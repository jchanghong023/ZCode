import { z } from "zod";
import type { AIReqDocumentFormats, AIReqMaterialCheck } from "./document-formats.js";
import type { AIReqAgentModelBinding } from "./model-types.js";
export { AIREQ_AGENT_ROLES } from "./model-types.js";
export type {
  AIReqAgentModel,
  AIReqAgentModelSettings,
  AIReqAgentRole,
  AIReqAgentModelBinding,
} from "./model-types.js";

/** Caller identity records provenance and isolates private sessions; it is not authorization. */
export interface AIReqIdentity {
  employeeId: string;
  clientId: string;
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
/** 由当前有效材料和确认事实推导，不作为可写生命周期字段。 */
export type AIReqProposalState =
  | "not-started"
  | "ir-review-pending"
  | "ir-confirmation-pending"
  | "solution-incomplete"
  | "solution-review-pending"
  | "solution-confirmation-pending"
  | "submission-pending"
  | "merge-pending";
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
/** A global unplanned need; it is consumed when admitted to one or more releases. */
export interface AIReqIdea {
  id: string;
  originalText: string;
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface AIReqIdeaTarget {
  projectId: string;
  releaseId: string;
}
export interface AIReqIdeaTransfer extends AIReqIdeaTarget {
  irId: string;
}
export interface AIReqWorktree {
  path: string;
  branch: string;
  baseCommit: string;
}
export interface AIReqProposalFeedbackNote {
  employeeId: string;
  returnedAt: string;
  round: number;
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
  agents?: AIReqReviewAgent[];
  humanDecision?: {
    employeeId: string;
    decidedAt: string;
    reviewId: string;
    snapshotDigest: string;
  };
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
/** 平台核验是正式布尔事实；内存记录不代表外部平台核验成功。 */
export const aiReqPrFactSchema = z
  .object({
    /** Only returned when the code-hosting provider supplies an accessible URL. */
    url: z.string().optional(),
    sourceBranch: z.string(),
    targetBranch: z.string(),
    recordedAt: z.string(),
    platformVerified: z.boolean(),
    number: z.number().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    status: z.enum(["opened", "merged", "closed"]).optional(),
  })
  .strict();
export type AIReqPrFact = z.infer<typeof aiReqPrFactSchema>;
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
  branch?: { name: string; baseCommit: string; createdAt: string; pushedAt?: string };
  publishError?: { step: "branch" | "push" | "pr"; message: string };
  /** A closed PR retained with the historical candidate, not an active publication. */
  closedPr?: AIReqPrFact;
  mergeCheck?: {
    status: "waiting" | "unmerged" | "incomplete" | "failed" | "merged";
    checkedAt?: string;
    nextCheckAt?: string;
    message: string;
  };
}
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
export interface AIReqSystemRequirement {
  id: string;
  projectId: string;
  irId: string;
  title: string;
  documentPath: string;
  dependencySrIds?: string[];
}
export type AIReqProjectRole = "development" | "testing";
export interface AIReqRoleRegistration {
  id: string;
  projectId: string;
  employeeId: string;
  role: AIReqProjectRole;
  status: "pending" | "approved" | "rejected" | "revoked";
  requestedAt: string;
  note?: string;
  decidedAt?: string;
  decidedBy?: string;
}
export interface AIReqGitFileCommit {
  hash: string;
  message: string;
  employee: string;
  committedAt: string;
}
export type AIReqMaterialHistoryEvent =
  | { type: "confirmation"; employeeId: string; role: "business" | AIReqProjectRole }
  | {
      type: "git-sync";
      employeeId: string;
      commit: string;
      files: { path: string; change: AIReqGitFileCommit }[];
    };

export interface AIReqMaterialHistory {
  event?: AIReqMaterialHistoryEvent;
  version: string;
  reason: string;
  changedAt: string;
  materials: AIReqMaterialView[];
  documentPath?: string;
  proposalRound?: number;
  srs?: AIReqRequirementSnapshot["srs"];
  requirementsCheck?: AIReqMaterialCheck;
  solutionCheck?: AIReqMaterialCheck;
}
export interface AIReqRequirementGroup {
  originalText: string;
  submittedBy: string;
  sourceIrId?: string;
  contacts?: { business?: string; development?: string; testing?: string };
  contactHistory?: {
    employeeId: string;
    at: string;
    contacts: { business?: string; development?: string; testing?: string };
  }[];
  originalReview?: AIReqReview;
  originalReviewHistory?: AIReqReview[];
  alignment?: AIReqAlignment[];
  alignmentHistory?: AIReqAlignment[];
  requirementsCheck?: AIReqMaterialCheck;
  solutionCheck?: AIReqMaterialCheck;
  materialHistory?: AIReqMaterialHistory[];
  rejectedReviewResults?: { reviewId: string; reason: string; at: string }[];
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
  srDependencyFile?: AIReqMaterialView;
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
  /** Atomic import associates every new IR without attributing the batch to the previous selection. */
  irIds?: string[];
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
    | "solution"
    | "plan"
    | "completion"
    | "ut"
    | "st"
    | "delivery"
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
export interface AIReqMaterialReadRequest extends Pick<
  AIReqMaterialView,
  "projectId" | "irId" | "path" | "sha256" | "round"
> {
  releaseId: string;
}
export interface AIReqChangedFile extends AIReqFileVersion, AIReqObjectRef {
  status: string;
}
export interface AIReqReleaseDocuments {
  releaseId: string;
  title: string;
  createdAt: string;
  proposalCount: number;
  formalCount: number;
}
export interface AIReqProjectDocuments {
  projectId: string;
  releases: AIReqReleaseDocuments[];
}
export interface AIReqWorkflowView {
  roleRegistrations?: AIReqRoleRegistration[];
  roleAdministrator?: boolean;
  ideas: AIReqIdea[];
  documentFormats: AIReqDocumentFormats;
  /** Same-owner global release directory for cross-project planning; releases remains project-scoped. */
  availableReleases: AIReqRelease[];
  todos?: AIReqTodo[];
  projectDocuments?: AIReqProjectDocuments[];
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
export type AIReqAction = Omit<AIReqCommandBase, "operationId" | "expectedRevision"> &
  Partial<Pick<AIReqCommandBase, "operationId" | "expectedRevision">> &
  (
    | { type: "requestProjectRoles"; projectId: string; roles: AIReqProjectRole[]; note?: string }
    | {
        type: "decideProjectRole";
        projectId: string;
        registrationId: string;
        decision: "approved" | "rejected" | "revoked";
      }
    | { type: "syncFormalDocuments"; projectId: string; irId: string }
    | { type: "createIdea"; originalText: string }
    | { type: "importIdeas"; originalTexts: string[] }
    | { type: "updateIdea"; ideaId: string; ideaRevision: number; originalText: string }
    | { type: "transferIdea"; ideaId: string; ideaRevision: number; targets: AIReqIdeaTarget[] }
    | { type: "saveDocumentFormats"; documentFormats: AIReqDocumentFormats }
    | { type: "createRelease"; title: string }
    | {
        type: "createProposal";
        originalText: string;
        sourceIrId?: string;
        clientDraftId?: string;
        releaseId: string;
      }
    | {
        type: "importProposals";
        releaseId: string;
        proposals: { originalText: string; businessDocument?: string }[];
      }
    | {
        type: "assignContacts";
        contacts: { business?: string; development?: string; testing?: string };
      }
    | { type: "runFullReview" }
    | {
        type: "confirmAlignment";
        perspective: "business" | "development" | "testing";
        version: string;
        reviewId: string;
        snapshotDigest: string;
      }
    | { type: "closeProposalPr"; candidate: string }
    | {
        type: "reviseProposalMaterial";
        target: "requirements" | "solution" | "test-plan";
        note: string;
      }
    | { type: "deleteRequirement"; version: 1; projectId: string; irId: string }
    | { type: "acceptProposal"; reviewId: string; snapshotDigest: string }
    | {
        type: "submitProposalReview";
        projectId: string;
        irId: string;
        kind: "original" | "full";
        snapshotDigest: string;
      }
    | { type: "runRequirementsReview" }
    | { type: "returnProposal"; reason: string }
    | { type: "publishProposal"; candidate: string }
  );
export interface AIReqWorkflowResult {
  ideaId?: string;
  transferredRequirements?: AIReqIdeaTransfer[];
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
  freeSessionId?: string;
  freeFiles?: boolean;
  projectId?: string;
  irId?: string;
  srId?: string;
  stage?: AIReqWorkflowStage;
  stageRound?: number;
  discussionPhase?: "requirements" | "solution";
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
export interface AIReqAlignment {
  perspective: "business" | "development" | "testing";
  version: string;
  reviewId: string;
  snapshotDigest: string;
  employeeId: string;
  confirmedAt: string;
}
export interface AIReqTodo extends AIReqObjectRef {
  id: string;
  requirementTitle: string;
  assignmentPerspective: AIReqAlignment["perspective"];
  releaseId: string;
  title: string;
  kind:
    | "business-discussion"
    | "original-review"
    | "solution"
    | "full-review"
    | "alignment"
    | "publish"
    | "failure";
  employeeId?: string;
  perspective?: AIReqAlignment["perspective"];
  selection: AIReqSelection;
}
