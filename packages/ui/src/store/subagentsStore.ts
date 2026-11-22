import { create } from "zustand";
import {
  normalizeAgentProviderToZCodeAgent,
  ZCODE_AGENT_PROVIDER,
  type ZCodeProvider,
  type AgentSummary,
  type AgentsCapability,
} from "@zcode/shared";
import type { ISubagentsService } from "@zcode/services";
import { logger } from "@/logger.js";
import { getRemoteWorkspaceServicesForIdentity } from "@/store/remoteWorkspaceSessionStore.js";
import { getSubagentsContextKey, useSubagentsContextStore } from "@/store/subagentsContextStore.js";
import { getServiceAuthorityId } from "@/store/serviceAuthorityKey.js";
import {
  isLatestAgentLoadRequest,
  loadAgentsOnce,
  nextAgentLoadRequestId,
} from "@/store/subagentsStoreLoading.js";

interface SubagentsStoreState {
  workspacePath: string | null;
  workspaceIdentity: string | null;
  loadedWorkspacePath: string | null;
  loadedWorkspaceIdentity: string | null;
  provider: ZCodeProvider;
  loadedProvider: ZCodeProvider | null;
  agents: AgentSummary[];
  capability: AgentsCapability | null;
  loading: boolean;
  error: string | null;
  initialize: (
    workspacePath: string,
    providerOrSubagentsService: ZCodeProvider | ISubagentsService,
    maybeSubagentsService?: ISubagentsService,
    workspaceIdentity?: string,
  ) => Promise<void>;
  refresh: (subagentsService: ISubagentsService, workspaceIdentity?: string) => Promise<void>;
}

let loadedSubagentsServiceAuthorityId: number | null = null;

export const useSubagentsStore = create<SubagentsStoreState>((set, get) => ({
  workspacePath: null,
  workspaceIdentity: null,
  loadedWorkspacePath: null,
  loadedWorkspaceIdentity: null,
  provider: ZCODE_AGENT_PROVIDER,
  loadedProvider: null,
  agents: [],
  capability: null,
  loading: false,
  error: null,
  async initialize(
    workspacePath: string,
    providerOrSubagentsService: ZCodeProvider | ISubagentsService,
    maybeSubagentsService?: ISubagentsService,
    workspaceIdentity?: string,
  ) {
    const currentState = get();
    const hasProvider = typeof providerOrSubagentsService === "string";
    const provider = normalizeAgentProviderToZCodeAgent(
      hasProvider ? providerOrSubagentsService : ZCODE_AGENT_PROVIDER,
    );
    const subagentsService = hasProvider ? maybeSubagentsService : providerOrSubagentsService;
    const normalizedWorkspaceIdentity = workspaceIdentity?.trim() || null;
    if (!subagentsService) {
      set({
        workspacePath,
        workspaceIdentity: normalizedWorkspaceIdentity,
        provider,
        loading: false,
        error: "subagentsService is required",
        loadedWorkspacePath: workspacePath,
        loadedWorkspaceIdentity: normalizedWorkspaceIdentity,
        loadedProvider: provider,
      });
      return;
    }
    const serviceAuthorityId = getServiceAuthorityId(subagentsService);
    const hasCachedAgents =
      currentState.agents.length > 0 &&
      loadedSubagentsServiceAuthorityId === serviceAuthorityId &&
      currentState.loadedWorkspacePath === workspacePath &&
      currentState.loadedWorkspaceIdentity === normalizedWorkspaceIdentity &&
      currentState.loadedProvider === provider;
    set({
      workspacePath,
      workspaceIdentity: normalizedWorkspaceIdentity,
      provider,
      agents: hasCachedAgents ? currentState.agents : [],
      capability: hasCachedAgents ? currentState.capability : null,
      loading: !hasCachedAgents,
      error: null,
    });
    const requestId = nextAgentLoadRequestId();
    try {
      const result = await loadAgentsOnce(
        workspacePath,
        provider,
        subagentsService,
        normalizedWorkspaceIdentity ?? undefined,
      );
      if (!isLatestAgentLoadRequest(requestId)) {
        return;
      }
      loadedSubagentsServiceAuthorityId = serviceAuthorityId;
      set({
        agents: result.agents,
        capability: result.capability,
        loading: false,
        loadedWorkspacePath: workspacePath,
        loadedWorkspaceIdentity: normalizedWorkspaceIdentity,
        loadedProvider: provider,
      });
    } catch (error) {
      if (!isLatestAgentLoadRequest(requestId)) {
        return;
      }
      logger.error("[subagents] initialize failed", {
        workspacePath,
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        loadedWorkspacePath: workspacePath,
        loadedWorkspaceIdentity: normalizedWorkspaceIdentity,
        loadedProvider: provider,
      });
    }
  },
  async refresh(subagentsService: ISubagentsService, workspaceIdentity?: string) {
    const workspacePath = get().workspacePath;
    if (!workspacePath) {
      return;
    }
    const workspaceIdentityFromState =
      workspaceIdentity?.trim() || get().workspaceIdentity || undefined;
    const provider = normalizeAgentProviderToZCodeAgent(get().provider);
    const serviceAuthorityId = getServiceAuthorityId(subagentsService);
    const hasCachedAgents =
      get().agents.length > 0 && loadedSubagentsServiceAuthorityId === serviceAuthorityId;
    set({
      agents: hasCachedAgents ? get().agents : [],
      capability: hasCachedAgents ? get().capability : null,
      loading: !hasCachedAgents,
      error: null,
    });
    const requestId = nextAgentLoadRequestId();
    try {
      const result = await loadAgentsOnce(
        workspacePath,
        provider,
        subagentsService,
        workspaceIdentityFromState,
        { bypassCache: true },
      );
      if (!isLatestAgentLoadRequest(requestId)) {
        return;
      }
      loadedSubagentsServiceAuthorityId = serviceAuthorityId;
      set({
        agents: result.agents,
        capability: result.capability,
        loading: false,
        loadedWorkspacePath: workspacePath,
        loadedWorkspaceIdentity: workspaceIdentityFromState ?? null,
        loadedProvider: provider,
      });
    } catch (error) {
      if (!isLatestAgentLoadRequest(requestId)) {
        return;
      }
      logger.error("[subagents] refresh failed", {
        workspacePath,
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        loadedWorkspacePath: workspacePath,
        loadedWorkspaceIdentity: workspaceIdentityFromState ?? null,
        loadedProvider: provider,
      });
    }
  },
}));

export async function refreshLoadedSubagentsStoreForWorkspace(params: {
  scope?: "user" | "workspace";
  workspacePath?: string | null;
  workspaceIdentity?: string | null;
  subagentsService: ISubagentsService;
}): Promise<void> {
  const userScope = params.scope === "user";
  const workspacePath = params.workspacePath?.trim();
  if (!userScope && !workspacePath) return;
  const workspaceIdentity = params.workspaceIdentity?.trim() || null;
  const state = useSubagentsStore.getState();
  const contextStore = useSubagentsContextStore.getState();
  const refreshes: Promise<void>[] = [];
  // Bug 根因：User 保存曾按 active remote workspace 刷新，空路径又跳过本机 @ 缓存。
  // 只刷新同 authority 已有的投影；新目标加载中不能借用旧 loaded authority。
  const refreshLegacy = userScope
    ? state.workspacePath === state.loadedWorkspacePath &&
      state.workspaceIdentity === state.loadedWorkspaceIdentity &&
      loadedSubagentsServiceAuthorityId === getServiceAuthorityId(params.subagentsService)
    : state.workspacePath === workspacePath && state.workspaceIdentity === workspaceIdentity;
  if (state.workspacePath && refreshLegacy) {
    refreshes.push(state.refresh(params.subagentsService, state.workspaceIdentity ?? undefined));
  }
  for (const [key, context] of Object.entries(contextStore.contexts)) {
    if (
      !userScope &&
      (context.workspacePath !== workspacePath || context.workspaceIdentity !== workspaceIdentity)
    )
      continue;
    if (
      key !==
      getSubagentsContextKey(
        context.workspacePath,
        context.provider,
        context.workspaceIdentity,
        params.subagentsService,
      )
    )
      continue;
    refreshes.push(
      contextStore.refresh(
        context.workspacePath,
        context.provider,
        params.subagentsService,
        context.workspaceIdentity ?? undefined,
      ),
    );
  }
  await Promise.all(refreshes);
}

/**
 * 刷新某台远端设备上已打开项目的斜杠（/）建议中的子智能体缓存（子智能体推送、设置页改动远端「用户」之后）。
 *
 * Bug 根因：建议缓存按项目的服务对象分桶（useSubagents 取 useServices()），而推送和远端「用户」
 * 传入的是该设备的 source-settings 服务；refreshLoadedSubagentsStoreForWorkspace 只刷新同一服务对象
 * 的缓存，已打开远程项目的缓存全被跳过，且已有缓存时 useSubagents 不再重载，新子智能体一直不出现。
 * 修法：按每个项目的 identity 取已注册的项目服务，逐个复用上面的刷新；取不到服务就跳过，不回退到本机。
 */
export async function refreshSubagentsStoreForRemoteWorkspaces(
  workspaces: readonly { workspacePath: string; workspaceIdentity?: string | null }[],
): Promise<void> {
  await Promise.all(
    workspaces.map(async ({ workspacePath, workspaceIdentity }) => {
      const identity = workspaceIdentity?.trim();
      const services = identity ? getRemoteWorkspaceServicesForIdentity(identity) : null;
      if (!services?.subagentsService) return;
      await refreshLoadedSubagentsStoreForWorkspace({
        scope: "workspace",
        workspacePath,
        workspaceIdentity: identity,
        subagentsService: services.subagentsService,
      });
    }),
  );
}
