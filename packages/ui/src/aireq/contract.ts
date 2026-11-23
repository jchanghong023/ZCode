import type { IServiceAccessor } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";

// 本模块 UI 的具名业务 port；类型与纯派生仍由 services 公共契约唯一维护。
export type { IServiceAccessor } from "@zcode/services";
export type {
  AIReqAction,
  AIReqPresenceSnapshot,
  AIReqIdea,
  AIReqIdeaTarget,
  AIReqIdeaTransfer,
  AIReqDataSource,
  AIReqDiscussionAgent,
  AIReqDocumentConfirmation,
  AIReqDocumentReview,
  AIReqDocumentSnapshot,
  AIReqDocumentVersion,
  AIReqDocumentFormats,
  AIReqDocumentName,
  AIReqFileVersion,
  AIReqIdentity,
  AIReqMaterialReadRequest,
  AIReqMaterialView,
  AIReqNativeSessionRef,
  AIReqProject,
  AIReqProjectRole,
  AIReqReleaseSummary,
  AIReqRemoteArgs,
  AIReqRemoteBootstrap,
  AIReqRemotePath,
  AIReqRemoteResult,
  AIReqRemoteWorkflow,
  AIReqRequirementGroup,
  AIReqSystemRequirement,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqSkillDesignSession,
  AIReqWorkflowResult,
  AIReqWorkflowTarget,
  AIReqWorkflowView,
} from "@zcode/services/aireq";
export {
  AIREQ_CONTRACT_VERSION,
  AIREQ_SYNC_SCRIPT_ROOT,
  AIREQ_DOCUMENT_PATHS,
  checkMarkdownSections,
  fileVersions,
  MATERIAL_KIND_LABELS,
  hasProjectRole,
  readSrDependencies,
  requirementMaterialName,
} from "@zcode/services/aireq";

export type { AIReqDocumentValidation } from "@zcode/services/aireq";

/** 独立需求管理应用；普通业务身份每次显式传递，会话复用现有连接。 */
export interface AIReqApplicationProps {
  services: IServiceAccessor;
  platform: IPlatformService;
  clientId: string;
  connected: boolean;
  operator: { employeeNumber: string; leave(): void };
}
export type AIReqMainView =
  | "ideas"
  | "chat"
  | "projectProgress"
  | "proposals"
  | "roles"
  | "skillDesign";

/** Shared draft commands; the Settings page remains the only pending-navigation owner. */
export interface AIReqSettingsDraftActions {
  save(): boolean | Promise<boolean>;
  discard(): void;
  canSave?: boolean;
  canDiscard?: boolean;
  saveBlockedReason?: string;
}
