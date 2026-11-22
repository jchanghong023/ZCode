import type {
  AIReqAgentModelBinding,
  AIReqAlignment,
  AIReqDocumentFormats,
  AIReqFileVersion,
  AIReqIdea,
  AIReqIdentity,
  AIReqMaterialCheck,
  AIReqMaterialHistory,
  AIReqMaterialView,
  AIReqMergeFact,
  AIReqNativeSessionRef,
  AIReqPrFact,
  AIReqProposalFeedbackNote,
  AIReqProposalDelivery,
  AIReqProposalRevision,
  AIReqRequirementGroup,
  AIReqRequirementSnapshot,
  AIReqRequirementStatus,
  AIReqRequirementsDecision,
  AIReqReview,
  AIReqReviewAgent,
  AIReqRoleRegistration,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import type { AIReqProposalMergeScenario, AIReqReviewScenario } from "./internal-scenarios.js";

export interface Project {
  id: string;
  name: string;
  revision: number;
  defaultBranch: string;
  repositoryUrl?: string;
  repositoryId: string;
  root: string;
}

export type PrototypeRepositoryTarget = Pick<
  Project,
  "repositoryId" | "repositoryUrl" | "defaultBranch"
>;

export interface Review {
  id: string;
  kind?: "original" | "full";
  snapshotDigest: string;
  passed: boolean;
  report: string;
  reviewer: AIReqReview["reviewer"];
  createdAt: string;
  invalidatedReason?: string;
  agents?: AIReqReviewAgent[];
  humanDecision?: AIReqReview["humanDecision"];
  modelConfig?: AIReqAgentModelBinding;
  inputFiles?: AIReqFileVersion[];
  round?: number;
  findings?: AIReqReview["findings"];
  requestedBy?: string;
}

export interface Receipt {
  operationId: string;
  type: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  revision: number;
  irId?: string;
  irIds?: string[];
  srId?: string;
  steps: { name: string; at: string; detail: string }[];
  error?: string;
  /** Historical sample receipts predate request identity. */
  identity?: AIReqIdentity;
}

export interface ProposalDelivery extends AIReqProposalDelivery {
  repositoryTarget?: PrototypeRepositoryTarget;
  mergeScenario?: AIReqProposalMergeScenario;
  simulatedMr?: {
    candidate: string;
    version: string;
    manifest: string;
    number: number;
    openedAt: string;
    mergeEligibleAt: string;
    status: "opened" | "merged";
    commit?: string;
  };
}

interface ProposalRevision extends Omit<AIReqProposalRevision, "delivery" | "review"> {
  delivery?: ProposalDelivery;
  review?: Review;
}

interface RequirementsDecision extends Omit<AIReqRequirementsDecision, "review"> {
  review: Review;
}

type Contacts = NonNullable<AIReqRequirementGroup["contacts"]>;

export interface RequirementGroup {
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
  createdAt: string;
  originalText: string;
  submittedBy: string;
  sourceIrId?: string;
  contacts?: Contacts;
  contactHistory?: { employeeId: string; at: string; contacts: Contacts }[];
  clientDraftId?: string;
  originalReview?: Review;
  originalReviewHistory?: Review[];
  review?: Review;
  reviewHistory?: Review[];
  alignment?: AIReqAlignment[];
  alignmentHistory?: AIReqAlignment[];
  requirementsCheck?: AIReqMaterialCheck;
  solutionCheck?: AIReqMaterialCheck;
  materialHistory?: AIReqMaterialHistory[];
  rejectedReviewResults?: AIReqRequirementGroup["rejectedReviewResults"];
  snapshot?: AIReqRequirementSnapshot;
  requirementsPr?: AIReqPrFact;
  merge?: AIReqMergeFact;
  proposalDelivery?: ProposalDelivery;
  proposalDeliveryHistory?: ProposalDelivery[];
  proposalRevisions?: ProposalRevision[];
  requirementsDecisions?: RequirementsDecision[];
  freeze?: AIReqRequirementGroup["freeze"];
  srDependencyFile?: AIReqMaterialView;
  proposalStage?: "requirements" | "solution";
  proposalRound?: number;
  developerHandoff?: AIReqRequirementGroup["developerHandoff"];
  developerAcceptance?: AIReqRequirementGroup["developerAcceptance"];
  requirementSupplements?: AIReqRequirementGroup["requirementSupplements"];
  proposalSolution?: AIReqRequirementGroup["proposalSolution"];
  returnFeedback?: AIReqProposalFeedbackNote;
  returnFeedbackHistory?: AIReqProposalFeedbackNote[];
  proposalLocation?: { employeeId: string; directory: string };
  reviewScenarios?: { original?: AIReqReviewScenario; full?: AIReqReviewScenario };
  heldReviews?: Review[];
}

/** Mutable facts, not a wire view; role visibility and aggregates are computed on read. */
export interface WorkflowState {
  version: 1;
  revision: number;
  projects: Project[];
  repositoryHeads: Record<string, string>;
  roleRegistrations?: AIReqRoleRegistration[];
  ideas: AIReqIdea[];
  documentFormats: AIReqDocumentFormats;
  groups: RequirementGroup[];
  drafts: RequirementGroup[];
  srs: AIReqSystemRequirement[];
  materials: AIReqMaterialView[];
  operations: Receipt[];
  sessions: AIReqNativeSessionRef[];
  running: AIReqNativeSessionRef[];
}
