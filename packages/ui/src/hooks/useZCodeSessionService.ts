import type { IZCodeSessionService } from "@zcode/services";
import { useServices } from "@/hooks/useServices.js";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

export function useZCodeSessionService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IZCodeSessionService {
  // 路径可在同一实例内变化；固定调用顺序，只选择结果，避免切换工作区破坏 Hook 状态。
  const contextServices = useServices();
  const workspaceServices = useWorkspaceServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
  );
  const services = workspacePath ? workspaceServices : contextServices;
  return services.zcodeSessionService;
}
