import type { SkillSummary } from "@zcode/shared";
import type {
  AIReqAction,
  AIReqSelection,
  AIReqWorkflowView,
  AIReqWorkflowResult,
  AIReqNativeSessionRef,
  AIReqPeer,
  AIReqAgentModelSettings,
  AIReqAgentModelBinding,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqPrHandoff,
  AIReqPrHandoffScenario,
  AIReqWorkspace,
  AIReqProposalMergeScenario,
  AIReqSrPlanningInput,
  AIReqSkillSaveReceipt,
  AIReqRemoteRepositoryInput,
} from "./types.js";
import type { AIReqProgressScheduler } from "./progress-scheduler.js";
import type {
  NativeTaskRunsRequest,
  NativeTaskRunsSnapshot,
  NativeTaskOutputRequest,
  NativeTaskOutputContent,
} from "./native-task-runs.js";

export interface AIReqBackendView {
  id: string;
  kind: "developer" | "team";
  owner: string;
  name: string;
  configDirectory: string;
  userSkillsDirectory: string;
}

/** Factual data origin only; supported workflows are selected by capabilities. */
export interface AIReqDataProvenance {
  kind: "sample" | "live";
  notice?: string;
}

export interface AIReqDirectory {
  path: string;
  name: string;
  git: boolean;
  branch: string;
  repositoryRoot?: string;
}
export type AIReqDirectoryCheck =
  | { valid: false; error: string }
  | { valid: true; root: string; directory: AIReqDirectory };

/** Registered service names and their exposed members, as reported by this backend. */
export type AIReqServiceManifest = Readonly<Record<string, readonly string[]>>;
export interface AIReqProjectServices {
  saveRepository?(input: AIReqRemoteRepositoryInput): Promise<void>;
  readDevelopmentRoot(projectId: string, employeeId?: string): string | undefined;
}
export interface AIReqModelServices {
  choices: readonly { id: string; name: string; provider: string }[];
  read(): AIReqAgentModelSettings;
  save(settings: AIReqAgentModelSettings, expectedRevision: number): void | Promise<void>;
  revision(): number;
  subscribe(listener: () => void): () => void;
  bindingChanged(binding: AIReqAgentModelBinding): boolean;
  samples?: () => AIReqAgentModelSettings;
}
export interface AIReqPromptServices {
  read(): { saved: Record<string, string>; draft: Record<string, string>; revision: number };
  updateDraft(value: Record<string, string>): void;
  save(value: Record<string, string>, expectedRevision: number): void | Promise<void>;
}
export interface AIReqSkillDesignServices {
  session(projectId: string): string | Promise<string>;
  binding(sessionId: string): AIReqAgentModelBinding | Promise<AIReqAgentModelBinding>;
  workspaceIdentity(projectId: string): string | Promise<string>;
  read(sessionId: string): AIReqSkillDesignDraft | Promise<AIReqSkillDesignDraft>;
  saveDraft(sessionId: string, value: AIReqSkillDesignDraft): void | Promise<void>;
  subscribe(listener: (sessionId: string) => void): { dispose(): void };
  prompt(sessionId: string, value: AIReqSkillDesignDraft): string | Promise<string>;
  temporaryDirectory(sessionId: string): string | Promise<string>;
  readPreview(
    sessionId: string,
  ): AIReqSkillDesignPreview | undefined | Promise<AIReqSkillDesignPreview | undefined>;
  listSkills(workspacePath: string): SkillSummary[] | Promise<SkillSummary[]>;
  savePreview(
    sessionId: string,
    workspacePath: string,
    name: string,
    target: "project" | "user",
    expectedPreviewRevision: number,
    operationId: string,
  ): Promise<AIReqSkillSaveReceipt>;
  sample?: AIReqSkillDesignDraft;
}
export interface AIReqPrototypeScenarios {
  setProposalMergeScenario(
    projectId: string,
    irId: string,
    scenario: AIReqProposalMergeScenario,
  ): void | Promise<void>;
  readPrHandoff(
    group: AIReqWorkflowView["groups"][number],
    scenario?: AIReqPrHandoffScenario,
  ): AIReqPrHandoff | Promise<AIReqPrHandoff>;
}
export interface AIReqEmployeeDirectory {
  kind: "sample" | "live";
  entries: readonly { employeeId: string; name: string; department: string }[];
}
export interface AIReqDataSource {
  nativeTasks?: {
    listRuns(request: NativeTaskRunsRequest): Promise<NativeTaskRunsSnapshot>;
    readOutput(request: NativeTaskOutputRequest): Promise<NativeTaskOutputContent>;
  };
  employeeDirectory?: AIReqEmployeeDirectory;
  planning?: {
    updateSr(
      projectId: string,
      irId: string,
      srId: string,
      input: AIReqSrPlanningInput,
    ): Promise<void>;
  };
  progressScheduler?: AIReqProgressScheduler;
  progress?: {
    assignOwner(projectId: string, irId: string, employeeId: string): Promise<void>;
    updateSr(
      projectId: string,
      irId: string,
      srId: string,
      percent: number,
      reason: string,
    ): Promise<void>;
  };
  provenance: AIReqDataProvenance;
  clientId: string;
  backend?: AIReqBackendView;
  capabilities: {
    settingsWrite?: boolean;
    proposalDiscussion?: boolean;
    codeDevelopment?: boolean;
    workflowCommands: readonly AIReqAction["type"][];
    requirementManagement: boolean;
    freeChat: boolean;
    nativeChat: boolean;
    nativeSurface: boolean;
  };
  serviceManifest: AIReqServiceManifest;
  initialSelection: AIReqSelection;
  refreshIdentity?(): Promise<void>;
  readWorkflow(selection: AIReqSelection): Promise<AIReqWorkflowView>;
  readPrHandoff(group: AIReqWorkflowView["groups"][number]): Promise<AIReqPrHandoff>;
  subscribeWorkflow(listener: () => void): () => void;
  command(
    action: AIReqAction,
    selection: AIReqSelection,
    revision: number,
  ): Promise<AIReqWorkflowResult>;
  resolveSession(
    view: AIReqWorkflowView,
    selection: AIReqSelection,
  ): AIReqNativeSessionRef | undefined;
  retryMaterial(path: string, selection: AIReqSelection): Promise<boolean>;
  retrySession(selection: AIReqSelection): Promise<void>;
  selectProject(projectId?: string): void;
  resolveWorkspace(view: AIReqWorkflowView | undefined, selection: AIReqSelection): AIReqWorkspace;
  dispose(): void | Promise<void>;
  projects?: AIReqProjectServices;
  models?: AIReqModelServices;
  prompts?: AIReqPromptServices;
  skillDesign?: AIReqSkillDesignServices;
  collaboration?: { peers(projectId?: string): AIReqPeer[] };
  prototype?: AIReqPrototypeScenarios;
}
