import type { IServiceAccessor } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";

// 本模块 UI 的具名业务 port；类型与纯派生仍由 services 公共契约唯一维护。
export type { IServiceAccessor } from "@zcode/services";
export type {
  AIReqAction,
  AIReqIdea,
  AIReqIdeaTarget,
  AIReqIdeaTransfer,
  AIReqAgentModelBinding,
  AIReqAnalysisFilter,
  AIReqAnalysisRun,
  AIReqAnalysisRunSummary,
  AIReqAnalysisSnapshot,
  AIReqAnalysisTask,
  AIReqDataSource,
  AIReqFileVersion,
  AIReqIdentity,
  AIReqMaterialView,
  AIReqNativeSessionRef,
  AIReqPrHandoff,
  AIReqProgressScheduler,
  AIReqProgressStatus,
  AIReqProject,
  AIReqProjectProgress,
  AIReqProgressSummary,
  AIReqRemoteArgs,
  AIReqRemoteBootstrap,
  AIReqRemotePath,
  AIReqRemoteResult,
  AIReqRemoteWorkflow,
  AIReqRequirementGroup,
  AIReqReview,
  AIReqReviewAgentId,
  AIReqSelection,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqSrPlanningInput,
  AIReqSystemRequirement,
  AIReqWorkflowResult,
  AIReqWorkflowView,
  AIReqTodo,
  AIReqTestAcceptanceInput,
  AIReqBranchCleanupInput,
  AIReqBranchCleanupItem,
} from "@zcode/services/aireq";
export {
  aiReqPrFactSchema,
  AIREQ_CONTRACT_VERSION,
  MATERIAL_KIND_LABELS,
  PROGRESS_STATUSES,
  PROPOSAL_PHASE_OPTIONS,
  conversationReadOnlyReason,
  hasCurrentProposalSolution,
  irPlanning,
  irProgress,
  irProgressStatus,
  irSrs,
  isFormalSelection,
  parallelSrIds,
  planningDate,
  planningWarnings,
  progressLabel,
  proposalCreatedTime,
  proposalDeliveryCurrent,
  proposalNeedsAttention,
  proposalPhaseLabel,
  proposalProcessingHint,
  proposalProgressIndex,
  proposalUpdatedTime,
  proposalVersion,
  proposalViewedIndex,
  readSrDependencies,
  requirementMaterialName,
  requirementsReviewCurrent,
  requirementsReviewReadyBlocker,
  requirementsReviewStartBlocker,
  selectionForRelease,
  srCompletionBlocker,
  srDependencies,
  srProgress,
  srProgressStatus,
  deriveAIReqTodos,
  fullReviewCurrent,
  fullReviewReadyBlocker,
  fullReviewBlocker,
  alignmentBlocker,
} from "@zcode/services/aireq";

/** 独立需求管理应用；普通业务身份每次显式传递，会话复用现有连接。 */
export interface AIReqApplicationProps {
  services: IServiceAccessor;
  platform: IPlatformService;
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
  | "requirementAnalysis"
  | "skillDesign";

/** Shared draft commands; the Settings page remains the only pending-navigation owner. */
export interface AIReqSettingsDraftActions {
  save(): boolean | Promise<boolean>;
  discard(): void;
  canSave?: boolean;
  canDiscard?: boolean;
  saveBlockedReason?: string;
}
