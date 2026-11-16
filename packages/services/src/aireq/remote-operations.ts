import type { SkillSummary } from "@zcode/shared";
import type { AIReqBackendView, AIReqDataSource, AIReqDataProvenance } from "./data-source.js";
import type {
  AIReqAction,
  AIReqAgentModelBinding,
  AIReqAgentModelSettings,
  AIReqNativeSessionRef,
  AIReqSelection,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqWorkflowView,
  AIReqWorkflowResult,
  AIReqWorkspace,
  AIReqSrPlanningInput,
  AIReqPrHandoff,
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
} from "./progress.js";

/** Typed operations on the existing binary Channel RPC. */
export const AIREQ_CONTRACT_VERSION = 4;
export type AIReqRemoteErrorCode =
  | "BUSINESS_RULE_VIOLATION"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_IDENTITY"
  | "INVALID_CLIENT"
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
  readPrHandoff: Operation<[target: { projectId: string; irId: string }], AIReqPrHandoff>;
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
  "progress.cleanupPreview": Operation<[projectId: string, irId: string], AIReqBranchCleanupItem[]>;
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
  initialSelection: AIReqSelection;
  models: {
    choices: readonly { id: string; name: string; provider: string }[];
    settings: AIReqAgentModelSettings;
    revision: number;
  };
  prompts: AIReqRemotePrompts;
  projects: { developmentRoots: Record<string, string> };
  skillDesignStorage?: { workspacePath: string; sharedSkillsDirectory: string };
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
