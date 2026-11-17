import {
  getProviderSettingsSnapshot,
  type ProviderSettingsState,
} from "@/lib/providerSettingsSnapshot.js";

export interface ProviderSettingsRead {
  state: ProviderSettingsState;
}

export function useProviderSettingsView(): ProviderSettingsRead {
  return { state: getProviderSettingsSnapshot() };
}
