import type {
  AIReqDiscussionAgent,
  AIReqDocumentFormats,
  AIReqDocumentReview,
  AIReqDocumentSnapshot,
  AIReqDocumentVersion,
  AIReqMaterialView,
  AIReqNativeSessionRef,
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
  workDirectory?: string;
  storageDirectory?: string;
  root: string;
}

export interface NativeSessionRef extends AIReqNativeSessionRef {
  runtimeModel?: NativeRuntimeModel;
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
  process?: string;
  releaseName?: string;
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
  documentFormats: AIReqDocumentFormats;
  requirements: RequirementGroup[];
  srs: SystemRequirement[];
  materials: AIReqMaterialView[];
}
