import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared/channels";
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
  readonly onDidChange?: Event<ModelSelectionView>;
  getView(input?: ModelSelectionViewInput): Promise<ModelSelectionView>;
}

type ModelSelectionProvider = ModelSelectionView["providers"][number];
type ModelSelectionModel = ModelSelectionProvider["models"][number];
type ModelSelectionModelConfig = ModelSelectionModel["config"];

type ModelSelectionProviderAccess = NonNullable<ModelSelectionProvider["config"]["access"]>;
type WebModelSelectionProviderAccess =
  | Pick<Exclude<ModelSelectionProviderAccess, { type: "zhipu-account" }>, "type">
  | Pick<
      Extract<ModelSelectionProviderAccess, { type: "zhipu-account" }>,
      "type" | "accountType" | "mode" | "entitled"
    >;

type WebModelSelectionModel = Omit<ModelSelectionModel, "config"> & {
  readonly config: Omit<ModelSelectionModelConfig, "enabled" | "optionSpecs" | "properties"> & {
    readonly properties: {
      readonly inputFormat: Pick<
        ModelSelectionModelConfig["properties"]["inputFormat"],
        "supportsImage"
      >;
    };
    readonly optionSpecs: {
      readonly reasoningLevel: Pick<
        ModelSelectionModelConfig["optionSpecs"]["reasoningLevel"],
        "values"
      >;
    };
  };
};

export interface WebModelSelectionView extends Omit<ModelSelectionView, "providers"> {
  readonly providers: ReadonlyArray<
    Omit<ModelSelectionProvider, "templateId" | "config" | "models"> & {
      readonly config: Pick<ModelSelectionProvider["config"], "logo"> & {
        readonly access?: WebModelSelectionProviderAccess | null;
        readonly api?: Pick<NonNullable<ModelSelectionProvider["config"]["api"]>, "type"> | null;
      };
      readonly models: readonly WebModelSelectionModel[];
    }
  >;
}

export interface WebModelSelectionService {
  getView(input?: ModelSelectionViewInput): Promise<WebModelSelectionView>;
}

export const WEB_MODEL_SELECTION_METHODS = ["getView"] as const satisfies readonly (
  keyof WebModelSelectionService
)[];

export const IModelSelectionService = createServiceDescriptor<IModelSelectionService>(
  ServiceChannels.ModelSelection,
);
