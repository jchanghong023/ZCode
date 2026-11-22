import {
  IModelSelectionService,
  type ServiceCollection,
  type WebModelSelectionService,
} from "@zcode/services";
import { PROTOTYPE_AGENT_MODELS, readPrototypeAgentModelBinding } from "./agent-models.js";

/** Extend existing offline catalog with precisely the models used by AIReq role bindings. */
export function modelCatalogOverrides(services: ServiceCollection): Map<string, unknown> {
  const selection = services.get<WebModelSelectionService>(IModelSelectionService);
  const selectionFacade: WebModelSelectionService = {
    async getView(...args: Parameters<WebModelSelectionService["getView"]>) {
      const original = await selection.getView(...args);
      const template = original.providers[0];
      if (!template) throw new Error("模拟模型目录缺失。");
      const modelTemplate = template.models[0];
      if (!modelTemplate) throw new Error("模拟模型配置缺失。");
      const { api } = template.config;
      // 浏览器只用协议类型判断模型是否可列出，不能透传端点或鉴权请求头。
      const publicApi = api == null ? api : { type: api.type };
      const binding = readPrototypeAgentModelBinding("requirements");
      // 底层已严格校验并解析请求；不能把原始 selection 重新放进响应。
      const preferred =
        args[0]?.selection == null
          ? {
              providerId: binding.providerId,
              modelId: binding.modelId,
              options: { reasoningLevel: binding.reasoning },
            }
          : original.preferredSelection;
      return {
        ...original,
        providers: [...new Set(PROTOTYPE_AGENT_MODELS.map((model) => model.providerId))].map(
          (providerId) => ({
            providerId,
            providerName: PROTOTYPE_AGENT_MODELS.find((model) => model.providerId === providerId)!
              .provider,
            // 底座样例是 Start Plan；继承其账号元数据会把四个供应商都错误显示为免费套餐。
            config: { api: publicApi },
            models: PROTOTYPE_AGENT_MODELS.filter((model) => model.providerId === providerId).map(
              (model) => ({
                ...modelTemplate,
                modelId: model.name,
                config: {
                  ...modelTemplate.config,
                  optionSpecs: {
                    reasoningLevel: { values: ["default", "low", "medium", "high"] },
                  },
                },
              }),
            ),
          }),
        ),
        preferredSelection: preferred,
        effectiveSelection: preferred,
      };
    },
  };
  return new Map<string, unknown>([[IModelSelectionService.channelName, selectionFacade]]);
}
