import type { ZCodeProvider } from "@zcode/shared";
import { useCallback, useEffect, useMemo } from "react";
import { useServices } from "./useServices.js";
import { getSubagentsContextKey, useSubagentsContextStore } from "@/store/subagentsContextStore.js";

export function useSubagents(
  workspacePath: string | null,
  provider: ZCodeProvider,
  explicitWorkspaceIdentity?: string,
) {
  const { subagentsService } = useServices();
  const workspaceIdentity = explicitWorkspaceIdentity?.trim() || undefined;
  const hasSubagentsService = subagentsService !== undefined;
  const contextKey =
    workspacePath && subagentsService
      ? getSubagentsContextKey(workspacePath, provider, workspaceIdentity, subagentsService)
      : null;
  const context = useSubagentsContextStore((state) =>
    contextKey ? state.contexts[contextKey] : undefined,
  );
  const initialize = useSubagentsContextStore((state) => state.initialize);
  const refreshStore = useSubagentsContextStore((state) => state.refresh);

  useEffect(() => {
    if (!workspacePath || !subagentsService || context) return;
    void initialize(workspacePath, provider, subagentsService, workspaceIdentity);
  }, [
    context,
    initialize,
    provider,
    subagentsService,
    workspaceIdentity,
    workspacePath,
  ]);

  const refresh = useCallback(async () => {
    if (!workspacePath || !subagentsService) return;
    await refreshStore(workspacePath, provider, subagentsService, workspaceIdentity);
  }, [
    provider,
    refreshStore,
    subagentsService,
    workspaceIdentity,
    workspacePath,
  ]);

  return useMemo(
    () => ({
      agents: context?.agents ?? [],
      capability: context?.capability ?? null,
      loading: hasSubagentsService && workspacePath !== null && (!context || context.loading),
      error: context?.error ?? null,
      refresh,
    }),
    [context, hasSubagentsService, refresh, workspacePath],
  );
}
