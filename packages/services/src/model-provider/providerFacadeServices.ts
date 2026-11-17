import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared";
import {
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderSettingsView,
} from "@zcode/provider";
import { createServiceDescriptor } from "../descriptors.js";

export type {
  ProviderSettingsProviderView,
  ModelSelectionView,
  ModelSelectionViewInput,
  ProviderSettingsView,
} from "@zcode/provider";

export interface IProviderSettingsService {
  getView(): Promise<ProviderSettingsView>;
  refresh(reason: string): Promise<ProviderSettingsView>;
}

export const IProviderSettingsService = createServiceDescriptor<IProviderSettingsService>(
  ServiceChannels.ProviderSettings,
);

export interface IModelSelectionService {
  readonly onDidChange: Event<ModelSelectionView>;
  getView(input?: ModelSelectionViewInput): Promise<ModelSelectionView>;
}

export const IModelSelectionService = createServiceDescriptor<IModelSelectionService>(
  ServiceChannels.ModelSelection,
);
