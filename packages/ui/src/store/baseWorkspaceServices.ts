import type { IServiceAccessor } from "@zcode/services";
import { create } from "zustand";

export const useRegisteredBaseWorkspaceServices = create<IServiceAccessor | null>(() => null);

export function registerBaseWorkspaceServices(services: IServiceAccessor): void {
  useRegisteredBaseWorkspaceServices.setState(services, true);
}
