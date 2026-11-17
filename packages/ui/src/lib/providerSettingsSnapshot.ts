import type { ProviderSettingsView } from "@zcode/services";

export type ProviderSettingsState =
  | { status: "loading" }
  | { status: "ready"; view: ProviderSettingsView }
  | { status: "error"; error: Error };

const snapshot: ProviderSettingsState = { status: "loading" };

export function getProviderSettingsSnapshot(): ProviderSettingsState {
  return snapshot;
}
