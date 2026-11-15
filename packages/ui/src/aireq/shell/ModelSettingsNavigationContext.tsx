import { createContext, useContext } from "react";

export const ModelSettingsNavigationContext = createContext<(() => void) | undefined>(undefined);

export function useOpenModelSettings() {
  return useContext(ModelSettingsNavigationContext);
}

// 设置覆盖工作区但不卸载输入所有者；可见性只派生自壳的设置状态，不保存业务副本。
export const AIReqWorkspaceActiveContext = createContext(true);

export function useAIReqWorkspaceActive() {
  return useContext(AIReqWorkspaceActiveContext);
}
