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
  AIReqAgentModelBinding,
  AIReqDataSource,
  AIReqDocumentFormats,
  AIReqDocumentName,
  AIReqFileVersion,
  AIReqIdentity,
  AIReqMaterialHistory,
  AIReqMaterialReadRequest,
  AIReqMaterialView,
  AIReqNativeSessionRef,
  AIReqPrHandoff,
  AIReqProject,
  AIReqProjectRole,
  AIReqRoleRegistration,
  AIReqProjectDocuments,
  AIReqRemoteArgs,
  AIReqRemoteBootstrap,
  AIReqRemotePath,
  AIReqRemoteResult,
  AIReqRemoteWorkflow,
  AIReqRequirementGroup,
  AIReqProposalState,
  AIReqReview,
  AIReqReviewAgentId,
  AIReqSelection,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqSystemRequirement,
  AIReqWorkflowResult,
  AIReqWorkflowView,
  AIReqTodo,
} from "@zcode/services/aireq";
export {
  aiReqPrFactSchema,
  AIREQ_CONTRACT_VERSION,
  AIREQ_DOCUMENT_PATHS,
  checkMarkdownSections,
  firstMarkdownTitle,
  MATERIAL_KIND_LABELS,
  PROPOSAL_STATE_OPTIONS,
  PROPOSAL_STATE_GROUPS,
  proposalState,
  proposalStateIndex,
  proposalStateLabel,
  conversationReadOnlyReason,
  hasCurrentProposalSolution,
  hasProjectRole,
  isFormalSelection,
  parallelSrIds,
  proposalCreatedTime,
  proposalDeliveryCurrent,
  proposalNeedsAttention,
  proposalProcessingHint,
  proposalProgressIndex,
  proposalUpdatedTime,
  proposalVersion,
  proposalViewedIndex,
  readSrDependencies,
  requirementMaterialName,
  requirementsReviewBlocker,
  requirementsReviewCurrent,
  requirementsReviewInputs,
  requirementsReviewReadyBlocker,
  requirementsReviewStartBlocker,
  selectionForRelease,
  deriveAIReqTodos,
  fullReviewCurrent,
  fullReviewReadyBlocker,
  proposalAlignmentCurrent,
  proposalReviewCanRetry,
  proposalReviewSubmitBlocker,
  proposalReturnBlocker,
  alignmentBlocker,
} from "@zcode/services/aireq";

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
  | "projectOverview"
  | "todos"
  | "proposals"
  | "formal"
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
