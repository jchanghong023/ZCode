import type { AIReqPresenceSnapshot } from "./presence.js";
import type { SkillSummary } from "@zcode/shared";
import type {
  AIReqAction,
  AIReqSelection,
  AIReqWorkflowView,
  AIReqWorkflowResult,
  AIReqNativeSessionRef,
  AIReqAgentModelSettings,
  AIReqAgentModelBinding,
  AIReqSkillDesignDraft,
  AIReqSkillDesignPreview,
  AIReqPrHandoff,
  AIReqWorkspace,
  AIReqSrPlanningInput,
  AIReqSkillSaveReceipt,
  AIReqRemoteRepositoryInput,
  AIReqMaterialReadRequest,
} from "./types.js";
import type { AIReqProgressScheduler } from "./progress-scheduler.js";
import type {
  AIReqTestAcceptanceInput,
  AIReqBranchCleanupInput,
  AIReqBranchCleanupItem,
} from "./progress.js";

export interface AIReqBackendView {
  /** Opaque backend identity used to isolate browser preferences. */
  id: string;
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

export interface AIReqProjectServices {
  saveRepository?(input: AIReqRemoteRepositoryInput): Promise<void>;
  readDevelopmentRoot(projectId: string): string | undefined;
}
export interface AIReqModelServices {
  choices: readonly { id: string; name: string; provider: string }[];
  read(): AIReqAgentModelSettings;
  save(settings: AIReqAgentModelSettings, expectedRevision: number): void | Promise<void>;
  revision(): number;
  subscribe(listener: () => void): () => void;
  bindingChanged(binding: AIReqAgentModelBinding): boolean;
}
export interface AIReqPromptServices {
  read(): { saved: Record<string, string>; draft: Record<string, string>; revision: number };
  updateDraft(value: Record<string, string>): void;
  save(value: Record<string, string>, expectedRevision: number): void | Promise<void>;
}
export interface AIReqSkillDesignServices {
  readonly storage: { workspacePath: string; sharedSkillsDirectory: string };
  session(projectId: string): string | Promise<string>;
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
}
export interface AIReqDataSource {
  presence?: {
    read(): Promise<AIReqPresenceSnapshot>;
    subscribe(listener: (snapshot: AIReqPresenceSnapshot) => void): () => void;
  };
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
    recordTest(
      projectId: string,
      irId: string,
      srId: string,
      input: AIReqTestAcceptanceInput,
    ): Promise<void>;
    cleanupPreview(projectId: string, irId: string): Promise<AIReqBranchCleanupItem[]>;
    cleanupBranches(projectId: string, irId: string, input: AIReqBranchCleanupInput): Promise<void>;
  };
  clientId: string;
  backend?: AIReqBackendView;
  capabilities: {
    proposalDiscussion?: boolean;
    codeDevelopment?: boolean;
    workflowCommands: readonly AIReqAction["type"][];
    requirementManagement: boolean;
    freeChat: boolean;
    nativeChat: boolean;
    nativeSurface: boolean;
  };
  initialSelection: AIReqSelection;
  refreshIdentity?(): Promise<void>;
  readWorkflow(selection: AIReqSelection): Promise<AIReqWorkflowView>;
  readPrHandoff(target: { projectId: string; irId: string }): Promise<AIReqPrHandoff>;
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
  retryMaterial(request: AIReqMaterialReadRequest): Promise<boolean>;
  retrySession(selection: AIReqSelection, sessionId: string): Promise<void>;
  selectProject(projectId?: string): void;
  resolveWorkspace(view: AIReqWorkflowView | undefined, selection: AIReqSelection): AIReqWorkspace;
  dispose(): void | Promise<void>;
  projects?: AIReqProjectServices;
  models?: AIReqModelServices;
  prompts?: AIReqPromptServices;
  skillDesign?: AIReqSkillDesignServices;
}
