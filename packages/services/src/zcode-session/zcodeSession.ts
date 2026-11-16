import { ServiceChannels } from "@zcode/shared";
import type {
  ZCodeDeliveryKind,
  ZCodeSessionStateSnapshot,
  ZCodeWorkspacePresentation,
} from "@zcode/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

export interface ZCodeSessionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export type ZCodeSessionReadWorkspacePresentationParams = ZCodeSessionWorkspaceTarget;

export interface ZCodeTaskTarget extends ZCodeSessionWorkspaceTarget {
  sessionId: string;
}

export interface ZCodeSessionReadParams extends ZCodeTaskTarget {
  deliveryKind?: ZCodeDeliveryKind;
  messageLimit?: number;
  afterSeq?: number;
}

export interface IZCodeSessionService {
  readWorkspacePresentation(
    params: ZCodeSessionReadWorkspacePresentationParams,
  ): Promise<ZCodeWorkspacePresentation>;
  readSession(params: ZCodeSessionReadParams): Promise<ZCodeSessionStateSnapshot>;
}

export const IZCodeSessionService = createServiceDescriptor<IZCodeSessionService>(
  ServiceChannels.ZCodeSession,
);
