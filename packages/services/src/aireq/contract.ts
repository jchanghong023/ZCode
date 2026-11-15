import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  AIReqRemoteArgs,
  AIReqRemoteBootstrap,
  AIReqRemoteEvent,
  AIReqRemotePath,
  AIReqRemoteResult,
} from "./remote-operations.js";
import type { AIReqSelection } from "./types.js";

/** Explicit caller context; employee ID is a prototype permission hint, not authentication. */
export interface AIReqIdentity {
  employeeId: string;
  clientId: string;
  demo?: string;
}

/** Shared mock owns accepted business state. Clients only retain projections and unsent drafts. */
export interface IAIReqService {
  /** Reads metadata without creating work; safe to repeat after reconnect. */
  bootstrap(identity: AIReqIdentity): Promise<AIReqRemoteBootstrap>;
  /** Server validates identity, permission and versions before admission. Mutations emit onDidChange after commit. */
  call<P extends AIReqRemotePath>(
    identity: AIReqIdentity,
    path: P,
    args: AIReqRemoteArgs<P>,
    selection?: AIReqSelection,
  ): Promise<AIReqRemoteResult<P>>;
  /** Invalidation facts, never another accepted-state store. Consumers re-read their current selection. */
  readonly onDidChange: Event<AIReqRemoteEvent>;
}
export const IAIReqService = createServiceDescriptor<IAIReqService>(ServiceChannels.AIReq);
