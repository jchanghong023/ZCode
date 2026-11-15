import { useEffect, useState } from "react";
import type { IServiceAccessor } from "@/data-sync/contract.js";
import { toDataSyncProviderRows, type DataSyncProviderRow } from "@/data-sync/domain/providers.js";
import { logger } from "@/logger.js";

export type DataSyncProvidersList =
  | { phase: "loading" }
  | { phase: "ready"; rows: DataSyncProviderRow[] }
  | { phase: "error" };

export interface DataSyncProvidersState {
  list: DataSyncProvidersList;
}

/** 只读本机 Personal Layer 提供商；服务换代和重新上线后重读，丢弃迟到结果。 */
export function useDataSyncProviders(params: {
  sourceServices: IServiceAccessor | undefined;
  online: boolean;
}): DataSyncProvidersState {
  const { sourceServices, online } = params;
  const [list, setList] = useState<DataSyncProvidersList>({ phase: "loading" });
  const providerSettingsService = sourceServices?.providerSettingsService;

  useEffect(() => {
    // 退役重试入口后，每次 effect 只拥有一次读取；清理直接失效本次请求，避免迟到结果更新界面。
    let active = true;
    setList({ phase: "loading" });

    if (providerSettingsService) {
      providerSettingsService.getView().then(
        (view) => {
          if (active) {
            setList({ phase: "ready", rows: toDataSyncProviderRows(view) });
          }
        },
        (error: unknown) => {
          if (active) setList({ phase: "error" });
          logger.warn("[DataSync] 读取本机模型提供商失败", {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    } else {
      setList({ phase: "error" });
    }

    return () => {
      active = false;
    };
  }, [online, providerSettingsService]);

  return { list };
}
