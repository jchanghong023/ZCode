import { AIReqPresence } from "./presence.js";
import { digestValue } from "./content-digest.js";
import { businessRule, publicBusinessProjection } from "./errors.js";
import { Emitter } from "@zcode/rpc";
import { IZCodeAgentService, type ServiceCollection } from "@zcode/services";
import { createServiceLogger } from "@zcode/services/logger";
import {
  IAIReqService as AIReqDescriptor,
  AIREQ_CONTRACT_VERSION,
  proposalDeliveryCurrent,
  projectProgress,
  type AIReqIdentity,
  type IAIReqService,
  type AIReqRemoteBootstrap,
  type AIReqRemoteEvent,
  type AIReqRemotePath,
  type AIReqRemoteArgs,
  type AIReqRemoteResult,
  type AIReqSelection,
  type AIReqAction,
} from "@zcode/services/aireq";
import { AIReqNativeBusiness } from "./native-business.js";
import { withAIReqIdentity, validateAIReqIdentity, currentIdentity } from "./identity.js";
import { PROTOTYPE_BACKEND } from "./backend.js";
import {
  DEFAULT_SELECTION,
  getPrototypeWorkflow,
  retryPrototypeWorkflowMaterial,
  readPrototypeProjectWorkspace,
  readPrototypeProjectProgressInputs,
  applyPrototypeAction,
  resolvePrototypeSession,
  prototypeWorkflowChanges,
  pollPrototypeProposalMerges,
  notifyPrototypeProjectSettingsChanged,
} from "./workflow.js";
import * as models from "./agent-models.js";
import * as prompts from "./personalization.js";
import * as skills from "./skill-design.js";
import { readPrototypeSkills } from "./skills.js";
import { readPrototypeProjectSettings, savePrototypeRepository } from "./project-settings.js";
import {
  withPrototypeProgress,
  recordPrototypeSrTest,
  previewPrototypeBranchCleanup,
  cleanupPrototypeBranches,
  pollPrototypeDevelopment,
} from "./progress.js";
import { withPrototypePlanning, updatePrototypeSrPlanning } from "./planning.js";
import { createPrototypeProgressScheduler } from "./progress-scheduler.js";
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
import { retryPrototypeSessionRead } from "./recovery.js";
import { validateAIReqRemoteCall } from "./validation.js";
import { modelCatalogOverrides } from "./model-catalog.js";

const logger = createServiceLogger("aireq");
const remoteOwners = new WeakMap<IAIReqService, MockAIReqService>();
const commands = [
  "createIdea",
  "importIdeas",
  "updateIdea",
  "transferIdea",
  "saveDocumentFormats",
  "createRelease",
  "createProposal",
  "importProposals",
  "assignContacts",
  "runFullReview",
  "confirmAlignment",
  "closeProposalPr",
  "reviseProposalMaterial",
  "retrySrBranch",
  "deleteRequirement",
  "acceptProposal",
  "submitProposalReview",
  "runRequirementsReview",
  "returnProposal",
  "publishProposal",
] as const;

/** One instance is registered by createMockServices; connection scopes never dispose it. */
export class MockAIReqService extends AIReqNativeBusiness implements IAIReqService {
  private readonly changed = new Emitter<AIReqRemoteEvent>();
  readonly onDidChange = this.changed.event;
  readonly presence = new AIReqPresence((snapshot) =>
    this.changed.fire({ type: "presence", snapshot }),
  );
  readonly remote: IAIReqService = {
    bootstrap: (identity) => this.bootstrap(identity),
    call: (identity, path, args, selection) => this.call(identity, path, args, selection),
    onDidChange: this.onDidChange,
  };
  // 规模样例也包含真实 SR；按浏览器 URL 另建调度器会绕过同 SR 并发去重，必须启动时统一选定。
  private readonly scheduler = createPrototypeProgressScheduler({
    scaleDemo: process.env.AIREQ_DEMO === "analysis-scale",
  });
  private readonly pendingOperations = new Map<
    string,
    { digest: string; result?: Promise<unknown> }
  >();
  private readonly operations = new Map<string, { digest: string; result: unknown }>();
  private readonly methods = new Map<string, (...args: unknown[]) => unknown>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor() {
    super();
    remoteOwners.set(this.remote, this);
    prototypeWorkflowChanges.event(() => this.changed.fire({ type: "workflow" }));
    models.subscribePrototypeAgentModels(() => this.changed.fire({ type: "models" }));
    this.scheduler.subscribe(() => this.changed.fire({ type: "scheduler" }));
    skills.onPrototypeSkillDesignSupplement((sessionId) =>
      this.changed.fire({ type: "skills", sessionId }),
    );
    this.timer = setInterval(() => {
      pollPrototypeProposalMerges();
      pollPrototypeDevelopment();
      // 已接纳分析由服务生命周期继续；浏览器关闭不取消 pending 或要求重新发送。
      try {
        withAIReqIdentity(
          { employeeId: PROTOTYPE_BACKEND.owner, clientId: "mock-background" },
          () => this.scheduler.tick(),
        );
      } catch (error) {
        logger.error(undefined, "Background scheduler advancement failed", {
          error: String(error),
        });
      }
    }, 5000);
    this.timer.unref();
    const add = (path: string, fn: (...args: never[]) => unknown) =>
      this.methods.set(path, (...args) => Reflect.apply(fn, undefined, args));
    add("readPresence", () => this.presence.read());
    add("readWorkflow", (selection: AIReqSelection) => this.workflow(selection));
    add("command", (action: AIReqAction, selection: AIReqSelection, revision: number) =>
      this.command(action, selection, revision),
    );
    add("readPrHandoff", (target: { projectId: string; irId: string }) =>
      readPrototypeProposalPrHandoff(this.group(target)),
    );
    add("retryMaterial", retryPrototypeWorkflowMaterial);
    add("retrySession", (selection: AIReqSelection, sessionId: string) => {
      const session = this.workflow(selection).session;
      if (session?.sessionId !== sessionId) throw businessRule("会话已切换或不存在。");
      retryPrototypeSessionRead(sessionId);
    });
    add("projects.saveRepository", (input: Parameters<typeof savePrototypeRepository>[0]) => {
      if (savePrototypeRepository(input)) notifyPrototypeProjectSettingsChanged();
    });
    // 配置读取统一经 bootstrap；仅保留保存 RPC，内部读取／绑定比较仍服务原生业务。
    add("models.save", models.savePrototypeAgentModels);
    add("prompts.save", (value: prompts.PrototypeAgentPrompts, revision: number) => {
      prompts.savePrototypeAgentPrompts(value, revision);
      this.changed.fire({ type: "prompts" });
    });
    add("progress.recordTest", recordPrototypeSrTest);
    add("progress.cleanupPreview", previewPrototypeBranchCleanup);
    add("progress.cleanupBranches", cleanupPrototypeBranches);
    add("planning.updateSr", updatePrototypeSrPlanning);
    add("skillDesign.session", skills.prototypeSkillDesignSession);
    add("skillDesign.workspaceIdentity", (projectId: string) => `aireq-mock:${projectId}`);
    add("skillDesign.read", skills.readPrototypeSkillDesign);
    add("skillDesign.saveDraft", skills.savePrototypeSkillDesignDraft);
    add("skillDesign.prompt", skills.preparePrototypeSkillDesignPrompt);
    add("skillDesign.temporaryDirectory", skills.prototypeSkillDesignDirectory);
    add("skillDesign.readPreview", skills.readPrototypeSkillDesignPreview);
    add("skillDesign.listSkills", readPrototypeSkills);
    add("skillDesign.savePreview", skills.savePrototypeSkillDesignPreview);
    for (const name of [
      "read",
      "queryTasks",
      "queryRuns",
      "readRun",
      "setProjectEnabled",
      "configure",
      "runNow",
    ] as const)
      this.methods.set(`progressScheduler.${name}`, (...args) =>
        Reflect.apply(this.scheduler[name], this.scheduler, args),
      );
  }
  /** Preserve explicit business operation results across reconnect. */
  invokeOnce(
    path: string,
    operationId: string,
    payload: unknown,
    operation: () => unknown,
  ): Promise<unknown> {
    const identity = currentIdentity();
    if (!identity || !operationId.trim() || operationId.length > 200)
      throw businessRule("操作身份无效，请重新进入工作区。");
    const key = `${identity.employeeId}:${identity.clientId}:${path}:${operationId}`;
    const digest = digestValue(payload);
    const prior = this.pendingOperations.get(key);
    if (prior) {
      if (prior.digest !== digest) throw businessRule("操作编号不能复用于不同输入，请重新操作。");
      if (prior.result) return prior.result;
    }
    const result = Promise.resolve().then(operation);
    this.pendingOperations.set(key, { digest, result });
    void result.catch(() => {
      const record = this.pendingOperations.get(key);
      if (record?.result === result) record.result = undefined;
    });
    return result;
  }
  private group(input: { projectId: string; irId: string }) {
    const view = getPrototypeWorkflow(input);
    const group = [...view.drafts, ...view.groups].find(
      (item) => item.id === input.irId && item.projectId === input.projectId,
    );
    if (!group) throw businessRule("需求不存在或已删除。");
    return group;
  }
  private workflow(selection: AIReqSelection) {
    const selected = getPrototypeWorkflow(selection);
    // 全局统计一次读取并派生，再按项目分桶；不能每项目重跑含全局待办/操作的 workflow。
    const progress = withPrototypeProgress(readPrototypeProjectProgressInputs());
    const view = withPrototypePlanning({
      ...selected,
      srs: progress.srs.filter((sr) => sr.projectId === selected.currentProjectId),
    });
    const byProject = new Map<string, Parameters<typeof projectProgress>[0]>(
      view.projects.map((project) => [
        project.id,
        { groups: [], drafts: [], srs: [], releases: [] },
      ]),
    );
    for (const group of progress.groups) byProject.get(group.projectId)?.groups.push(group);
    for (const draft of progress.drafts) byProject.get(draft.projectId)?.drafts.push(draft);
    for (const sr of progress.srs) byProject.get(sr.projectId)?.srs.push(sr);
    for (const release of progress.releases)
      byProject.get(release.projectId)?.releases.push(release);
    view.projectProgress = view.projects.map((project) =>
      projectProgress(byProject.get(project.id)!, project.id),
    );
    const proposal = view.drafts.find(
      (item) => item.projectId === selection.projectId && item.id === selection.irId,
    );
    // 已确认默认视图与显式入库没有 Agent；只在主动查看历史阶段时解析原会话。
    const intake =
      selection.proposalStep === "intake" ||
      (proposal &&
        !selection.proposalStep &&
        !selection.discussionPhase &&
        (proposalDeliveryCurrent(proposal) || proposal.status === "requirements-pr"));
    return {
      view,
      session:
        selection.formalView ||
        view.groups.some((item) => item.id === selection.irId) ||
        selection.srId ||
        intake
          ? undefined
          : resolvePrototypeSession(view, selection),
      workspace: readPrototypeProjectWorkspace(selection.projectId),
    };
  }
  private command(action: AIReqAction, selection: AIReqSelection, revision: number) {
    if (!(commands as readonly string[]).includes(action.type))
      throw businessRule("此操作不可用，请刷新页面后重试。");
    const metadata = action as AIReqAction & { operationId?: string; expectedRevision?: number };
    if (typeof metadata.operationId !== "string" || !metadata.operationId.trim())
      throw businessRule("操作参数无效，请刷新页面后重试。");
    const key = metadata.operationId
      ? `${currentIdentity()?.employeeId}:${currentIdentity()?.clientId}:${metadata.operationId}`
      : undefined;
    // 预期版本只约束首次接纳；重读后的同一业务请求先返原回执，避免丢失 ACK 后重复创建。
    const digest = digestValue([
      { ...action, expectedRevision: undefined },
      action.type === "saveDocumentFormats" ? undefined : selection,
    ]);
    const prior = key ? this.operations.get(key) : undefined;
    if (prior) {
      if (prior.digest !== digest) throw businessRule("操作编号已被其他请求使用，请重新操作。");
      return structuredClone(prior.result);
    }
    const current = getPrototypeWorkflow(selection);
    if (
      revision !== current.revision ||
      (metadata.expectedRevision !== undefined && metadata.expectedRevision !== current.revision)
    )
      throw businessRule("需求版本已变化，请重新读取当前版本。");
    const result = applyPrototypeAction(action, selection, undefined, {
      operationId: metadata.operationId,
      commandDigest: digest,
    });
    if (key) this.operations.set(key, { digest, result: structuredClone(result) });
    return result;
  }
  async bootstrap(identity: AIReqIdentity): Promise<AIReqRemoteBootstrap> {
    return withAIReqIdentity(identity, () => ({
      contractVersion: AIREQ_CONTRACT_VERSION,
      backend: { id: PROTOTYPE_BACKEND.id },
      capabilities: {
        proposalDiscussion: true,
        codeDevelopment: false,
        workflowCommands: [...commands],
        requirementManagement: true,
        freeChat: false,
        nativeChat: true,
        nativeSurface: false,
      },
      initialSelection: DEFAULT_SELECTION,
      models: {
        choices: models.PROTOTYPE_AGENT_MODELS.map(({ id, name, provider }) => ({
          id,
          name,
          provider,
        })),
        settings: models.readPrototypeAgentModels(),
        revision: models.prototypeAgentModelConfigurationRevision(),
      },
      prompts: prompts.readPrototypeAgentPrompts(),
      projects: {
        developmentRoots: Object.fromEntries(
          readPrototypeProjectSettings().projects.map((project) => [project.id, project.root]),
        ),
      },
      skillDesignStorage: {
        workspacePath: PROTOTYPE_BACKEND.configDirectory,
        sharedSkillsDirectory: PROTOTYPE_BACKEND.userSkillsDirectory,
      },
    }));
  }
  async call<P extends AIReqRemotePath>(
    identity: AIReqIdentity,
    path: P,
    args: AIReqRemoteArgs<P>,
    selection?: AIReqSelection,
  ): Promise<AIReqRemoteResult<P>> {
    return withAIReqIdentity(identity, async () => {
      validateAIReqRemoteCall({ path, args, selection });
      if (
        path.startsWith("skillDesign.") &&
        ![
          "skillDesign.session",
          "skillDesign.workspaceIdentity",
          "skillDesign.listSkills",
        ].includes(path)
      )
        skills.assertSkillSession(String(args[0]));
      const method = this.methods.get(path);
      if (!method) throw businessRule("此操作不可用，请刷新页面后重试。");
      const input = args[0];
      const operationId =
        input && typeof input === "object" && "operationId" in input
          ? input.operationId
          : undefined;
      const result =
        typeof operationId === "string" && path === "projects.saveRepository"
          ? await this.invokeOnce(
              path,
              operationId,
              // 项目配置 CAS 只用于首次接纳；丢失回执后重读不能使同一次保存变成冲突。
              [
                {
                  ...(input as AIReqRemoteArgs<"projects.saveRepository">[0]),
                  expectedRevision: undefined,
                },
              ],
              () => method(...args),
            )
          : await method(...args);
      if (
        path === "projects.saveRepository" ||
        path === "models.save" ||
        path === "prompts.save" ||
        path === "skillDesign.savePreview" ||
        path === "progressScheduler.configure" ||
        path === "progressScheduler.setProjectEnabled"
      ) {
        const actor = currentIdentity()!;
        logger.info(undefined, "Business operation succeeded", {
          employeeId: actor.employeeId,
          clientId: actor.clientId,
          path,
          at: new Date().toISOString(),
        });
      }
      return publicBusinessProjection(structuredClone(result ?? null)) as AIReqRemoteResult<P>;
    });
  }
}

/** Fixed identity facade around the existing native service, before its connection-scope wrapper. */
export function getConnectionServices(
  services: ServiceCollection,
  identity: AIReqIdentity,
): Map<string, unknown> {
  const fixed = Object.freeze(validateAIReqIdentity(identity));
  const native = services.get(IZCodeAgentService);
  const business = remoteOwners.get(services.get(AIReqDescriptor));
  if (!business) throw new Error("AIReq共享业务owner尚未装配。");
  const facade = new Proxy(native, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function" || String(key).startsWith("on")) return value;
      return (...args: unknown[]) =>
        withAIReqIdentity(fixed, () => {
          const request = args[0];
          // 握手由客户端自报；原生命令还须匹配 HTTP 连接固定身份，避免换握手冒用另一 clientId。
          if (
            key === "sendConversationCommandV4" &&
            (request as { envelope?: { clientId?: string } } | undefined)?.envelope?.clientId !==
              fixed.clientId
          )
            throw businessRule("连接身份已变化，请重新进入工作区。");
          if (request && typeof request === "object") {
            const input = request as {
              sessionId?: string;
              envelope?: { sessionId?: string };
            };
            const sessionId = input.sessionId ?? input.envelope?.sessionId;
            // 业务 owner 区分私有草稿与已发布 ref；原生层继续核实 workspace 和附件采用行。
            if (sessionId) business.getNativeBinding(sessionId);
          }
          return Reflect.apply(value, target, args);
        });
    },
  });
  const overrides = modelCatalogOverrides(services);
  // 普通业务与原生会话必须属于同一连接身份，不能仅相信每次RPC正文自报的操作者。
  const connectionIdentity = (value: AIReqIdentity): AIReqIdentity => {
    const incoming = validateAIReqIdentity(value);
    if (incoming.employeeId !== fixed.employeeId || incoming.clientId !== fixed.clientId)
      throw businessRule("连接身份已变化，请重新进入工作区。");
    return fixed;
  };
  const scopedBusiness: IAIReqService = {
    bootstrap: (value) => business.bootstrap(connectionIdentity(value)),
    call: (value, path, args, selection) =>
      business.call(connectionIdentity(value), path, args, selection),
    onDidChange: business.onDidChange,
  };
  overrides.set(AIReqDescriptor.channelName, scopedBusiness);
  overrides.set(IZCodeAgentService.channelName, facade);
  return overrides;
}

/** HTTP is the only writer of observed connection identities and source IPs. */
export function registerAIReqConnection(
  services: ServiceCollection,
  identity: AIReqIdentity,
  ip: string | null,
): () => void {
  const fixed = validateAIReqIdentity(identity);
  const owner = remoteOwners.get(services.get(AIReqDescriptor));
  if (!owner) throw new Error("AIReq连接owner尚未装配。");
  return owner.presence.connect(fixed.employeeId, ip);
}
