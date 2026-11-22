import type { IAIReqService } from "@zcode/services/aireq";
import type { ModelSelection } from "@zcode/shared";
import type { NativeRuntimeModel } from "./agent-models.js";
import type { AIReqNativeTurnResult } from "./native-business.js";

/** Business callbacks only; rows, attachments, topics and subscriptions remain with native mock owner. */
export interface AIReqNativeBridge {
  /** Recheck live business scope for commands that mutate an existing native session. */
  assertNativeWritable(sessionId: string): void;
  /** Validate immutable input actor and current scope before ACK; queueing does not freeze execution. */
  admitNative(sessionId: string, commandId: string, text: string): void;
  /** Freeze execution input, model, session instructions and business version once after dispatch. */
  beginNative(
    sessionId: string,
    commandId: string,
    text: string,
    modelSelection?: ModelSelection,
    effectiveText?: string,
  ): void;
  /** Stage structured output without modifying the workflow. */
  prepareNativeResult(sessionId: string, commandIds: readonly string[]): AIReqNativeTurnResult;
  /** Commit only after the original execution is still current. */
  completeNative(sessionId: string, result: AIReqNativeTurnResult): void;
  /** Release a canceled or failed execution's uncommitted input. */
  discardNative(sessionId: string, commandId: string): void;
  /** Read existing business report, without creating work. */
  seedNative(sessionId: string): string | undefined;
  /** Session-creation binding snapshot; not current platform defaults. */
  getNativeBinding(sessionId: string): NativeRuntimeModel | undefined;
  /** Canonical published proposal/history ref only; never provisional drafts or private Skill. */
  isPublishedNativeSession(sessionId: string): boolean;
  /** Immutable connection actor/client key, used by native attachment admission. */
  actorKey(): string;
}
export type MockAIReqOwner = IAIReqService & AIReqNativeBridge;
export type { GitDocumentReader } from "./proposal-storage.js";
export { presenceIP } from "./presence.js";
export { MockAIReqService, getConnectionServices, registerAIReqConnection } from "./service.js";
export { withAIReqIdentity, validateAIReqIdentity } from "./identity.js";
export { readPrototypeSkillNode } from "./skills.js";
export { assertSkillSession, prototypeSkillDesignWorkspaceIdentity } from "./skill-design.js";
export { readPrototypeProjectDirectory } from "./workflow.js";
