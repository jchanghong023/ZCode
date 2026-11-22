import {
  decodeCustomModelValue as decodeSharedCustomModelValue,
  encodeCustomModelValue as encodeSharedCustomModelValue,
  parseModelPickerValue as parseSharedModelSelection,
  type ModelSelection,
} from "@zcode/shared";

interface DecodedCustomModelValue {
  providerId: string;
  modelName?: string;
}

export function encodeCustomModelValue(providerId: string, modelName?: string): string {
  return encodeSharedCustomModelValue(providerId, modelName);
}

export function decodeCustomModelValue(value: string): DecodedCustomModelValue | null {
  return decodeSharedCustomModelValue(value);
}

export function parseModelPickerValue(value: string): ModelSelection {
  const customModel = decodeSharedCustomModelValue(value);
  if (customModel?.providerId && customModel.modelName) {
    // 输入器使用展示值 custom:provider:model；协议需要 providerId/modelId 结构。
    return {
      providerId: customModel.providerId,
      modelId: customModel.modelName,
    };
  }

  return parseSharedModelSelection(value);
}
