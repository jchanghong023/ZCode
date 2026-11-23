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

export type AIReqWorkflowStage = "planning" | "executing" | "pr" | "solution";
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
  revision: number;
  defaultBranch: string;
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

export interface AIReqReleaseSummary extends AIReqRelease {
  requirementCount: number;
}

/** A global unplanned need; it is consumed when admitted to one or more releases. */
export interface AIReqIdea {
  id: string;
  originalText: string;
  submittedBy: string;
  createdAt: string;
  revision: number;
}
export interface AIReqIdeaTarget {
  projectId: string;
  releaseId: string;
}
export interface AIReqIdeaTransfer extends AIReqIdeaTarget {
  irId: string;
}
export type AIReqProposalReturnTarget = "requirements" | "solution";
export interface AIReqProposalFeedbackNote {
  employeeId: string;
  returnedAt: string;
  round: number;
  reason: string;
  target?: AIReqProposalReturnTarget;
  resumedAt?: string;
}
export type AIReqReviewAgentId = "a" | "b" | "c" | "summary";
export interface AIReqReviewAgent {
  id: AIReqReviewAgentId;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  session: AIReqNativeSessionRef;
  report: string;
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
    status: "untracked" | "waiting" | "unmerged" | "incomplete" | "failed" | "merged";
    checkedAt?: string;
    nextCheckAt?: string;
    message: string;
  };
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
export interface AIReqSystemRequirement {
  id: string;
  projectId: string;
  irId: string;
  title: string;
  documentPath: string;
}
export type AIReqProjectRole = "development" | "testing";
export interface AIReqProjectRoleMember {
  projectId: string;
  employeeId: string;
  role: AIReqProjectRole;
}
export interface AIReqMaterialHistoryEvent {
  type: "confirmation";
  employeeId: string;
  role: "business" | AIReqProjectRole;
}

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
  originalReview?: AIReqReview;
  originalReviewHistory?: AIReqReview[];
  alignment?: AIReqAlignment[];
  alignmentHistory?: AIReqAlignment[];
  requirementsCheck?: AIReqMaterialCheck;
  solutionCheck?: AIReqMaterialCheck;
  materialHistory?: AIReqMaterialHistory[];
  rejectedReviewResults?: { reviewId: string; reason: string; at: string }[];
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
  proposalLocation?: { employeeId: string; directory: string };
}
export interface AIReqOperationReceipt {
  operationId: string;
  actorEmployeeId?: string;
  type: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  revision: number;
  irId?: string;
  /** Atomic import associates every new IR without attributing the batch to the previous selection. */
  irIds?: string[];
  steps: { name: string; at: string; detail: string }[];
  error?: string;
}
export interface AIReqMaterialView extends AIReqFileVersion {
  projectId: string;
  irId: string;
  srId?: string;
  kind: "ir" | "sr" | "solution" | "test-plan" | "plan";
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
export interface AIReqWorkflowView {
  projectRoleMembers: AIReqProjectRoleMember[];
  roleAdministrator?: boolean;
  ideas: AIReqIdea[];
  documentFormats: AIReqDocumentFormats;
  revision: number;
  projects: AIReqProject[];
  /** 唯一 Release 目录及同一快照的跨项目只读统计。 */
  releases: AIReqReleaseSummary[];
  requirements: AIReqRequirementGroup[];
  srs: AIReqSystemRequirement[];
  materials: AIReqMaterialView[];
  operations: AIReqOperationReceipt[];
  sessions: AIReqNativeSessionRef[];
  running: AIReqNativeSessionRef[];
}
export interface AIReqCommandBase {
  projectId?: string;
  irId?: string;
  srId?: string;
}
type AIReqIntent = AIReqCommandBase &
  (
    | (AIReqProjectRoleMember & { type: "addProjectRoleMember" | "removeProjectRoleMember" })
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
    | { type: "runFullReview" }
    | {
        type: "confirmAlignment";
        perspective: "business" | "development" | "testing";
        version: string;
        reviewId: string;
        snapshotDigest: string;
      }
    | { type: "closeProposalPr"; candidate: string }
    | { type: "deleteRequirement"; projectId: string; irId: string }
    | { type: "acceptProposal"; reviewId: string; snapshotDigest: string }
    | {
        type: "submitProposalReview";
        projectId: string;
        irId: string;
        kind: "original" | "full";
        snapshotDigest: string;
      }
    | { type: "runRequirementsReview" }
    | { type: "returnProposal"; reason: string; target?: AIReqProposalReturnTarget }
    | { type: "publishProposal"; candidate: string }
  );

/** 本地表单可携带独立于最新投影的编辑基线。 */
export type AIReqAction = AIReqIntent & { operationId?: string; expectedRevision?: number };
/** 远程动作仅携带意图和幂等键；CAS 版本单独传递。 */
export type AIReqCommand = AIReqIntent & { operationId: string };

export interface AIReqWorkflowResult {
  transferredRequirements?: AIReqIdeaTransfer[];
  projectId: string;
  irId?: string;
  receipt: AIReqOperationReceipt;
  documentFormatSnapshot?: Pick<AIReqWorkflowView, "documentFormats" | "revision">;
}
export interface AIReqWorkflowTarget {
  reviewAgent?: AIReqReviewAgentId;
  proposalStep?: "requirements" | "requirements-review" | "solution" | "intake";
  projectId?: string;
  irId?: string;
  srId?: string;
  discussionPhase?: "requirements" | "solution";
}

export interface AIReqSkillDesignSession {
  sessionId: string;
  workspaceIdentity: string;
  temporaryDirectory: string;
}

export interface AIReqSkillDesignPreview {
  name: string;
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
export type AIReqSkillDesignDraftFields = Omit<AIReqSkillDesignDraft, "notes">;
export interface AIReqPrHandoff {
  repositoryUrl?: string;
  blockers: string[];
  sourceDirectory: string;
  branch: string;
  targetBranch: string;
}

export interface AIReqWorkspace {
  path?: string;
  identity: string;
  kind: "proposal" | "unavailable";
  error?: string;
}

export interface AIReqSkillSaveReceipt {
  path: string;
  revision: number;
  target: "project" | "user";
}
export interface AIReqAlignment {
  perspective: "business" | "development" | "testing";
  version: string;
  reviewId: string;
  snapshotDigest: string;
  employeeId: string;
  confirmedAt: string;
}
