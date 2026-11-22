import type { AIReqPresenceSnapshot } from "./presence.js";
import type { AIReqBackendView, AIReqDataSource } from "./data-source.js";
import type {
  AIReqAction,
  AIReqAgentModelSettings,
  AIReqNativeSessionRef,
  AIReqMaterialReadRequest,
  AIReqSelection,
  AIReqSkillDesignDraft,
  AIReqSkillDesignDraftFields,
  AIReqSkillDesignPreview,
  AIReqSkillDesignSession,
  AIReqWorkflowView,
  AIReqWorkflowResult,
  AIReqWorkspace,
  AIReqPrHandoff,
  AIReqSkillSaveReceipt,
  AIReqRemoteRepositoryInput,
} from "./types.js";
/** Typed operations on the existing binary Channel RPC. */
export const AIREQ_CONTRACT_VERSION = 12;
export interface AIReqRemoteWorkflow {
  view: AIReqWorkflowView;
  session?: AIReqNativeSessionRef;
  workspace: AIReqWorkspace;
}
export interface AIReqRemotePrompts {
  saved: Record<string, string>;
  revision: number;
}
interface Operation<A extends unknown[], R> {
  args: A;
  result: R;
}

/** 仅保留实际 RPC；模型／提示词读取由 bootstrap 提供，本地读取端口不是远程操作。 */
export interface AIReqRemoteOperations {
  readPresence: Operation<[], AIReqPresenceSnapshot>;
  readWorkflow: Operation<[selection: AIReqSelection], AIReqRemoteWorkflow>;
  readPrHandoff: Operation<[target: { projectId: string; irId: string }], AIReqPrHandoff>;
  command: Operation<
    [action: AIReqAction, selection: AIReqSelection, revision: number],
    AIReqWorkflowResult
  >;
  retryMaterial: Operation<[request: AIReqMaterialReadRequest], boolean>;
  retrySession: Operation<[selection: AIReqSelection, sessionId: string], null>;
  "projects.saveRepository": Operation<[input: AIReqRemoteRepositoryInput], null>;
  "models.save": Operation<[settings: AIReqAgentModelSettings, expectedRevision: number], null>;
  "prompts.save": Operation<[value: Record<string, string>, expectedRevision: number], null>;
  "skillDesign.session": Operation<[projectId: string], AIReqSkillDesignSession>;
  "skillDesign.read": Operation<[sessionId: string], AIReqSkillDesignDraft>;
  "skillDesign.saveDraft": Operation<[sessionId: string, value: AIReqSkillDesignDraftFields], null>;
  "skillDesign.prompt": Operation<[sessionId: string, value: AIReqSkillDesignDraftFields], string>;
  "skillDesign.readPreview": Operation<[sessionId: string], AIReqSkillDesignPreview | null>;
  "skillDesign.listSkills": Operation<[sessionId: string], string[]>;
  "skillDesign.savePreview": Operation<
    [
      sessionId: string,
      target: "project" | "user",
      expectedPreviewRevision: number,
      operationId: string,
    ],
    AIReqSkillSaveReceipt
  >;
}
export type AIReqRemotePath = keyof AIReqRemoteOperations;
export type AIReqRemoteArgs<P extends AIReqRemotePath> = AIReqRemoteOperations[P]["args"];
export type AIReqRemoteResult<P extends AIReqRemotePath> = AIReqRemoteOperations[P]["result"];
export interface AIReqRemoteBootstrap {
  contractVersion: typeof AIREQ_CONTRACT_VERSION;
  backend: AIReqBackendView;
  capabilities: AIReqDataSource["capabilities"];
  initialProjectId?: string;
  models: {
    choices: readonly { id: string; name: string; provider: string }[];
    settings: AIReqAgentModelSettings;
    revision: number;
  };
  prompts: AIReqRemotePrompts;
  projects: { developmentRoots: Record<string, string> };
  skillDesignStorage?: { workspacePath: string; sharedSkillsDirectory: string };
}
export type AIReqRemoteEvent =
  | { type: "presence"; snapshot: AIReqPresenceSnapshot }
  | { type: "workflow" }
  | { type: "models" }
  | { type: "prompts" }
  | { type: "skills"; sessionId: string };
