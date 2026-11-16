import { formatUserFacingError } from "@/lib/errorMessage.js";
import { useEffect, useState } from "react";

export function useSchedulerQuery<T>(load: () => T | Promise<T>, revision: number, enabled = true) {
  const [result, setResult] = useState<{
    load: typeof load;
    revision: number;
    value?: T;
    error?: string;
    loading: boolean;
  }>();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setResult((previous) => ({
      load,
      revision,
      value: previous?.load === load ? previous.value : undefined,
      error: previous?.load === load ? previous.error : undefined,
      loading: true,
    }));
    void (async () => {
      try {
        const value = await load();
        if (active) setResult({ load, revision, value, loading: false });
      } catch (cause) {
        if (active)
          setResult((previous) => ({
            load,
            revision,
            value: previous?.load === load ? previous.value : undefined,
            error: formatUserFacingError(cause, "分析数据读取失败，请稍后重试。"),
            loading: false,
          }));
      }
    })();
    return () => {
      active = false;
    };
  }, [load, revision, enabled]);
  return enabled && result?.load === load
    ? { ...result, loading: result.revision !== revision || result.loading }
    : { loading: enabled, value: undefined, error: undefined };
}
