import type { SkillSummary } from "@zcode/shared";
import type {
  AIReqBackendView,
  AIReqDataSource,
  AIReqDataProvenance,
  AIReqDirectory,
  AIReqEmployeeDirectory,
} from "./data-source.js";
import type {
  AIReqAction,
  AIReqAgentModelBinding,
  AIReqAgentModelSettings,
  AIReqNativeSessionRef,
  AIReqPeer,
  AIReqSelection,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqWorkflowView,
  AIReqWorkflowResult,
  AIReqWorkspace,
  AIReqSrPlanningInput,
  AIReqProposalMergeScenario,
  AIReqPrHandoff,
  AIReqPrHandoffScenario,
  AIReqSkillSaveReceipt,
  AIReqRemoteRepositoryInput,
} from "./types.js";
import type {
  AIReqAnalysisFilter,
  AIReqAnalysisHistoryFilter,
  AIReqAnalysisSnapshot,
  AIReqAnalysisTaskPage,
  AIReqAnalysisPage,
  AIReqAnalysisRunSummary,
  AIReqAnalysisRun,
} from "./progress-scheduler.js";
import type {
  AIReqTestAcceptanceInput,
  AIReqBranchCleanupInput,
  AIReqBranchCleanupItem,
  AIReqCodeMergeInput,
  AIReqVersionedProgressInput,
} from "./progress.js";

/** Typed operations on the existing binary Channel RPC. */
export const AIREQ_CONTRACT_VERSION = 3;
export type AIReqRemoteErrorCode =
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_IDENTITY"
  | "INVALID_CLIENT"
  | "INVALID_SCENARIO"
  | "FORBIDDEN"
  | "INVALID_UPGRADE"
  | "BACKEND_UNAVAILABLE"
  | "INVALID_JSON"
  | "INVALID_ARGUMENT"
  | "UNKNOWN_PATH"
  | "INVALID_ACTION";
export interface AIReqRemoteError {
  code: AIReqRemoteErrorCode;
  message: string;
}
export interface AIReqRemoteWorkflow {
  view: AIReqWorkflowView;
  session?: AIReqNativeSessionRef;
  workspace: AIReqWorkspace;
}
export interface AIReqRemotePrompts {
  saved: Record<string, string>;
  draft: Record<string, string>;
  revision: number;
}
interface Operation<A extends unknown[], R> {
  args: A;
  result: R;
}

/** Explicit reachable operation allowlist. Absent top-level results are null. */
export interface AIReqRemoteOperations {
  readWorkflow: Operation<[selection: AIReqSelection], AIReqRemoteWorkflow>;
  readPrHandoff: Operation<[group: AIReqWorkflowView["groups"][number]], AIReqPrHandoff>;
  command: Operation<
    [action: AIReqAction, selection: AIReqSelection, revision: number],
    AIReqWorkflowResult
  >;
  retryMaterial: Operation<[path: string, selection: AIReqSelection], boolean>;
  retrySession: Operation<[selection: AIReqSelection], null>;
  "progress.recordTest": Operation<
    [projectId: string, irId: string, srId: string, input: AIReqTestAcceptanceInput],
    null
  >;
  "progress.cleanupPreview": Operation<
    [projectId: string, irId: string],
    AIReqBranchCleanupItem[]
  >;
  "progress.cleanupBranches": Operation<
    [projectId: string, irId: string, input: AIReqBranchCleanupInput],
    null
  >;
  "planning.updateSr": Operation<
    [projectId: string, irId: string, srId: string, input: AIReqSrPlanningInput],
    null
  >;
  "projects.saveRepository": Operation<[input: AIReqRemoteRepositoryInput], null>;
  "models.read": Operation<[], AIReqAgentModelSettings>;
  "models.save": Operation<[settings: AIReqAgentModelSettings, expectedRevision: number], null>;
  "models.samples": Operation<[], AIReqAgentModelSettings>;
  "models.revision": Operation<[], number>;
  "models.bindingChanged": Operation<[binding: AIReqAgentModelBinding], boolean>;
  "prompts.read": Operation<[], AIReqRemotePrompts>;
  "prompts.save": Operation<[value: Record<string, string>, expectedRevision: number], null>;
  "skillDesign.session": Operation<[projectId: string], string>;
  "skillDesign.binding": Operation<[sessionId: string], AIReqAgentModelBinding>;
  "skillDesign.workspaceIdentity": Operation<[projectId: string], string>;
  "skillDesign.read": Operation<[sessionId: string], AIReqSkillDesignDraft>;
  "skillDesign.saveDraft": Operation<[sessionId: string, value: AIReqSkillDesignDraft], null>;
  "skillDesign.prompt": Operation<[sessionId: string, value: AIReqSkillDesignDraft], string>;
  "skillDesign.temporaryDirectory": Operation<[sessionId: string], string>;
  "skillDesign.readPreview": Operation<[sessionId: string], AIReqSkillDesignPreview | null>;
  "skillDesign.listSkills": Operation<[workspacePath: string], SkillSummary[]>;
  "skillDesign.savePreview": Operation<
    [
      sessionId: string,
      workspacePath: string,
      name: string,
      target: "project" | "user",
      expectedPreviewRevision: number,
      operationId: string,
    ],
    AIReqSkillSaveReceipt
  >;
  "collaboration.peers": Operation<[projectId?: string], AIReqPeer[]>;
  "prototype.setProposalMergeScenario": Operation<
    [projectId: string, irId: string, scenario: AIReqProposalMergeScenario],
    null
  >;
  "prototype.setProposalReviewScenario": Operation<
    [projectId: string, irId: string, kind: "original" | "full", scenario: "normal" | "blocked" | "failed" | "hold"],
    null
  >;
  "prototype.releaseProposalReviewResults": Operation<[projectId: string, irId: string], null>;
  "prototype.failNextBranchCreation": Operation<[projectId: string, irId: string, srId: string], null>;
  "prototype.simulateCodeMerge": Operation<
    [projectId: string, irId: string, srId: string, input: AIReqCodeMergeInput],
    null
  >;
  "prototype.failNextBranchCleanup": Operation<
    [projectId: string, irId: string, srId: string, input: AIReqVersionedProgressInput],
    null
  >;
  "prototype.readPrHandoff": Operation<
    [group: AIReqWorkflowView["groups"][number], scenario?: AIReqPrHandoffScenario],
    AIReqPrHandoff
  >;
  "progressScheduler.read": Operation<[], AIReqAnalysisSnapshot>;
  "progressScheduler.queryTasks": Operation<
    [filter: AIReqAnalysisFilter, page: number, pageSize: number],
    AIReqAnalysisTaskPage
  >;
  "progressScheduler.queryRuns": Operation<
    [filter: AIReqAnalysisHistoryFilter, page: number, pageSize: number],
    AIReqAnalysisPage<AIReqAnalysisRunSummary>
  >;
  "progressScheduler.readRun": Operation<[id: string], AIReqAnalysisRun | null>;
  "progressScheduler.setProjectEnabled": Operation<[projectId: string, enabled: boolean], null>;
  "progressScheduler.configure": Operation<[enabled: boolean, intervalMinutes: number], null>;
  "progressScheduler.runNow": Operation<[filter: AIReqAnalysisFilter], null>;
  "progressScheduler.advance": Operation<[], null>;
  "progressScheduler.setScenario": Operation<
    [filter: AIReqAnalysisFilter, scenario: "normal" | "fail-next" | "hold-next" | "release-held"],
    null
  >;
}
export type AIReqRemotePath = keyof AIReqRemoteOperations;
export type AIReqRemoteArgs<P extends AIReqRemotePath> = AIReqRemoteOperations[P]["args"];
export type AIReqRemoteResult<P extends AIReqRemotePath> = AIReqRemoteOperations[P]["result"];
export type AIReqRemoteCall = {
  [P in AIReqRemotePath]: { path: P; args: AIReqRemoteArgs<P>; selection?: AIReqSelection };
}[AIReqRemotePath];
export interface AIReqRemoteBootstrap {
  contractVersion: typeof AIREQ_CONTRACT_VERSION;
  provenance: AIReqDataProvenance;
  backend: AIReqBackendView;
  capabilities: AIReqDataSource["capabilities"];
  serviceManifest: AIReqDataSource["serviceManifest"];
  initialSelection: AIReqSelection;
  scenarioOperations?: boolean;
  employeeDirectory?: AIReqEmployeeDirectory;
  models: {
    choices: readonly { id: string; name: string; provider: string }[];
    settings: AIReqAgentModelSettings;
    samples?: AIReqAgentModelSettings;
    revision: number;
  };
  prompts: AIReqRemotePrompts;
  projects: { directories: AIReqDirectory[]; developmentRoots: Record<string, string> };
  peers: AIReqPeer[];
  skillDesignSample?: AIReqSkillDesignDraft;
}
export type AIReqRemoteEvent = (
  | { type: "workflow" }
  | { type: "models" }
  | { type: "prompts" }
  | { type: "scheduler" }
  | { type: "skills"; sessionId: string }
  | { type: "error"; error: AIReqRemoteError }
) & {
  backendEpoch?: string;
  revision?: number;
  projectId?: string;
  irId?: string;
  operationId?: string;
};
