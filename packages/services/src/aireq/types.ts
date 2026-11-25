import type { AIReqDocumentFormats } from "./document-formats.js";
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

export type AIReqDiscussionAgent = "requirements" | "solution";
export interface AIReqObjectRef {
  projectId: string;
  irId: string;
}
export const AIREQ_CLOUD_PROPOSAL_COLUMNS = [
  "domain",
  "iterateId",
  "subType",
  "baseline",
  "creator",
  "relatedOwner",
  "modifiedBy",
  "developEndTime",
  "testingEndTime",
  "expectedImplementationDate",
  "turnAnalysisTime",
  "completedAnalysisTime",
  "turnTestTime",
  "completedDate",
  "estimatedWorkloadManday",
  "pmsWorkloadKloc",
  "priorityLevel",
  "health_degree",
  "needBreak",
  "needDevelop",
  "isDecompose",
  "correspondingCategory",
  "industry",
  "pmsNetworkSecurityIdentity",
  "implTracingState",
  "isRelatedMicroService",
  "isRelatedDoc",
  "isRelatedArc",
  "trustCategory",
  "verificationPolicy",
  "pmsStatus",
  "serviceName",
  "labels",
  "noBreakReason",
  "noDevelopReason",
  "demandSource",
  "rrBusinessNo",
  "pmsRRNumber",
  "businessCode",
  "targetCustomer",
  "netype",
  "board",
  "verificationPolicyDesc",
  "pmsPI",
  "systemid",
] as const;
export type AIReqCloudProposalColumn = (typeof AIREQ_CLOUD_PROPOSAL_COLUMNS)[number];
export type AIReqCloudProposalFields = Partial<
  Record<AIReqCloudProposalColumn | "sumWorkloadManday", string | number | boolean | string[]>
>;

export const AIREQ_PROPOSAL_COLUMNS = [
  "title",
  "id",
  "release",
  "owner",
  "version",
  "requester",
  "designOwner",
  "developmentOwner",
  "testingOwner",
  "submitter",
  "date",
  "process",
  "dwellTime",
  "srCount",
  ...AIREQ_CLOUD_PROPOSAL_COLUMNS,
] as const;
export type AIReqProposalColumn = (typeof AIREQ_PROPOSAL_COLUMNS)[number];
export interface AIReqProposalTablePreferences {
  autoFit?: boolean;
  columns: AIReqProposalColumn[];
  sort: { column: AIReqProposalColumn; direction: "ascending" | "descending" };
}
export interface AIReqRequirementListSyncReceipt {
  status: "simulated" | "completed";
  projectCount: number;
  count: number;
  documentCount: number;
}
export interface AIReqRequirementDetails {
  description: string;
  fields: { name: string; value: string }[];
  comments: { items: AIReqRequirementComment[] } | { unavailable: true };
}
export interface AIReqRequirementComment {
  body: string;
  author?: string;
  createdAt?: string;
}
export interface AIReqNativeSessionRef extends AIReqObjectRef {
  sessionId: string;
  phase: AIReqDiscussionAgent;
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
  workDirectory?: string;
}
export interface AIReqRemoteRepositoryInput {
  projectId?: string;
  name: string;
  repositoryUrl: string;
  defaultBranch: string;
  workDirectory: string;
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

export interface AIReqRequirementCounts {
  requirementCount: number;
  completedRequirementCount: number;
  confirmedRequirementCount: number;
}

export interface AIReqReleaseSummary extends AIReqRelease, AIReqRequirementCounts {}

export interface AIReqDocumentConfirmation {
  employeeId: string;
  confirmedAt: string;
}
export interface AIReqDocumentVersion {
  number: number;
  confirmation?: AIReqDocumentConfirmation;
}
export interface AIReqDocumentSnapshot extends AIReqDocumentVersion {
  confirmation: AIReqDocumentConfirmation;
  materials: AIReqMaterialView[];
  srs: AIReqSystemRequirement[];
}
export interface AIReqDocumentReview {
  id: string;
  agent: AIReqDiscussionAgent;
  version: number;
  requestedBy: string;
  requestedAt: string;
  status: "running" | "completed" | "failed";
  report?: string;
  stale: boolean;
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
export interface AIReqRequirementPersonnel {
  delivererOwner?: string;
  owner?: string;
  seId?: string;
  de?: string;
  te?: string;
}
export interface AIReqRequirementGroup extends AIReqRequirementPersonnel {
  cloudFields?: AIReqCloudProposalFields;
  id: string;
  projectId: string;
  releaseId: string;
  title: string;
  originalText: string;
  submittedBy: string;
  process?: string;
  documentPath: string;
  createdAt: string;
  revision: number;
  srIds: string[];
  sessions: AIReqNativeSessionRef[];
  documentVersion?: AIReqDocumentVersion;
  documentHistory: AIReqDocumentSnapshot[];
  documentReviews: AIReqDocumentReview[];
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
  error?: string;
}
export interface AIReqMaterialView extends AIReqFileVersion {
  projectId: string;
  irId: string;
  srId?: string;
  kind: "ir" | "sr" | "solution" | "test-plan" | "plan";
  valid: boolean;
  content?: string;
  error?: string;
}
export interface AIReqMaterialReadRequest extends Pick<
  AIReqMaterialView,
  "projectId" | "irId" | "path" | "sha256"
> {
  releaseId: string;
}
export interface AIReqWorkflowView {
  projectRoleMembers: AIReqProjectRoleMember[];
  roleAdministrator?: boolean;
  documentFormats: AIReqDocumentFormats;
  revision: number;
  projects: AIReqProject[];
  projectRequirementCounts?: Record<string, AIReqRequirementCounts>;
  /** 唯一 Release 目录及同一快照的跨项目只读统计。 */
  releases: AIReqReleaseSummary[];
  /** 项目总览中本次未能更新 Release 的项目。 */
  releaseReadFailures?: string[];
  requirements: AIReqRequirementGroup[];
  srs: AIReqSystemRequirement[];
  materials: AIReqMaterialView[];
}
export interface AIReqCommandBase {
  projectId?: string;
  irId?: string;
}
type AIReqIntent = AIReqCommandBase &
  (
    | (AIReqProjectRoleMember & { type: "addProjectRoleMember" | "removeProjectRoleMember" })
    | { type: "saveDocumentFormats"; documentFormats: AIReqDocumentFormats }
    | { type: "createRelease"; title: string }
    | {
        type: "createProposal";
        originalText: string;
        clientDraftId?: string;
        releaseId: string;
      }
    | { type: "deleteRequirement"; projectId: string; irId: string }
    | { type: "reviewDocuments"; projectId: string; irId: string; agent: AIReqDiscussionAgent }
    | { type: "confirmDocumentVersion"; projectId: string; irId: string; snapshot: string }
  );

/** 本地表单可携带独立于最新投影的编辑基线。 */
export type AIReqAction = AIReqIntent & { operationId?: string; expectedRevision?: number };
/** 远程动作仅携带意图和幂等键；CAS 版本单独传递。 */
export type AIReqCommand = AIReqIntent & { operationId: string };

export interface AIReqDocumentValidation {
  version?: number;
  snapshot: string;
  fileCount: number;
  issues: { kind: "missing" | "invalid"; path: string; reason: string }[];
}

export interface AIReqWorkflowResult {
  projectId: string;
  irId?: string;
  receipt: AIReqOperationReceipt;
  documentFormatSnapshot?: Pick<AIReqWorkflowView, "documentFormats" | "revision">;
  documentValidation?: AIReqDocumentValidation;
}
export interface AIReqWorkflowTarget {
  projectId?: string;
  irId?: string;
  discussionPhase?: AIReqDiscussionAgent;
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
