// HTTP IP 页面没有原生 randomUUID；复用 shared UUID，保留操作 ID 的分配与重试时点。
import { createUuid } from "@zcode/shared";
import {
  isFormalSelection,
  AIREQ_CONTRACT_VERSION,
  type AIReqDataSource,
  type AIReqPresenceSnapshot,
  type AIReqIdentity,
  type AIReqRemoteBootstrap,
  type AIReqRemoteWorkflow,
  type AIReqRemotePath,
  type AIReqRemoteArgs,
  type AIReqRemoteResult,
  type AIReqWorkflowTarget,
  type AIReqWorkflowView,
} from "../contract.js";
import type { IServiceAccessor } from "../contract.js";
// 读取投影随 view 释放；重建 accessor 时仍可解析屏幕上旧 view，避免卸载草稿/报告。
const snapshots = new WeakMap<
  AIReqWorkflowView,
  { key: string; reviewScopeKey: string; value: AIReqRemoteWorkflow }
>();

export async function createRemoteAIReqDataSource(
  services: IServiceAccessor,
  identity: AIReqIdentity,
): Promise<AIReqDataSource> {
  const clientId = identity.clientId;
  const presenceListeners = new Set<(snapshot: AIReqPresenceSnapshot) => void>();
  const workflowListeners = new Set<() => void>();
  const modelListeners = new Set<() => void>();
  const skillListeners = new Set<(sessionId: string) => void>();
  // 头像只切换同一已读取评审中的会话；不把异步刷新间隙当成工作区丢失。
  const resolveSnapshot = (
    view: AIReqWorkflowView | undefined,
    target: AIReqWorkflowTarget,
  ): AIReqRemoteWorkflow | undefined => {
    const snapshot = view ? snapshots.get(view) : undefined;
    if (!snapshot || !view) return undefined;
    if (snapshot.key === JSON.stringify(target)) return snapshot.value;
    if (
      snapshot.value.session?.role !== "reviewer" ||
      snapshot.reviewScopeKey !== JSON.stringify({ ...target, reviewAgent: undefined })
    )
      return undefined;
    const group = view.requirements.find(
      (item) => !item.archive && item.id === target.irId && item.projectId === target.projectId,
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
  let disposed = false;
  let metadataRefreshError: Error | undefined;
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
  ): Promise<AIReqRemoteResult<P>> => {
    if (disposed) return Promise.reject(new Error("AIReq连接已关闭"));
    return services.aiReqService.call(identity, path, args);
  };
  const readBootstrap = async (): Promise<AIReqRemoteBootstrap> => {
    const incoming = await services.aiReqService.bootstrap(identity);
    if (incoming.contractVersion !== AIREQ_CONTRACT_VERSION)
      throw new Error(`当前服务版本不兼容，请刷新页面或联系管理员。`);
    return incoming;
  };
  let metadata: AIReqRemoteBootstrap;
  const projectWorkspace = (projectId: string) =>
    Object.hasOwn(metadata.projects.workspaces, projectId)
      ? metadata.projects.workspaces[projectId]
      : undefined;
  let promptDraft: AIReqRemoteBootstrap["prompts"]["saved"];
  let refreshFlight: Promise<void> | undefined;
  const refreshMetadata = (): Promise<void> => {
    if (refreshFlight) return refreshFlight;
    refreshFlight = (async () => {
      try {
        for (;;) {
          const generation = invalidationGeneration;
          const incoming = await readBootstrap();
          if (disposed) throw new Error("AIReq连接已关闭");
          if (generation !== invalidationGeneration) continue;
          if (JSON.stringify(promptDraft) === JSON.stringify(metadata.prompts.saved))
            promptDraft = { ...incoming.prompts.saved };
          metadata = incoming;
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
    if (frame.type === "presence") {
      for (const listener of presenceListeners) listener(frame.snapshot);
      return;
    }
    invalidationGeneration += 1;
    if (initializing) return;
    if (frame.type === "skills")
      for (const listener of skillListeners) listener(frame.sessionId ?? "");
    if (["models", "workflow", "prompts"].includes(frame.type))
      void refreshMetadata().then(
        () => {
          if (disposed) return;
          metadataRefreshError = undefined;
          emit(modelListeners);
          emit(workflowListeners);
        },
        (cause) => {
          if (disposed) return;
          metadataRefreshError = cause instanceof Error ? cause : new Error(String(cause));
          emit(workflowListeners);
        },
      );
  });
  try {
    for (;;) {
      const generation = invalidationGeneration;
      const incoming = await readBootstrap();
      if (generation !== invalidationGeneration) continue;
      metadata = incoming;
      promptDraft = { ...metadata.prompts.saved };
      initializing = false;
      break;
    }
  } catch (cause) {
    disposed = true;
    subscription.dispose();
    throw cause;
  }
  const source: AIReqDataSource = {
    presence: {
      read: () => call("readPresence", []),
      subscribe(listener) {
        presenceListeners.add(listener);
        return () => {
          presenceListeners.delete(listener);
        };
      },
    },
    clientId,
    get backend() {
      return metadata.backend;
    },
    get capabilities() {
      return metadata.capabilities;
    },
    get initialProjectId() {
      return metadata.initialProjectId;
    },
    async refreshIdentity() {
      await refreshMetadata();
      metadataRefreshError = undefined;
      emit(modelListeners);
      emit(workflowListeners);
    },
    async readWorkflow(target) {
      if (metadataRefreshError) {
        await refreshMetadata();
        metadataRefreshError = undefined;
      }
      const result = await call("readWorkflow", [target]);
      snapshots.set(result.view, {
        key: JSON.stringify(target),
        reviewScopeKey: JSON.stringify({ ...target, reviewAgent: undefined }),
        value: result,
      });
      return result.view;
    },
    subscribeWorkflow: (listener) => subscribe(workflowListeners, listener),
    command: async (action, target, revision) => {
      // 表单可能开始于更早的视图；只把它当成 CAS 基线，不让后台重读悄悄升级。
      const { operationId, expectedRevision, ...intent } = action;
      const { projectId, irId, srId } = target;
      const result = await call("command", [
        { ...intent, operationId: operationId ?? createUuid() },
        {
          ...(projectId !== undefined ? { projectId } : {}),
          ...(irId !== undefined ? { irId } : {}),
          ...(srId !== undefined ? { srId } : {}),
        },
        expectedRevision ?? revision,
      ]);
      await refreshMetadata();
      return result;
    },
    resolveSession: (view, target) =>
      isFormalSelection(view, target) ? undefined : resolveSnapshot(view, target)?.session,
    resolveWorkspace(view, target) {
      const resolved = resolveSnapshot(view, target);
      if (resolved) return resolved.workspace;
      if (target.projectId && !target.irId && !target.srId) {
        const workspace = projectWorkspace(target.projectId);
        if (workspace) return workspace;
      }
      return { identity: `aireq-remote:${clientId}`, kind: "unavailable" };
    },
    retryMaterial: (request) => call("retryMaterial", [request]),
    retrySession: async (target, sessionId) => {
      await call("retrySession", [target, sessionId]);
    },
    dispose() {
      presenceListeners.clear();
      disposed = true;
      subscription.dispose();
    },
    projects: {
      saveRepository: async (input) => {
        await call("projects.saveRepository", [input]);
        await refreshMetadata();
      },
      readDevelopmentRoot: (projectId) => {
        const workspace = projectWorkspace(projectId);
        return workspace?.kind === "unavailable" ? undefined : workspace?.path;
      },
    },
    models: {
      get choices() {
        return metadata.models.choices;
      },
      read: () => metadata.models.settings,
      save: async (settings, expectedRevision) => {
        const { defaultModel, agents } = settings;
        await call("models.save", [
          {
            defaultModel,
            agents: agents.map(({ id, model, reasoning }) => ({ id, model, reasoning })),
          },
          expectedRevision,
        ]);
        await refreshMetadata();
        emit(modelListeners);
      },
      revision: () => metadata.models.revision,
      subscribe: (listener) => subscribe(modelListeners, listener),
      bindingChanged(binding) {
        const settings = metadata.models.settings;
        const agent = settings.agents.find((item) => item.id === binding.role);
        if (!agent) return false;
        const inherited = agent.model === "inherit";
        return (
          binding.inherited !== inherited ||
          binding.modelKey !== (inherited ? settings.defaultModel : agent.model) ||
          binding.reasoning !== agent.reasoning ||
          binding.promptSnapshot !== (metadata.prompts.saved[binding.role] ?? "")
        );
      },
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
      read: (...args) => call("skillDesign.read", args),
      saveDraft: async (...args) => {
        await call("skillDesign.saveDraft", args);
      },
      prompt: (...args) => call("skillDesign.prompt", args),
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
  };
  return source;
}
