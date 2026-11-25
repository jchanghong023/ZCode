import { AsyncLocalStorage } from "node:async_hooks";
import { AIReqPresence } from "./presence.js";
import { digestValue } from "./content-digest.js";
import { businessRule } from "./errors.js";
import { Emitter } from "@zcode/rpc";
import { IZCodeAgentService, type ServiceCollection } from "@zcode/services";
import { createServiceLogger } from "@zcode/services/logger";
import {
  IAIReqService as AIReqDescriptor,
  AIREQ_CONTRACT_VERSION,
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
  type AIReqObjectRef,
} from "@zcode/services/aireq";
import { AIReqNativeBusiness } from "./native-business.js";
import { withAIReqIdentity, validateAIReqIdentity, currentIdentity } from "./identity.js";
import { PROTOTYPE_BACKEND } from "./backend.js";
import {
  getPrototypeWorkflow,
  readPrototypeRequirementDetails,
  readPrototypeCatalogue,
  type PrototypeCatalogue,
  retryPrototypeWorkflowMaterial,
  readPrototypeProjectWorkspace,
  readPrototypeProjectWorkspaces,
  readPrototypeWorkflowRevision,
  validatePrototypeDocumentVersion,
  applyPrototypeAction,
  resolvePrototypeSession,
  prototypeWorkflowChanges,
  settlePrototypeDocumentReview,
  notifyPrototypeProjectSettingsChanged,
  capturePrototypeProjectDocuments,
  capturePrototypeRequirementList,
} from "./workflow.js";
import * as models from "./agent-models.js";
import * as prompts from "./personalization.js";
import * as skills from "./skill-design.js";
import { savePrototypeRepository } from "./project-settings.js";
import { retryPrototypeSessionRead } from "./recovery.js";
import { validateAIReqRemoteCall } from "./validation.js";
import { modelCatalogOverrides } from "./model-catalog.js";
import { createProposalTablePreferencesStore } from "./proposal-table-preferences.js";
import {
  createMockRequirementListTransfer,
  type RequirementListTransfer,
} from "./requirement-list-transfer.js";
import {
  simulateDocumentReview,
  type AIReqNativeReviewWork,
  type DocumentReviewRun,
} from "./document-review.js";

const logger = createServiceLogger("aireq");
const remoteOwners = new WeakMap<IAIReqService, MockAIReqService>();
const commands = [
  "addProjectRoleMember",
  "removeProjectRoleMember",
  "saveDocumentFormats",
  "reviewDocuments",
  "confirmDocumentVersion",
] as const;

interface CataloguePage {
  catalogue?: PrototypeCatalogue;
  pending?: Promise<PrototypeCatalogue>;
}

const RECONNECT_GRACE_MS = 30 * 60_000;

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
  private readonly currentPage = new AsyncLocalStorage<CataloguePage>();
  private readonly defaultPage: CataloguePage = {};
  private readonly pages = new Map<
    string,
    {
      page: CataloguePage;
      connections: number;
      cleanup?: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly methods = new Map<string, (...args: unknown[]) => unknown>();
  constructor(
    workspacePath: string,
    requirementTransfer: RequirementListTransfer = createMockRequirementListTransfer(),
  ) {
    super();
    const proposalTablePreferences = createProposalTablePreferencesStore(workspacePath);
    const syncing = new WeakMap<CataloguePage, ReturnType<RequirementListTransfer["publish"]>>();
    remoteOwners.set(this.remote, this);
    prototypeWorkflowChanges.event(() => this.changed.fire({ type: "workflow" }));
    models.subscribePrototypeAgentModels(() => this.changed.fire({ type: "models" }));
    skills.onPrototypeSkillDesignSupplement((sessionId) =>
      this.changed.fire({ type: "skills", sessionId }),
    );
    const add = (path: string, fn: (...args: never[]) => unknown) =>
      this.methods.set(path, (...args) => Reflect.apply(fn, undefined, args));
    add("readPresence", () => this.presence.read());
    add("readRequirementDetails", async (target: AIReqObjectRef) =>
      readPrototypeRequirementDetails(target, await this.catalogueForPage()),
    );
    add("proposals.syncToRedZone", () => {
      const page = this.currentPage.getStore() ?? this.defaultPage;
      const pending = syncing.get(page);
      if (pending) return pending;
      const sync = this.catalogueForPage()
        .then((catalogue) =>
          requirementTransfer.publish(capturePrototypeRequirementList(catalogue)),
        )
        .finally(() => {
          syncing.delete(page);
        });
      syncing.set(page, sync);
      return sync;
    });
    add("proposalTable.readPreferences", proposalTablePreferences.read);
    add("proposalTable.savePreferences", proposalTablePreferences.save);
    add("readWorkflow", async (target: AIReqWorkflowTarget) =>
      this.workflow(target, await this.catalogueForPage()),
    );
    add("projects.refreshSnapshot", async (target: AIReqWorkflowTarget) =>
      this.workflow(target, await this.catalogueForPage(true)),
    );
    add("validateDocumentVersion", validatePrototypeDocumentVersion);
    add("command", (action: AIReqCommand, target: AIReqCommandTarget, revision: number) =>
      this.command(action, target, revision),
    );
    add("retryMaterial", retryPrototypeWorkflowMaterial);
    add("retrySession", (selection: AIReqWorkflowTarget, sessionId: string) => {
      const session = this.workflow(selection).session;
      if (session?.sessionId !== sessionId) throw businessRule("会话已切换或不存在。");
      retryPrototypeSessionRead(sessionId);
    });
    add("projects.saveRepository", async (input: Parameters<typeof savePrototypeRepository>[0]) => {
      if (await savePrototypeRepository(input, capturePrototypeProjectDocuments)) {
        notifyPrototypeProjectSettingsChanged();
      }
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
  private reviewRuntime?: (work: AIReqNativeReviewWork) => void;
  bindReviewRuntime(enqueue: (work: AIReqNativeReviewWork) => void): void {
    if (this.reviewRuntime) throw new Error("评审原生运行时已装配。");
    this.reviewRuntime = enqueue;
  }
  private enqueueDocumentReview(run: DocumentReviewRun, identity: AIReqIdentity): void {
    const { path, identity: workspaceIdentity } = readPrototypeProjectWorkspace(run.projectId);
    const settle: AIReqNativeReviewWork["settle"] = (status, report) => {
      const stale = settlePrototypeDocumentReview(run, status, report);
      return stale ? report + "\n\n对应修改前的文件内容。" : report;
    };
    try {
      if (!this.reviewRuntime || !path) throw new Error("评审运行时不可用。");
      this.reviewRuntime({
        sessionId: run.sessionId,
        workspace: { workspacePath: path, workspaceIdentity },
        id: run.id,
        clientId: identity.clientId,
        title: run.title,
        version: run.version,
        prompt: run.prompt,
        additionalInstructions: run.promptSnapshot,
        model: run.model,
        execute: () =>
          withAIReqIdentity(identity, () => {
            this.assertNativeWritable(run.sessionId);
            return simulateDocumentReview(run);
          }),
        settle,
      });
    } catch (error) {
      logger.warn(undefined, "Document review admission to native runtime failed", {
        reviewId: run.id,
        error,
      });
      settle("failed", `${run.title}未能开始，请重新发起。`);
    }
  }
  bindCataloguePage(
    identity: AIReqIdentity,
    pageId?: string,
    onClose?: (listener: () => void) => unknown,
  ): CataloguePage {
    if (!pageId || !onClose) return {};
    const key = JSON.stringify([identity.employeeId, identity.clientId, pageId]);
    const entry = this.pages.get(key) ?? { page: {}, connections: 0 };
    this.pages.set(key, entry);
    clearTimeout(entry.cleanup);
    entry.connections++;
    onClose(() => {
      if (--entry.connections === 0) {
        entry.cleanup = setTimeout(() => this.pages.delete(key), RECONNECT_GRACE_MS);
        entry.cleanup.unref();
      }
    });
    return entry.page;
  }

  private catalogueForPage(
    refresh = false,
    page = this.currentPage.getStore() ?? this.defaultPage,
  ): Promise<PrototypeCatalogue> {
    if (!refresh && page.catalogue) return Promise.resolve(page.catalogue);
    page.pending ??= readPrototypeCatalogue()
      .then((catalogue) => {
        if (refresh && catalogue.failures.length)
          throw businessRule("部分云龙项目读取失败，请重试刷新项目。");
        page.catalogue = catalogue;
        return catalogue;
      })
      .finally(() => {
        page.pending = undefined;
      });
    return page.pending;
  }

  private workflow(selection: AIReqWorkflowTarget, catalogue?: PrototypeCatalogue) {
    if (
      selection.projectId &&
      catalogue?.failures.includes(selection.projectId) &&
      !catalogue.details.has(selection.projectId)
    )
      throw businessRule("当前项目的云龙需求暂未读取，请刷新项目后重试。");
    const view = getPrototypeWorkflow(selection, catalogue);
    return {
      view,
      session: resolvePrototypeSession(view, selection),
      workspace: readPrototypeProjectWorkspace(selection.projectId, catalogue),
    };
  }
  private command(action: AIReqCommand, selection: AIReqCommandTarget, revision: number) {
    if (!(commands as readonly string[]).includes(action.type))
      throw businessRule("此操作不可用，请刷新页面后重试。");
    if (!action.operationId.trim()) throw businessRule("操作参数无效，请刷新页面后重试。");
    const identity = currentIdentity()!;
    const key = `${identity.employeeId}:${identity.clientId}:${action.operationId}`;
    // 预期版本只约束首次接纳；重读后的同一业务请求先返原回执，避免丢失 ACK 后重复创建。
    const usesWorkflowRevision =
      action.type !== "confirmDocumentVersion" && action.type !== "reviewDocuments";
    const digest = digestValue([
      action,
      !usesWorkflowRevision || action.type === "saveDocumentFormats" ? undefined : selection,
    ]);
    const prior = this.operations.get(key);
    if (prior) {
      if (prior.digest !== digest) throw businessRule("操作编号已被其他请求使用，请重新操作。");
      return prior.result;
    }
    if (usesWorkflowRevision && revision !== readPrototypeWorkflowRevision())
      throw businessRule("需求版本已变化，请重新读取当前版本。");
    const { result, review } = applyPrototypeAction(action, selection);
    this.operations.set(key, { digest, result: structuredClone(result) });
    if (review) this.enqueueDocumentReview(review, identity);
    return result;
  }
  async bootstrap(identity: AIReqIdentity, page = this.defaultPage): Promise<AIReqRemoteBootstrap> {
    return withAIReqIdentity(identity, async () => {
      const catalogue = await this.catalogueForPage(false, page);
      return {
        contractVersion: AIREQ_CONTRACT_VERSION,
        backend: { id: PROTOTYPE_BACKEND.id },
        capabilities: {
          workflowCommands: [...commands],
        },
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
        projects: { workspaces: readPrototypeProjectWorkspaces(catalogue) },
        skillDesignStorage: {
          workspacePath: PROTOTYPE_BACKEND.configDirectory,
          sharedSkillsDirectory: PROTOTYPE_BACKEND.userSkillsDirectory,
        },
      };
    });
  }
  async call<P extends AIReqRemotePath>(
    identity: AIReqIdentity,
    path: P,
    args: AIReqRemoteArgs<P>,
    page = this.defaultPage,
  ): Promise<AIReqRemoteResult<P>> {
    return withAIReqIdentity(identity, () =>
      this.currentPage.run(page, async () => {
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
                    name: undefined,
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
      }),
    );
  }
}

/** Fixed identity facade around the existing native service, before its connection-scope wrapper. */
export function getConnectionServices(
  services: ServiceCollection,
  identity: AIReqIdentity,
  pageId?: string,
  onClose?: (listener: () => void) => unknown,
): Map<string, unknown> {
  const fixed = Object.freeze(validateAIReqIdentity(identity));
  const native = services.get(IZCodeAgentService);
  const business = remoteOwners.get(services.get(AIReqDescriptor));
  if (!business) throw new Error("AIReq共享业务owner尚未装配。");
  const page = business.bindCataloguePage(fixed, pageId, onClose);
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
    bootstrap: (value) => business.bootstrap(connectionIdentity(value), page),
    call: (value, path, args, ...extra: unknown[]) => {
      if (extra.length !== 0) {
        throw Object.assign(new Error("业务调用只接收身份、操作路径和参数。"), {
          code: "INVALID_ARGUMENT",
          publicMessage: true,
        });
      }
      return business.call(connectionIdentity(value), path, args, page);
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
