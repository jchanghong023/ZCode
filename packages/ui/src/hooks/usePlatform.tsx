/**
 * usePlatform —— 通过 React Context 提供 IPlatformService
 *
 * 浏览器下载、外链、通知等本机交互通过此 hook 访问，
 * 不直接调用宿主全局对象。
 */
import { createContext, useContext, type ReactNode } from "react";
import type { IPlatformService } from "@zcode/shared";

const PlatformContext = createContext<IPlatformService | null>(null);

export function PlatformProvider({
  platform,
  children,
}: {
  platform: IPlatformService;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): IPlatformService {
  const ctx = useOptionalPlatform();
  if (!ctx) {
    throw new Error("usePlatform 必须在 PlatformProvider 内使用");
  }
  return ctx;
}

export function useOptionalPlatform(): IPlatformService | null {
  const ctx = useContext(PlatformContext);
  return ctx;
}
