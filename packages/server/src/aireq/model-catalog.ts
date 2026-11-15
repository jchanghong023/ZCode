import {
  IModelSelectionService,
  IProviderSettingsService,
  type ServiceCollection,
} from "@zcode/services";
import { PROTOTYPE_AGENT_MODELS, readPrototypeAgentModelBinding } from "./agent-models.js";

/** Extend existing offline catalog with precisely the models used by AIReq role bindings. */
export function modelCatalogOverrides(services: ServiceCollection): Map<string, unknown> {
  const selection = services.get(IModelSelectionService);
  const settings = services.get(IProviderSettingsService);
  const selectionFacade = new Proxy(selection, {
    get(target, key) {
      if (key !== "getView") {
        const value = Reflect.get(target, key, target);
        return typeof value === "function" && !String(key).startsWith("on")
          ? value.bind(target)
          : value;
      }
      return async (input?: Parameters<typeof selection.getView>[0]) => {
        const original = await selection.getView(input);
        const template = original.providers[0];
        if (!template) throw new Error("模拟模型目录缺失。");
        const modelTemplate = template.models[0];
        if (!modelTemplate) throw new Error("模拟模型配置缺失。");
        const binding = readPrototypeAgentModelBinding("requirements");
        const preferred = input?.selection ?? {
          providerId: binding.providerId,
          modelId: binding.modelId,
          options: { reasoningLevel: binding.reasoning },
        };
        return {
          ...original,
          providers: [...new Set(PROTOTYPE_AGENT_MODELS.map((model) => model.providerId))].map(
            (providerId) => ({
              ...template,
              providerId,
              providerName: PROTOTYPE_AGENT_MODELS.find((model) => model.providerId === providerId)!
                .provider,
              // 底座样例是 Start Plan；继承其账号元数据会把四个供应商都错误显示为免费套餐。
              templateId: undefined,
              config: { ...template.config, access: undefined, logo: undefined },
              models: PROTOTYPE_AGENT_MODELS.filter((model) => model.providerId === providerId).map(
                (model) => ({
                  ...modelTemplate,
                  modelId: model.name,
                  config: {
                    ...modelTemplate.config,
                    optionSpecs: {
                      ...modelTemplate.config.optionSpecs,
                      reasoningLevel: { values: ["default", "low", "medium", "high"], map: "{}" },
                    },
                  },
                }),
              ),
            }),
          ),
          preferredSelection: preferred,
          effectiveSelection: preferred,
        };
      };
    },
  });
  const settingsFacade = new Proxy(settings, {
    get(target, key) {
      if (key !== "getView" && key !== "refresh") {
        const value = Reflect.get(target, key, target);
        return typeof value === "function" && !String(key).startsWith("on")
          ? value.bind(target)
          : value;
      }
      return async () => {
        const original = await settings.getView();
        const template = original.providers[0];
        if (!template) throw new Error("模拟供应商目录缺失。");
        const modelTemplate = template.models[0];
        if (!modelTemplate) throw new Error("模拟模型配置缺失。");
        return {
          ...original,
          providerOrder: [...new Set(PROTOTYPE_AGENT_MODELS.map((model) => model.providerId))],
          providers: [...new Set(PROTOTYPE_AGENT_MODELS.map((model) => model.providerId))].map(
            (providerId) => ({
              ...template,
              providerId,
              providerName: PROTOTYPE_AGENT_MODELS.find((model) => model.providerId === providerId)!
                .provider,
              templateId: undefined,
              effectiveConfig: { ...template.effectiveConfig, access: undefined, logo: undefined },
              models: PROTOTYPE_AGENT_MODELS.filter((model) => model.providerId === providerId).map(
                (model) => ({ ...modelTemplate, modelId: model.name }),
              ),
            }),
          ),
        };
      };
    },
  });
  return new Map<string, unknown>([
    [IModelSelectionService.channelName, selectionFacade],
    [IProviderSettingsService.channelName, settingsFacade],
  ]);
}
