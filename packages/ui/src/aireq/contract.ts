import type { IServiceAccessor } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";

// 本模块 UI 的具名业务 port；类型与纯派生仍由 services 公共契约唯一维护。
export type { IServiceAccessor } from "@zcode/services";
export type {
  AIReqAction,
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
  AIReqPrHandoffScenario,
  AIReqProgressScheduler,
  AIReqProgressStatus,
  AIReqProject,
  AIReqProposalMergeScenario,
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
  NativeTaskActor,
  NativeTaskOutputContent,
  NativeTaskRunsSnapshot,
} from "@zcode/services/aireq";
export {
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
} from "@zcode/services/aireq";

/** 独立需求管理应用；普通业务身份每次显式传递，会话复用现有连接。 */
export interface AIReqApplicationProps {
  services: IServiceAccessor;
  platform: IPlatformService;
  operator: { employeeNumber: string; leave(): void };
}
export type AIReqMainView = "chat" | "automations" | "skillDesign" | "requirementAnalysis";
