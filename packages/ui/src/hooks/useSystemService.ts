/**
 * useSystemService —— 系统服务 hooks
 */
import { useState, useEffect, useCallback } from "react";
import type { SystemInfo } from "@zcode/shared";
import { useServices } from "./useServices.js";

/** 获取系统信息，自带 loading/error/refresh 状态管理 */
export function useSystemInfo() {
  const { systemService } = useServices();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await systemService.info();
      setInfo(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [systemService]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { info, loading, error, refresh };
}
