import type {
  NativeTaskRunsRequest,
  NativeTaskRunsSnapshot,
  NativeTaskOutputRequest,
  NativeTaskOutputContent,
} from "./native-task-runs.js";
import type { AIReqIssue, AIReqIssueInput, AIReqIssueScope, AIReqIssueSnapshot } from "./issues.js";
import type { SkillSummary, SkillsListResult, ZCodeProvider } from "@zcode/shared";
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
export type AIReqRemoteResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: AIReqRemoteError };
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
export interface AIReqRemoteSkillsInput {
  workspacePath: string;
  workspaceIdentity?: string;
  provider?: ZCodeProvider;
}
interface Operation<A extends unknown[], R> {
  args: A;
  result: R;
}

/** Explicit reachable operation allowlist. Absent top-level results are null. */
export interface AIReqRemoteOperations {
  "nativeTasks.listRuns": Operation<[request: NativeTaskRunsRequest], NativeTaskRunsSnapshot>;
  "nativeTasks.readOutput": Operation<[request: NativeTaskOutputRequest], NativeTaskOutputContent>;
  "issues.read": Operation<[scope: AIReqIssueScope], AIReqIssueSnapshot>;
  "issues.create": Operation<[input: AIReqIssueInput], AIReqIssue>;
  "issues.configure": Operation<
    [scope: AIReqIssueScope, enabled: boolean, intervalMinutes: number],
    null
  >;
  "issues.runNow": Operation<[scope: AIReqIssueScope], null>;
  "issues.confirm": Operation<[scope: AIReqIssueScope, id: string], null>;
  "issues.reopen": Operation<[scope: AIReqIssueScope, id: string, reason: string], null>;
  readWorkflow: Operation<[selection: AIReqSelection], AIReqRemoteWorkflow>;
  readPrHandoff: Operation<[group: AIReqWorkflowView["groups"][number]], AIReqPrHandoff>;
  command: Operation<
    [action: AIReqAction, selection: AIReqSelection, revision: number],
    AIReqWorkflowResult
  >;
  retryMaterial: Operation<[path: string, selection: AIReqSelection], boolean>;
  retrySession: Operation<[selection: AIReqSelection], null>;
  "progress.assignOwner": Operation<[projectId: string, irId: string, employeeId: string], null>;
  "progress.updateSr": Operation<
    [projectId: string, irId: string, srId: string, percent: number, reason: string],
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
  "skills.list": Operation<[input: AIReqRemoteSkillsInput], SkillsListResult>;
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
  | { type: "issues" }
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
