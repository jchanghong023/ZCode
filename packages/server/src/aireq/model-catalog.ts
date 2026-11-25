import {
  IModelSelectionService,
  type ServiceCollection,
  type WebModelSelectionService,
} from "@zcode/services";
import {
  isAgentModelAvailable,
  readAgentModelChoices,
  readPrototypeAgentModelBinding,
} from "./agent-models.js";
import { production } from "./production-store.js";

/** Extend existing offline catalog with precisely the models used by AIReq role bindings. */
export function modelCatalogOverrides(services: ServiceCollection): Map<string, unknown> {
  const selection = services.get(IModelSelectionService);
  const selectionFacade: WebModelSelectionService = {
    async getView(...args: Parameters<WebModelSelectionService["getView"]>) {
      const original = await selection.getView(...args);
      if (production) {
        if (args[0]?.selection != null || original.providers.length === 0) return original;
        const role = production.zone === "yellow" ? "requirements" : "solution";
        if (!isAgentModelAvailable(role))
          return { ...original, effectiveSelection: null, selectionIssue: "model-not-found" };
        const { runtimeModel } = readPrototypeAgentModelBinding(role);
        return selection.getView({
          selection: {
            providerId: runtimeModel.providerId,
            modelId: runtimeModel.modelId,
            options: { reasoningLevel: runtimeModel.reasoning },
          },
        });
      }
      const models = readAgentModelChoices();
      const template = original.providers[0];
      if (!template) throw new Error("模拟模型目录缺失。");
      const modelTemplate = template.models[0];
      if (!modelTemplate) throw new Error("模拟模型配置缺失。");
      const { api } = template.config;
      const { supportsImage } = modelTemplate.config.properties.inputFormat;
      // 底层已严格校验并解析请求；不能把原始 selection 重新放进响应。
      let preferred = original.preferredSelection;
      if (args[0]?.selection == null) {
        const { runtimeModel: binding } = readPrototypeAgentModelBinding("requirements");
        preferred = {
          providerId: binding.providerId,
          modelId: binding.modelId,
          options: { reasoningLevel: binding.reasoning },
        };
      }
      return {
        revision: original.revision,
        providers: [...new Set(models.map((model) => model.providerId))].map((providerId) => ({
          providerId,
          providerName: models.find((model) => model.providerId === providerId)!.provider,
          // 仅公开协议类型；模板的 Start Plan 账号与端点不属于这些供应商。
          config: api === undefined ? {} : { api: api === null ? null : { type: api.type } },
          models: models
            .filter((model) => model.providerId === providerId)
            .map((model) => ({
              modelId: model.name,
              config: {
                properties: { inputFormat: { supportsImage } },
                optionSpecs: {
                  reasoningLevel: { values: ["default", "low", "medium", "high"] },
                },
              },
            })),
        })),
        ...(preferred === undefined
          ? {}
          : { preferredSelection: preferred, effectiveSelection: preferred }),
        ...(original.selectionIssue === undefined
          ? {}
          : { selectionIssue: original.selectionIssue }),
      };
    },
  };
  return new Map<string, unknown>([[IModelSelectionService.channelName, selectionFacade]]);
}
