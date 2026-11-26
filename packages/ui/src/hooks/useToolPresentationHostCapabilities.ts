import { useMemo } from "react";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useWorkflowSubagentModelProviderName } from "@/hooks/useWorkflowSubagentModelProviderName.js";
import type { ToolPresentationCapabilities } from "@/ToolCallBlocks/presentationCapabilities.js";

/** 宿主能力只在 App 装配；公开 renderer 不读取用户配置或平台服务。 */
export function useToolPresentationHostCapabilities(
  workspacePath: string,
): ToolPresentationCapabilities {
  const services = useOptionalServices();
  const modelProviderName = useWorkflowSubagentModelProviderName(workspacePath);
  return useMemo(
    () => ({
      readMediaPreview: services
        ? (path: string) => services.fileService.readMediaPreview({ path })
        : undefined,
      modelProviderName,
    }),
    [services, modelProviderName],
  );
}
