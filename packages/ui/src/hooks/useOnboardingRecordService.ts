import { useOptionalServices } from "./useServices.js";

/**
 * Onboarding 完成记录服务（本地持久化，后续上传服务器）。
 * 无 Provider 或未注册服务时返回 null，调用方需判空降级。
 */
export function useOnboardingRecordService() {
  // 原因：try 内调用 Hook 会触发调用位置告警；可选上下文保留缺失服务语义且固定调用顺序。
  const services = useOptionalServices();
  return services?.onboardingRecordService ?? null;
}
