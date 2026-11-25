import type { AIReqPresenceSnapshot } from "./presence.js";
import type {
  AIReqAction,
  AIReqWorkflowTarget,
  AIReqWorkflowView,
  AIReqWorkflowResult,
  AIReqNativeSessionRef,
  AIReqAgentModelSettings,
  AIReqSkillDesignDraft,
  AIReqSkillDesignDraftFields,
  AIReqSkillDesignPreview,
  AIReqSkillDesignSession,
  AIReqWorkspace,
  AIReqSkillSaveReceipt,
  AIReqRemoteRepositoryInput,
  AIReqMaterialReadRequest,
  AIReqDocumentValidation,
  AIReqObjectRef,
  AIReqRequirementDetails,
  AIReqRequirementComment,
  AIReqProposalTablePreferences,
  AIReqRequirementListSyncReceipt,
} from "./types.js";

export interface AIReqBackendView {
  /** Opaque backend identity used to isolate browser preferences. */
  id: string;
}

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
}
export interface AIReqPromptServices {
  read(): { saved: Record<string, string>; draft: Record<string, string>; revision: number };
  updateDraft(value: Record<string, string>): void;
  save(value: Record<string, string>, expectedRevision: number): void | Promise<void>;
}
export interface AIReqSkillDesignServices {
  readonly storage: { workspacePath: string; sharedSkillsDirectory: string };
  session(projectId: string): AIReqSkillDesignSession | Promise<AIReqSkillDesignSession>;
  read(sessionId: string): AIReqSkillDesignDraft | Promise<AIReqSkillDesignDraft>;
  saveDraft(sessionId: string, value: AIReqSkillDesignDraftFields): void | Promise<void>;
  subscribe(listener: (sessionId: string) => void): { dispose(): void };
  prompt(sessionId: string, value: AIReqSkillDesignDraftFields): string | Promise<string>;
  readPreview(
    sessionId: string,
  ): AIReqSkillDesignPreview | undefined | Promise<AIReqSkillDesignPreview | undefined>;
  listSkills(sessionId: string): string[] | Promise<string[]>;
  savePreview(
    sessionId: string,
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
  clientId: string;
  backend?: AIReqBackendView;
  capabilities: {
    workflowCommands: readonly AIReqAction["type"][];
  };
  initialProjectId?: string;
  refreshIdentity?(): Promise<void>;
  readWorkflow(target: AIReqWorkflowTarget): Promise<AIReqWorkflowView>;
  refreshProjects(target: AIReqWorkflowTarget): Promise<AIReqWorkflowView>;
  readRequirementDetails(target: AIReqObjectRef): Promise<AIReqRequirementDetails>;
  readRequirementComments(target: AIReqObjectRef): Promise<AIReqRequirementComment[]>;
  addRequirementComment(target: AIReqObjectRef, body: string): Promise<AIReqRequirementComment>;
  deleteRequirementComment(target: AIReqObjectRef, commentId: string): Promise<null>;
  syncRequirementList(): Promise<AIReqRequirementListSyncReceipt>;
  readProposalTablePreferences(): Promise<AIReqProposalTablePreferences | null>;
  saveProposalTablePreferences(
    preferences: AIReqProposalTablePreferences,
    initializeOnly?: boolean,
  ): Promise<AIReqProposalTablePreferences>;
  validateDocumentVersion(target: {
    projectId: string;
    irId: string;
  }): Promise<AIReqDocumentValidation>;
  subscribeWorkflow(listener: () => void): () => void;
  command(
    action: AIReqAction,
    target: AIReqWorkflowTarget,
    revision: number,
  ): Promise<AIReqWorkflowResult>;
  resolveSession(
    view: AIReqWorkflowView,
    target: AIReqWorkflowTarget,
  ): AIReqNativeSessionRef | undefined;
  retryMaterial(request: AIReqMaterialReadRequest): Promise<boolean>;
  retrySession(target: AIReqWorkflowTarget, sessionId: string): Promise<void>;
  resolveWorkspace(
    view: AIReqWorkflowView | undefined,
    target: AIReqWorkflowTarget,
  ): AIReqWorkspace;
  dispose(): void | Promise<void>;
  projects?: AIReqProjectServices;
  models?: AIReqModelServices;
  prompts?: AIReqPromptServices;
  skillDesign?: AIReqSkillDesignServices;
}
