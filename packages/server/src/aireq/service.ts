import { AIReqPresence } from "./presence.js";
import { digestValue } from "./content-digest.js";
import { businessRule } from "./errors.js";
import { Emitter } from "@zcode/rpc";
import { IZCodeAgentService, type ServiceCollection } from "@zcode/services";
import { createServiceLogger } from "@zcode/services/logger";
import {
  IAIReqService as AIReqDescriptor,
  AIREQ_CONTRACT_VERSION,
  proposalDeliveryCurrent,
  type AIReqIdentity,
  type IAIReqService,
  type AIReqRemoteBootstrap,
  type AIReqRemoteEvent,
  type AIReqRemotePath,
  type AIReqRemoteArgs,
  type AIReqRemoteResult,
  type AIReqWorkflowTarget,
  type AIReqCommand,
  type AIReqCommandTarget,
  type AIReqWorkflowResult,
} from "@zcode/services/aireq";
import { AIReqNativeBusiness } from "./native-business.js";
import { withAIReqIdentity, validateAIReqIdentity, currentIdentity } from "./identity.js";
import { PROTOTYPE_BACKEND } from "./backend.js";
import {
  DEFAULT_SELECTION,
  getPrototypeWorkflow,
  getPrototypeProposalPrHandoff,
  retryPrototypeWorkflowMaterial,
  readPrototypeProjectWorkspace,
  readPrototypeProjectWorkspaces,
  readPrototypeWorkflowRevision,
  applyPrototypeAction,
  resolvePrototypeSession,
  prototypeWorkflowChanges,
  pollPrototypeProposalMerges,
  notifyPrototypeProjectSettingsChanged,
} from "./workflow.js";
import * as models from "./agent-models.js";
import * as prompts from "./personalization.js";
import * as skills from "./skill-design.js";
import { savePrototypeRepository } from "./project-settings.js";
import { retryPrototypeSessionRead } from "./recovery.js";
import { validateAIReqRemoteCall } from "./validation.js";
import { modelCatalogOverrides } from "./model-catalog.js";

const logger = createServiceLogger("aireq");
const remoteOwners = new WeakMap<IAIReqService, MockAIReqService>();
const commands = [
  "addProjectRoleMember",
  "removeProjectRoleMember",
  "createIdea",
  "importIdeas",
  "updateIdea",
  "transferIdea",
  "saveDocumentFormats",
  "createRelease",
  "createProposal",
  "importProposals",
  "runFullReview",
  "confirmAlignment",
  "closeProposalPr",
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
    call: (identity, path, args) => this.call(identity, path, args),
    onDidChange: this.onDidChange,
  };
  private readonly pendingOperations = new Map<
    string,
    { digest: string; result?: Promise<unknown> }
  >();
  private readonly operations = new Map<string, { digest: string; result: AIReqWorkflowResult }>();
  private readonly methods = new Map<string, (...args: unknown[]) => unknown>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor() {
    super();
    remoteOwners.set(this.remote, this);
    prototypeWorkflowChanges.event(() => this.changed.fire({ type: "workflow" }));
    models.subscribePrototypeAgentModels(() => this.changed.fire({ type: "models" }));
    skills.onPrototypeSkillDesignSupplement((sessionId) =>
      this.changed.fire({ type: "skills", sessionId }),
    );
    this.timer = setInterval(pollPrototypeProposalMerges, 5000);
    this.timer.unref();
    const add = (path: string, fn: (...args: never[]) => unknown) =>
      this.methods.set(path, (...args) => Reflect.apply(fn, undefined, args));
    add("readPresence", () => this.presence.read());
    add("readWorkflow", (target: AIReqWorkflowTarget) => this.workflow(target));
    add("command", (action: AIReqCommand, target: AIReqCommandTarget, revision: number) =>
      this.command(action, target, revision),
    );
    add("readPrHandoff", getPrototypeProposalPrHandoff);
    add("retryMaterial", retryPrototypeWorkflowMaterial);
    add("retrySession", (selection: AIReqWorkflowTarget, sessionId: string) => {
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
    add("skillDesign.session", skills.prototypeSkillDesignSession);
    add("skillDesign.read", skills.readPrototypeSkillDesign);
    add("skillDesign.saveDraft", skills.savePrototypeSkillDesignDraft);
    add("skillDesign.prompt", skills.preparePrototypeSkillDesignPrompt);
    add("skillDesign.readPreview", skills.readPrototypeSkillDesignPreview);
    add("skillDesign.listSkills", skills.listPrototypeSkillDesignPaths);
    add("skillDesign.savePreview", skills.savePrototypeSkillDesignPreview);
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
  private workflow(selection: AIReqWorkflowTarget) {
    const view = getPrototypeWorkflow(selection);
    const proposal = view.requirements.find(
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
        proposal?.merge ||
        selection.srId ||
        intake
          ? undefined
          : resolvePrototypeSession(view, selection),
      workspace: readPrototypeProjectWorkspace(selection.projectId),
    };
  }
  private command(action: AIReqCommand, selection: AIReqCommandTarget, revision: number) {
    if (!(commands as readonly string[]).includes(action.type))
      throw businessRule("此操作不可用，请刷新页面后重试。");
    if (!action.operationId.trim()) throw businessRule("操作参数无效，请刷新页面后重试。");
    const identity = currentIdentity()!;
    const key = `${identity.employeeId}:${identity.clientId}:${action.operationId}`;
    // 预期版本只约束首次接纳；重读后的同一业务请求先返原回执，避免丢失 ACK 后重复创建。
    const digest = digestValue([
      action,
      action.type === "saveDocumentFormats" ? undefined : selection,
    ]);
    const prior = this.operations.get(key);
    if (prior) {
      if (prior.digest !== digest) throw businessRule("操作编号已被其他请求使用，请重新操作。");
      return prior.result;
    }
    if (revision !== readPrototypeWorkflowRevision())
      throw businessRule("需求版本已变化，请重新读取当前版本。");
    const result = applyPrototypeAction(action, selection, undefined, {
      operationId: action.operationId,
    });
    this.operations.set(key, { digest, result: structuredClone(result) });
    return result;
  }
  async bootstrap(identity: AIReqIdentity): Promise<AIReqRemoteBootstrap> {
    const initialProjectId = DEFAULT_SELECTION.projectId;
    return withAIReqIdentity(identity, () => ({
      contractVersion: AIREQ_CONTRACT_VERSION,
      backend: { id: PROTOTYPE_BACKEND.id },
      capabilities: {
        proposalDiscussion: true,
        workflowCommands: [...commands],
        requirementManagement: true,
      },
      ...(initialProjectId === undefined ? {} : { initialProjectId }),
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
      projects: { workspaces: readPrototypeProjectWorkspaces() },
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
  ): Promise<AIReqRemoteResult<P>> {
    return withAIReqIdentity(identity, async () => {
      validateAIReqRemoteCall(path, args);
      if (path.startsWith("skillDesign.") && path !== "skillDesign.session")
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
        path === "skillDesign.savePreview"
      ) {
        const actor = currentIdentity()!;
        logger.info(undefined, "Business operation succeeded", {
          employeeId: actor.employeeId,
          clientId: actor.clientId,
          path,
          at: new Date().toISOString(),
        });
      }
      return structuredClone(result ?? null) as AIReqRemoteResult<P>;
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
          if (key === "getSkillReferenceCatalog") {
            return target
              .getSkillReferenceCatalog(
                request as Parameters<typeof target.getSkillReferenceCatalog>[0],
              )
              .then(({ skills }) => ({ skills }));
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
    call: (value, path, args, ...extra: unknown[]) => {
      if (extra.length !== 0) {
        throw Object.assign(new Error("业务调用只接收身份、操作路径和参数。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      return business.call(connectionIdentity(value), path, args);
    },
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
