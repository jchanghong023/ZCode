// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import {
  isFormalSelection,
  AIREQ_CONTRACT_VERSION,
  type AIReqDataSource,
  type AIReqIdentity,
  type AIReqRemoteBootstrap,
  type AIReqRemoteWorkflow,
  type AIReqRemotePath,
  type AIReqRemoteArgs,
  type AIReqRemoteResult,
  type AIReqSelection,
  type AIReqWorkflowView,
} from "../contract.js";
import type { IServiceAccessor } from "../contract.js";
// 读取投影随 view 释放；重建 accessor 时仍可解析屏幕上旧 view，避免卸载草稿/报告。
const snapshots = new WeakMap<
  AIReqWorkflowView,
  { key: string; reviewScopeKey: string; selection: AIReqSelection; value: AIReqRemoteWorkflow }
>();

export async function createRemoteAIReqDataSource(
  services: IServiceAccessor,
  identity: AIReqIdentity,
): Promise<AIReqDataSource> {
  const clientId = identity.clientId;
  const workflowListeners = new Set<() => void>();
  const modelListeners = new Set<() => void>();
  const schedulerListeners = new Set<() => void>();
  const skillListeners = new Set<(sessionId: string) => void>();
  // 头像只切换同一已读取评审中的会话；不把异步刷新间隙当成工作区丢失。
  const resolveSnapshot = (
    view: AIReqWorkflowView | undefined,
    target: AIReqSelection,
  ): AIReqRemoteWorkflow | undefined => {
    const snapshot = view ? snapshots.get(view) : undefined;
    if (!snapshot || !view) return undefined;
    if (snapshot.key === JSON.stringify(target)) return snapshot.value;
    if (
      snapshot.value.session?.role !== "reviewer" ||
      snapshot.reviewScopeKey !== JSON.stringify({ ...target, reviewAgent: undefined })
    )
      return undefined;
    const group = view.drafts.find(
      (item) => item.id === target.irId && item.projectId === target.projectId,
    );
    const review = [
      group?.originalReview,
      group?.review,
      ...(group?.originalReviewHistory ?? []),
      ...(group?.reviewHistory ?? []),
    ].find((item) =>
      item?.agents?.some((agent) => agent.session.sessionId === snapshot.value.session?.sessionId),
    );
    const session = review?.agents?.find(
      (agent) => agent.id === (target.reviewAgent ?? "summary"),
    )?.session;
    return session ? { ...snapshot.value, session } : undefined;
  };
  let selection: AIReqSelection = {};
  let disposed = false;
  let eventError: Error | undefined;
  let invalidationGeneration = 0;
  let initializing = true;
  let promptDraftRevision = 0;
  const emit = (listeners: Set<() => void>) => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listeners: Set<() => void>, listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const call = <P extends AIReqRemotePath>(
    path: P,
    args: AIReqRemoteArgs<P>,
    target = selection,
  ): Promise<AIReqRemoteResult<P>> => {
    if (disposed) return Promise.reject(new Error("AIReq连接已关闭"));
    return services.aiReqService.call(identity, path, args, target);
  };
  const readBootstrap = async (): Promise<AIReqRemoteBootstrap> => {
    const incoming = await services.aiReqService.bootstrap(identity);
    if (incoming.contractVersion !== AIREQ_CONTRACT_VERSION)
      throw new Error(`当前服务版本不兼容，请刷新页面或联系管理员。`);
    return incoming;
  };
  let metadata: AIReqRemoteBootstrap;
  // Project-only workspace projections come from the same server owner as workflow scopes.
  // Never turn an unavailable client fallback into an executable project identity.
  let projectWorkspaces = new Map<string, AIReqRemoteWorkflow["workspace"]>();
  const readProjectWorkspaces = async (incoming: AIReqRemoteBootstrap) => {
    const entries = await Promise.all(
      Object.keys(incoming.projects.developmentRoots).map(async (projectId) => {
        const target = { projectId };
        const result = await call("readWorkflow", [target], target);
        return [projectId, result.workspace] as const;
      }),
    );
    return new Map(entries);
  };
  let promptDraft: AIReqRemoteBootstrap["prompts"]["draft"];
  let refreshFlight: Promise<void> | undefined;
  const refreshMetadata = (): Promise<void> => {
    if (refreshFlight) return refreshFlight;
    refreshFlight = (async () => {
      try {
        for (;;) {
          const generation = invalidationGeneration;
          const incoming = await readBootstrap();
          const incomingWorkspaces = await readProjectWorkspaces(incoming);
          if (disposed) throw new Error("AIReq连接已关闭");
          if (generation !== invalidationGeneration) continue;
          if (JSON.stringify(promptDraft) === JSON.stringify(metadata.prompts.saved))
            promptDraft = { ...incoming.prompts.draft };
          metadata = incoming;
          projectWorkspaces = incomingWorkspaces;
          break;
        }
      } finally {
        refreshFlight = undefined;
      }
    })();
    return refreshFlight;
  };
  // 先订阅再读；初始化期间的事件只推进失效代次，不访问尚未就绪的配置。
  const subscription = services.aiReqService.onDidChange((frame) => {
    if (disposed) return;
    if (frame.type === "error") {
      eventError = new Error(frame.error.message);
      if (!initializing) emit(workflowListeners);
      return;
    }
    invalidationGeneration += 1;
    if (initializing) return;
    if (frame.type === "scheduler") emit(schedulerListeners);
    if (frame.type === "skills")
      for (const listener of skillListeners) listener(frame.sessionId ?? "");
    if (["models", "workflow", "prompts"].includes(frame.type))
      void refreshMetadata().then(
        () => {
          if (disposed) return;
          eventError = undefined;
          emit(modelListeners);
          emit(workflowListeners);
        },
        (cause) => {
          if (disposed) return;
          eventError = cause instanceof Error ? cause : new Error(String(cause));
          emit(workflowListeners);
        },
      );
  });
  try {
    for (;;) {
      const generation = invalidationGeneration;
      const incoming = await readBootstrap();
      const incomingWorkspaces = await readProjectWorkspaces(incoming);
      if (eventError) throw eventError;
      if (generation !== invalidationGeneration) continue;
      metadata = incoming;
      projectWorkspaces = incomingWorkspaces;
      selection = { ...metadata.initialSelection };
      promptDraft = { ...metadata.prompts.draft };
      initializing = false;
      break;
    }
  } catch (cause) {
    disposed = true;
    subscription.dispose();
    throw cause;
  }
  const source: AIReqDataSource = {
    clientId,
    get backend() {
      return metadata.backend;
    },
    get capabilities() {
      return metadata.capabilities;
    },
    get initialSelection() {
      return metadata.initialSelection;
    },
    async refreshIdentity() {
      await refreshMetadata();
      eventError = undefined;
      emit(modelListeners);
      emit(workflowListeners);
    },
    async readWorkflow(target) {
      if (eventError) {
        await refreshMetadata();
        eventError = undefined;
      }
      // 只读详情查询不能夺取主区默认选择；并行Tab始终使用显式目标。
      const result = await call("readWorkflow", [target], target);
      snapshots.set(result.view, {
        key: JSON.stringify(target),
        reviewScopeKey: JSON.stringify({ ...target, reviewAgent: undefined }),
        selection: { ...target },
        value: result,
      });
      return result.view;
    },
    subscribeWorkflow: (listener) => subscribe(workflowListeners, listener),
    command: async (action, target, revision) => {
      // 普通业务按钮没有显式编号；在唯一远程入口补齐一次，避免被 owner 的幂等门禁拒绝。
      const command = {
        ...action,
        operationId: action.operationId ?? createUuid(),
        expectedRevision: action.expectedRevision ?? revision,
      };
      const result = await call("command", [command, target, revision], target);
      await refreshMetadata();
      return result;
    },
    resolveSession: (view, target) =>
      isFormalSelection(view, target) ? undefined : resolveSnapshot(view, target)?.session,
    resolveWorkspace(view, target) {
      const resolved = resolveSnapshot(view, target);
      if (resolved) return resolved.workspace;
      const snapshot = view ? snapshots.get(view) : undefined;
      // 同项目正式需求切行时保留服务端已确认的只读工作区。
      // 精确匹配优先，真实不可用结果不被旧缓存覆盖；提案、自由会话及跨项目不复用。
      if (
        snapshot &&
        snapshot.selection.projectId === target.projectId &&
        isFormalSelection(view, snapshot.selection) &&
        isFormalSelection(view, target) &&
        snapshot.value.workspace.kind === "reference" &&
        snapshot.value.workspace.path
      ) {
        return snapshot.value.workspace;
      }
      if (target.projectId && !target.irId && !target.srId && !target.proposalDraftId) {
        const workspace = projectWorkspaces.get(target.projectId);
        if (workspace) return workspace;
      }
      return { identity: `aireq-remote:${clientId}`, kind: "unavailable" };
    },
    retryMaterial: (path, target) => call("retryMaterial", [path, target], target),
    retrySession: async (target) => {
      await call("retrySession", [target], target);
    },
    readPrHandoff: (target) => call("readPrHandoff", [target], target),
    selectProject(projectId) {
      selection = { projectId };
    },
    dispose() {
      disposed = true;
      subscription.dispose();
    },
    progress: {
      recordTest: async (...args) => {
        await call("progress.recordTest", args, {
          projectId: args[0],
          irId: args[1],
          srId: args[2],
        });
      },
      cleanupPreview: (...args) =>
        call("progress.cleanupPreview", args, { projectId: args[0], irId: args[1] }),
      cleanupBranches: async (...args) => {
        await call("progress.cleanupBranches", args, { projectId: args[0], irId: args[1] });
      },
    },
    planning: {
      updateSr: async (...args) => {
        await call("planning.updateSr", args, { projectId: args[0], irId: args[1], srId: args[2] });
      },
    },
    projects: {
      saveRepository: async (input) => {
        await call("projects.saveRepository", [input]);
        await refreshMetadata();
      },
      readDevelopmentRoot: (projectId) => metadata.projects.developmentRoots[projectId],
    },
    models: {
      get choices() {
        return metadata.models.choices;
      },
      read: () => metadata.models.settings,
      save: async (settings, expectedRevision) => {
        await call("models.save", [settings, expectedRevision]);
        await refreshMetadata();
        emit(modelListeners);
      },
      revision: () => metadata.models.revision,
      subscribe: (listener) => subscribe(modelListeners, listener),
      bindingChanged: (binding) => binding.configurationRevision !== metadata.models.revision,
    },
    prompts: {
      read: () => ({
        saved: metadata.prompts.saved,
        draft: promptDraft,
        revision: metadata.prompts.revision,
      }),
      updateDraft(value) {
        promptDraft = { ...value };
        promptDraftRevision += 1;
      },
      save: async (value, expectedRevision) => {
        const revision = promptDraftRevision;
        await call("prompts.save", [value, expectedRevision]);
        await refreshMetadata();
        if (revision === promptDraftRevision) promptDraft = { ...metadata.prompts.saved };
      },
    },
    skillDesign: {
      get storage() {
        if (!metadata.skillDesignStorage) throw new Error("技能存储信息暂不可用，请重试。");
        return metadata.skillDesignStorage;
      },
      session: (...args) => call("skillDesign.session", args),
      binding: (...args) => call("skillDesign.binding", args),
      workspaceIdentity: (...args) => call("skillDesign.workspaceIdentity", args),
      read: (...args) => call("skillDesign.read", args),
      saveDraft: async (...args) => {
        await call("skillDesign.saveDraft", args);
      },
      prompt: (...args) => call("skillDesign.prompt", args),
      temporaryDirectory: (...args) => call("skillDesign.temporaryDirectory", args),
      readPreview: async (...args) => (await call("skillDesign.readPreview", args)) ?? undefined,
      listSkills: (...args) => call("skillDesign.listSkills", args),
      savePreview: (...args) => call("skillDesign.savePreview", args),
      subscribe(listener) {
        skillListeners.add(listener);
        return {
          dispose() {
            skillListeners.delete(listener);
          },
        };
      },
    },
    progressScheduler: {
      read: () => call("progressScheduler.read", []),
      queryTasks: (...args) => call("progressScheduler.queryTasks", args),
      queryRuns: (...args) => call("progressScheduler.queryRuns", args),
      readRun: async (...args) => (await call("progressScheduler.readRun", args)) ?? undefined,
      subscribe: (listener) => subscribe(schedulerListeners, listener),
      setProjectEnabled: async (...args) => {
        await call("progressScheduler.setProjectEnabled", args);
      },
      configure: async (...args) => {
        await call("progressScheduler.configure", args);
      },
      runNow: async (...args) => {
        await call("progressScheduler.runNow", args);
      },
      dispose() {
        schedulerListeners.clear();
      },
    },
  };
  return source;
}
