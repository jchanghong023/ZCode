import {
  normalizeUnknownError,
  ZCODE_AGENT_PROVIDER_NOT_READY_CODE,
  type ZCodeError,
} from "@zcode/shared";
export const MODEL_CONFIG_MISSING_UI_ERROR_CODE = "model_config_missing";

export type ModelConfigMissingUiError = ZCodeError & {
  code: typeof MODEL_CONFIG_MISSING_UI_ERROR_CODE;
};

export function buildModelConfigMissingUiError(): ModelConfigMissingUiError {
  // provider_not_ready 是进程启动门禁的内部等待原因，直接展示会被当成
  // Agent 故障。草稿首页统一投影成已有 modelConfigMissing banner 的稳定 code。
  return {
    code: MODEL_CONFIG_MISSING_UI_ERROR_CODE,
    message: "No usable model provider is configured.",
  };
}

export function isProviderNotReadyError(error: unknown): boolean {
  return normalizeUnknownError(error).code === ZCODE_AGENT_PROVIDER_NOT_READY_CODE;
}

