import { useEffect, useMemo, useState } from "react";
import type {
  CodingPlanResetScopeRequest,
  CodingPlanResetStatusSnapshot,
  ZCodeAccountAccess,
  ZCodeProviderAccountAccess,
} from "@zcode/shared";
import { useOptionalBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useStableAccountAccess } from "@/hooks/useStableAccountAccess.js";
import { logger } from "@/logger.js";
import { useZCodeStoreWithDefault } from "@/store/StoreProvider.js";

const STATUS_POLL_INTERVAL_MS = 5 * 60_000;

/** 只读取服务端重置历史；不申请机会、不提交已读、不执行重置或推算权益。 */
export function useCodingPlanQuotaResetUi({
  preferredProviderId,
  accountAccess,
}: {
  preferredProviderId?: string | null;
  accountAccess?: ZCodeProviderAccountAccess | ZCodeAccountAccess | null;
}): { snapshot: CodingPlanResetStatusSnapshot | null } {
  const services = useOptionalBaseWorkspaceServices();
  const service = services?.usageStatsService;
  const stableAccountAccess = useStableAccountAccess(accountAccess);
  const authSessionSeq = useZCodeStoreWithDefault((state) => state.authSessionSeq, 0);
  const scope = useMemo<CodingPlanResetScopeRequest | null>(() => {
    const providerId = preferredProviderId?.trim();
    return providerId && stableAccountAccess
      ? { preferredProviderId: providerId, accountAccess: stableAccountAccess }
      : null;
  }, [preferredProviderId, stableAccountAccess]);
  const [result, setResult] = useState<{
    service: typeof service;
    scope: CodingPlanResetScopeRequest;
    authSessionSeq: number;
    snapshot: CodingPlanResetStatusSnapshot;
  } | null>(null);

  useEffect(() => {
    if (!service || !scope) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const snapshot = await service.getCodingPlanResetStatus(scope);
        if (active) setResult({ service, scope, authSessionSeq, snapshot });
      } catch (error) {
        // 读取失败不伪造“无机会”或成功事实；保留同一 scope 的已有服务端快照。
        if (active) logger.warn("[coding-plan-reset] status read failed", { error });
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), STATUS_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authSessionSeq, scope, service]);

  // 切换 provider / Personal-Team / 鉴权代次时，不展示上一 scope 的异步结果。
  return {
    snapshot:
      result &&
      result.service === service &&
      result.scope === scope &&
      result.authSessionSeq === authSessionSeq
        ? result.snapshot
        : null,
  };
}
