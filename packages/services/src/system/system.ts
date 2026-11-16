import type { SystemInfo } from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface ISystemService {
  info(): Promise<SystemInfo>;
}

export const ISystemService = createServiceDescriptor<ISystemService>(ServiceChannels.System);
