import type { IServiceAccessor } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";
import type { AIReqWorkflowTarget } from "@zcode/services/aireq";

// 本模块 UI 的具名业务 port；类型与纯派生仍由 services 公共契约唯一维护。
export type { IServiceAccessor } from "@zcode/services";
export type {
  AIReqAction,
  AIReqAgentModelSettings,
  AIReqPresenceSnapshot,
  AIReqDataSource,
  AIReqDiscussionAgent,
  AIReqDocumentConfirmation,
  AIReqDocumentReview,
  AIReqDocumentSnapshot,
  AIReqDocumentVersion,
  AIReqDocumentFormats,
  AIReqDocumentName,
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
  AIReqRequirementCounts,
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
  AIREQ_DOCUMENT_PATHS,
  checkMarkdownSections,
  MATERIAL_KIND_LABELS,
  hasProjectRole,
  readSrDependencies,
  requirementMaterialName,
} from "@zcode/services/aireq";

export type { AIReqDocumentValidation } from "@zcode/services/aireq";

/** SR 只在浏览器内定位文档，原生会话始终归属 IR。 */
export interface AIReqSelection extends AIReqWorkflowTarget {
  releaseId?: string;
  srId?: string;
}

/** 独立需求管理应用；普通业务身份每次显式传递，会话复用现有连接。 */
export interface AIReqApplicationProps {
  services: IServiceAccessor;
  platform: IPlatformService;
  clientId: string;
  connected: boolean;
  operator: { employeeNumber: string; leave(): void };
}
export type AIReqMainView = "chat" | "projectProgress" | "proposals" | "roles" | "skillDesign";

/** Shared draft commands; the Settings page remains the only pending-navigation owner. */
export interface AIReqSettingsDraftActions {
  save(): boolean | Promise<boolean>;
  discard(): void;
  canSave?: boolean;
  canDiscard?: boolean;
  saveBlockedReason?: string;
}
