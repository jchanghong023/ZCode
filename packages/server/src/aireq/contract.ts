import type { AIReqAgentModelBinding, IAIReqService } from "@zcode/services/aireq";

/** Business callbacks only; rows, attachments, topics and subscriptions remain with native mock owner. */
export interface AIReqNativeBridge {
  /** Reject invalid actor/version/history before native rows or accepted ACK. */
  admitNative(sessionId: string, commandId: string, text: string): void;
  /** Commit once after successful native completion; explicit simulated output. */
  completeNative(sessionId: string, commandId: string, text: string): string;
  /** Read existing business report, without creating work. */
  seedNative(sessionId: string): string | undefined;
  /** Session-creation binding snapshot; not current platform defaults. */
  getNativeBinding(sessionId: string): AIReqAgentModelBinding | undefined;
  /** Canonical published proposal/history ref only; never provisional drafts or private Skill. */
  isPublishedNativeSession(sessionId: string): boolean;
  /** Immutable connection actor/client key, used by native attachment admission. */
  actorKey(): string;
}
export type MockAIReqOwner = IAIReqService & AIReqNativeBridge;
export { MockAIReqService, getConnectionServices } from "./service.js";
export { withAIReqIdentity, validateAIReqIdentity } from "./identity.js";
