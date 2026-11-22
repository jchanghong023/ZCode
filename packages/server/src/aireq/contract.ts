import type { AIReqAgentModelBinding, IAIReqService } from "@zcode/services/aireq";
import type { ModelSelection } from "@zcode/shared";

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
  ): void;
  /** Commit once after successful native completion; explicit simulated output. */
  completeNative(
    sessionId: string,
    commandId: string,
    text: string,
  ): { reply: string; modelId?: string };
  /** Read existing business report, without creating work. */
  seedNative(sessionId: string): string | undefined;
  /** Session-creation binding snapshot; not current platform defaults. */
  getNativeBinding(
    sessionId: string,
  ): Pick<AIReqAgentModelBinding, "providerId" | "modelId" | "reasoning"> | undefined;
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
export { assertSkillSession } from "./skill-design.js";
export {
  readPrototypeNativeContext,
  readPrototypeProjectDirectory,
  readPrototypeProjectWorkspace,
} from "./workflow.js";
