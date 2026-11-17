import { ServiceChannels } from "@zcode/shared";
import type { ZCodeWorkspacePresentation } from "@zcode/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

export interface ZCodeSessionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export type ZCodeSessionReadWorkspacePresentationParams = ZCodeSessionWorkspaceTarget;

export interface IZCodeSessionService {
  readWorkspacePresentation(
    params: ZCodeSessionReadWorkspacePresentationParams,
  ): Promise<ZCodeWorkspacePresentation>;
  // 历史侧聊读取已退出；当前准备/恢复只读取工作区展示投影。
}

export const IZCodeSessionService = createServiceDescriptor<IZCodeSessionService>(
  ServiceChannels.ZCodeSession,
);
