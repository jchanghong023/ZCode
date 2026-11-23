import type {
  AIReqDiscussionAgent,
  AIReqDocumentFormats,
  AIReqDocumentReview,
  AIReqDocumentSnapshot,
  AIReqDocumentVersion,
  AIReqIdea,
  AIReqMaterialView,
  AIReqNativeSessionRef,
  AIReqOperationReceipt,
  AIReqProjectRoleMember,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
} from "@zcode/services/aireq";
import type { NativeRuntimeModel } from "./agent-models.js";

export interface Project {
  id: string;
  name: string;
  revision: number;
  defaultBranch: string;
  repositoryUrl?: string;
  root: string;
}

export interface NativeSessionRef extends AIReqNativeSessionRef {
  runtimeModel?: NativeRuntimeModel;
}

/** Batch transfer uses these IDs only while assembling its result. */
export interface Receipt extends AIReqOperationReceipt {
  irIds?: string[];
}

export interface DocumentReview extends AIReqDocumentReview {
  materialDigest: string;
}

export interface RequirementGroup extends Omit<
  AIReqRequirementGroup,
  "documentVersion" | "documentReviews" | "sessions"
> {
  documentVersion?: AIReqDocumentVersion | AIReqDocumentSnapshot;
  documentReviews: DocumentReview[];
  sessions: NativeSessionRef[];
  clientDraftId?: string;
}

export interface SystemRequirement extends AIReqSystemRequirement {
  dependencySrIds?: string[];
}

export interface NativeDocumentOutput {
  agent: AIReqDiscussionAgent;
  materials: AIReqMaterialView[];
  removedPaths?: string[];
  srs?: SystemRequirement[];
}

/** 需求、材料、确认与评审事实由工作流统一提交。 */
export interface WorkflowState {
  revision: number;
  projects: Project[];
  projectRoleMembers: AIReqProjectRoleMember[];
  ideas: AIReqIdea[];
  documentFormats: AIReqDocumentFormats;
  requirements: RequirementGroup[];
  srs: SystemRequirement[];
  materials: AIReqMaterialView[];
}
