// 模拟模型领域：模型选择目录。
import { BIGMODEL_PROVIDER_ID } from "@zcode/shared";
import { modelSelectionSchema, type ModelSelection } from "@zcode/shared/model-selection";
import {
  IModelSelectionService,
  type ServiceCollection,
  type WebModelSelectionService,
  type WebModelSelectionView,
} from "@zcode/services";
import { z } from "zod";

type ModelServiceRegistrar = Pick<ServiceCollection, "register">;

const modelSelectionViewInputSchema = z
  .strictObject({ selection: modelSelectionSchema.nullable() })
  .optional();

function reasoningLevels(modelId: string): string[] {
  return modelId.includes("Flash") ? ["low", "medium", "high", "max"] : ["low", "medium", "high"];
}

function completeModelConfig(modelId: string) {
  return {
    properties: { inputFormat: { supportsImage: true } },
    optionSpecs: {
      reasoningLevel: {
        values: reasoningLevels(modelId),
      },
    },
  };
}

const MOCK_MODEL_IDS = ["GLM-5.3-Flash", "GLM-5.3"];
export const MOCK_DEFAULT_MODEL_SELECTION = {
  providerId: BIGMODEL_PROVIDER_ID,
  modelId: MOCK_MODEL_IDS[0]!,
  options: { reasoningLevel: "max" },
};

export function completeMockModelSelection(selection: ModelSelection) {
  if (selection.providerId !== BIGMODEL_PROVIDER_ID || !MOCK_MODEL_IDS.includes(selection.modelId))
    return null;
  const thoughtLevels = reasoningLevels(selection.modelId);
  const thought = selection.options?.reasoningLevel ?? thoughtLevels.at(-1)!;
  if (!thoughtLevels.includes(thought)) return null;
  return {
    provider: selection.providerId,
    model: selection.modelId,
    thought,
    thoughtLevels,
    modelSelection: { ...selection, options: { reasoningLevel: thought } },
  };
}

class MockModelSelectionService implements WebModelSelectionService {
  async getView(
    input?: Parameters<WebModelSelectionService["getView"]>[0],
  ): Promise<WebModelSelectionView> {
    if (arguments.length > 1) {
      throw Object.assign(new Error("模型目录查询最多接收一个选择参数。"), {
        code: "INVALID_ARGUMENT",
        publicMessage: true,
      });
    }
    const preferred =
      modelSelectionViewInputSchema.parse(input)?.selection ?? MOCK_DEFAULT_MODEL_SELECTION;
    return {
      revision: 1,
      providers: [
        {
          providerId: "bigmodel",
          providerName: "智谱 Coding Plan",
          config: {
            access: {
              type: "zhipu-account",
              accountType: "bigmodel",
              mode: "start-plan",
              entitled: true,
            },
            api: { type: "anthropic-messages" },
            logo: { type: "builtin", key: "zai" },
          },
          models: MOCK_MODEL_IDS.map((modelId) => ({
            modelId,
            config: completeModelConfig(modelId),
          })),
        },
      ],
      preferredSelection: preferred,
      effectiveSelection: preferred,
    };
  }
}

export function registerModelSelectionMockService(services: ModelServiceRegistrar): void {
  services.register(IModelSelectionService, new MockModelSelectionService());
}
