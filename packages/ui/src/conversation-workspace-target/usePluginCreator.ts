import { useCallback, useEffect, useMemo, useState } from "react";
import { ZCODE_AGENT_PROVIDER } from "@zcode/shared";
import type { CreateTaskOptions, CreateTaskRequest } from "@/app-shell/types.js";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";
import { loadPluginCreatorPrefill } from "@/settings/pluginCreatorPrefill.js";
import { isWorkspaceReadOnly } from "@/store/tabStore.js";
import { useTabStore, useTabStoreApi } from "@/store/TabStoreProvider.js";
import { usePaneLayoutStore } from "@/v4/paneLayoutStore.js";
import { resolveWorkbenchNewTaskTarget } from "@/conversation-workspace-target/workbenchTarget.js";
import { useWorkbenchGroupStore } from "@/v4/workbenchGroupStore.js";

export function usePluginCreator(
  onCreateTask: ((request?: CreateTaskRequest) => void) | undefined,
  menuOpen: boolean,
) {
  const tabStore = useTabStoreApi();
  const activeWorkspacePath = useTabStore((state) => state.activeWorkspacePath);
  const activeWorkspaceIdentity = useTabStore((state) => state.activeWorkspaceIdentity);
  const paneLayout = usePaneLayoutStore((state) => state);
  const group = useWorkbenchGroupStore((state) =>
    state.activeGroupId ? (state.groups[state.activeGroupId] ?? null) : null,
  );
  const target = resolveWorkbenchNewTaskTarget({
    activeWorkspacePath,
    activeWorkspaceIdentity,
    activeGroup: group,
    paneLayout,
  });
  const workspacePath = target?.workspacePath;
  const workspaceIdentity = target?.workspaceIdentity;
  const targetKey = workspaceIdentity?.trim() || workspacePath || "";
  const resolution = useWorkspaceServicesResolution(workspacePath, undefined, workspaceIdentity);
  const scope = useMemo(
    () => ({
      menuOpen,
      targetKey,
      services: resolution.services,
      remoteSessionId: resolution.remoteSessionId,
      rpcReady: resolution.rpcReady,
      onCreateTask,
    }),
    [
      menuOpen,
      targetKey,
      resolution.services,
      resolution.remoteSessionId,
      resolution.rpcReady,
      onCreateTask,
    ],
  );
  const [prepared, setPrepared] = useState<{
    scope: object;
    prefill: CreateTaskOptions | null;
  } | null>(null);
  const canPrepare = Boolean(menuOpen && workspacePath && onCreateTask && resolution.rpcReady);

  useEffect(() => {
    if (!canPrepare || !workspacePath) return;
    let current = true;
    // 原因：mock 没有官方创建技能，原入口却始终可点击。菜单打开时查询已有目录，
    // 当前目标没有技能就禁用；不新增后端能力字段，也不在点击后伪造创建成功。
    void loadPluginCreatorPrefill(
      () =>
        resolution.services.skillsService.list({
          workspacePath,
          workspaceIdentity,
          provider: ZCODE_AGENT_PROVIDER,
        }),
      () => current,
    )
      .then((prefill) => {
        if (current) setPrepared({ scope, prefill });
      })
      .catch((error: unknown) => {
        if (!current) return;
        setPrepared({ scope, prefill: null });
        if (!(error instanceof Error && error.message === "plugin_creator_unavailable")) {
          logger.warn("[PluginCreator] 技能目录查询失败", { error, workspaceKey: targetKey });
        }
      });
    return () => {
      current = false;
    };
  }, [
    canPrepare,
    resolution.services.skillsService,
    scope,
    targetKey,
    workspaceIdentity,
    workspacePath,
  ]);

  const create = useCallback(() => {
    if (
      !onCreateTask ||
      !workspacePath ||
      !resolution.rpcReady ||
      prepared?.scope !== scope ||
      !prepared.prefill
    )
      return;
    const state = tabStore.getState();
    const groups = useWorkbenchGroupStore.getState();
    const current = resolveWorkbenchNewTaskTarget({
      activeWorkspacePath: state.activeWorkspacePath,
      activeWorkspaceIdentity: state.activeWorkspaceIdentity,
      activeGroup: groups.activeGroupId ? (groups.groups[groups.activeGroupId] ?? null) : null,
      paneLayout: usePaneLayoutStore.getState(),
    });
    if (
      (current?.workspaceIdentity?.trim() || current?.workspacePath || "") !== targetKey ||
      isWorkspaceReadOnly(state, workspacePath, workspaceIdentity)
    )
      return;
    onCreateTask({ ...prepared.prefill, expectedWorkspaceKey: targetKey });
  }, [
    onCreateTask,
    prepared,
    resolution.rpcReady,
    scope,
    tabStore,
    targetKey,
    workspaceIdentity,
    workspacePath,
  ]);

  return {
    create,
    busy: canPrepare && prepared?.scope !== scope,
    available: Boolean(resolution.rpcReady && prepared?.scope === scope && prepared.prefill),
  };
}
