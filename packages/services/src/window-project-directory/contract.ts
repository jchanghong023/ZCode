import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "#src/descriptors.js";
import type { IProjectService } from "#src/project/contract.js";

export interface IWindowProjectChangesService {
  getCapabilities(): Promise<{ version: 1 }>;
  onDidChange: Event<void>;
}

/** 整组选择，避免把窗口项目与广播混用。 */
export interface WindowProjectDirectoryServices {
  projectService: IProjectService;
  changesService: IWindowProjectChangesService;
}

export const IWindowProjectService = createServiceDescriptor<IProjectService>(
  ServiceChannels.WindowProject,
);
export const IWindowProjectChangesService = createServiceDescriptor<IWindowProjectChangesService>(
  ServiceChannels.WindowProjectChanges,
);
