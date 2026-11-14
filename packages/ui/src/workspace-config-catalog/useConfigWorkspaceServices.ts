import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";

/**
 * 浏览器没有跨设备 source-settings attachment，配置目录只能复用当前 workspace 绑定的服务。
 * 保留本入口是为了不改变设置页各分区的取服务方式。
 */
export function useConfigWorkspaceServicesResolution(
  ...args: Parameters<typeof useWorkspaceServicesResolution>
) {
  return useWorkspaceServicesResolution(...args);
}

export function useConfigWorkspaceServices(
  ...args: Parameters<typeof useWorkspaceServicesResolution>
) {
  return useConfigWorkspaceServicesResolution(...args).services;
}
