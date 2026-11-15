import { initialSelectionForDemo } from "./fixture-builders.js";
import { Emitter } from "@zcode/rpc";
import { IZCodeAgentService, type ServiceCollection } from "@zcode/services";
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
  type AIReqSelection,
  type AIReqAction,
  type AIReqRequirementGroup,
} from "@zcode/services/aireq";
import { AIReqNativeBusiness } from "./native-business.js";
import { withAIReqIdentity, validateAIReqIdentity, currentIdentity } from "./identity.js";
import {
  PROTOTYPE_BACKEND,
  prototypeSettingsWriteAllowed,
  requirePrototypeSettingsWrite,
} from "./backend.js";
import {
  DEFAULT_SELECTION,
  getPrototypeWorkflow,
  applyPrototypeAction,
  resolvePrototypeSession,
  prototypeWorkflowChanges,
  pollPrototypeProposalMerges,
  notifyPrototypeProjectSettingsChanged,
  setPrototypeProposalMergeScenario,
} from "./workflow.js";
import * as models from "./agent-models.js";
import * as prompts from "./personalization.js";
import * as skills from "./skill-design.js";
import { readPrototypeSkills } from "./skills.js";
import { savePrototypeRepository } from "./project-settings.js";
import {
  withPrototypeProgress,
  assignPrototypeIrOwner,
  updatePrototypeSrProgress,
} from "./progress.js";
import { withPrototypePlanning, updatePrototypeSrPlanning } from "./planning.js";
import { createPrototypeProgressScheduler } from "./progress-scheduler.js";
import { createPrototypeIssues } from "./issues.js";
import { readPrototypeProposalPrHandoff } from "./proposal-pr-handoff.js";
import { retryPrototypeMaterialRead, retryPrototypeSessionRead } from "./recovery.js";
import { getPrototypePeers } from "./collaboration.js";
import { validateAIReqRemoteCall } from "./validation.js";
import { createPrototypeAutomationServices, type AutomationServices } from "./automations.js";
import { modelCatalogOverrides } from "./model-catalog.js";

const remoteOwners = new WeakMap<IAIReqService, MockAIReqService>();
const commands = [
  "createRelease",
  "createProposal",
  "deleteRequirement",
  "acceptProposal",
  "runRequirementsReview",
  "returnProposal",
  "confirmProposal",
  "publishProposal",
] as const;
const ownerPaths = new Set([
  "projects.saveRepository",
  "models.save",
  "prompts.save",
  "progressScheduler.setProjectEnabled",
  "progressScheduler.configure",
  "progressScheduler.runNow",
  "progressScheduler.advance",
  "issues.configure",
  "issues.runNow",
]);
const provenance = {
  kind: "sample" as const,
  notice: "服务端共享内存模拟；不调用真实模型、Git、文件保存或认证。服务重启恢复初始样例。",
};
const employeeDirectory = {
  kind: "sample" as const,
  entries: [
    { employeeId: "j00808874", name: "林晨", department: "平台研发部" },
    { employeeId: "j00808875", name: "陈宁", department: "平台研发部" },
    { employeeId: "j00808876", name: "陈宁", department: "芯片验证部" },
    { employeeId: "j00808877", name: "周敏", department: "芯片验证部" },
  ],
};

/** One instance is registered by createMockServices; connection scopes never dispose it. */
export class MockAIReqService extends AIReqNativeBusiness implements IAIReqService {
  private readonly changed = new Emitter<AIReqRemoteEvent>();
  readonly onDidChange = this.changed.event;
  readonly remote: IAIReqService = {
    bootstrap: (identity) => this.bootstrap(identity),
    call: (identity, path, args, selection) => this.call(identity, path, args, selection),
    onDidChange: this.onDidChange,
  };
  readonly automations: AutomationServices = createPrototypeAutomationServices((sessionId) =>
    this.resolveNativeTaskSession(sessionId),
  );
  private readonly issues = createPrototypeIssues();
  // 规模样例也包含真实 SR；按浏览器 URL 另建调度器会绕过同 SR 并发去重，必须启动时统一选定。
  private readonly scheduler = createPrototypeProgressScheduler({
    scaleDemo: process.env.AIREQ_DEMO === "analysis-scale",
  });
  private readonly pendingOperations = new Map<
    string,
    { digest: string; result?: Promise<unknown> }
  >();
  private readonly draftResults = new Map<
    string,
    { preparedSessionId?: string; result: unknown }
  >();
  private readonly operations = new Map<string, { digest: string; result: unknown }>();
  private readonly methods = new Map<string, (...args: unknown[]) => unknown>();
  private readonly timer: ReturnType<typeof setInterval>;
  private schedulerAdvancing = false;
  override getNativeBinding(sessionId: string) {
    return (
      this.automations.findAutomationSession(sessionId)?.binding ??
      this.automations.findNativeTaskActor(sessionId)?.binding ??
      super.getNativeBinding(sessionId)
    );
  }
  override seedNative(sessionId: string) {
    const history = this.automations.findAutomationSession(sessionId);
    if (history)
      return `# ${history.title}\n\n> 只读内存模拟运行历史；未执行真实模型或工具。\n\n## 当时指令\n${history.prompt}\n\n${history.reply}`;
    return this.automations.findNativeTaskActor(sessionId)?.reply ?? super.seedNative(sessionId);
  }
  override admitNative(sessionId: string, commandId: string, text: string): void {
    if (
      this.automations.findAutomationSession(sessionId) ||
      this.automations.findNativeTaskActor(sessionId)
    )
      throw new Error("自动化运行与 actor 历史会话只读。");
    super.admitNative(sessionId, commandId, text);
  }
  constructor() {
    super();
    remoteOwners.set(this.remote, this);
    prototypeWorkflowChanges.event(() => this.changed.fire({ type: "workflow" }));
    models.subscribePrototypeAgentModels(() => this.changed.fire({ type: "models" }));
    this.scheduler.subscribe(() => this.changed.fire({ type: "scheduler" }));
    this.issues.subscribe(() => this.changed.fire({ type: "issues" }));
    skills.onPrototypeSkillDesignSupplement((sessionId) =>
      this.changed.fire({ type: "skills", sessionId }),
    );
    this.timer = setInterval(() => {
      pollPrototypeProposalMerges();
      // 已接纳分析由服务生命周期继续；浏览器关闭不取消 pending 或要求重新发送。
      if (this.schedulerAdvancing) return;
      this.schedulerAdvancing = true;
      void withAIReqIdentity(
        { employeeId: PROTOTYPE_BACKEND.owner, clientId: "mock-background" },
        async () => {
          try {
            const snapshot = await this.scheduler.read();
            if (snapshot.projects.some((project) => project.runningCount > 0))
              await this.scheduler.advance();
          } finally {
            this.schedulerAdvancing = false;
          }
        },
      ).catch((error: unknown) => {
        console.error("[aireq] background scheduler advancement failed", error);
      });
    }, 5000);
    this.timer.unref();
    const add = (path: string, fn: (...args: never[]) => unknown) =>
      this.methods.set(path, (...args) => Reflect.apply(fn, undefined, args));
    add("readWorkflow", (selection: AIReqSelection) => this.workflow(selection));
    add("command", (action: AIReqAction, selection: AIReqSelection, revision: number) =>
      this.command(action, selection, revision),
    );
    add("readPrHandoff", (group: AIReqRequirementGroup) =>
      readPrototypeProposalPrHandoff(this.group(group)),
    );
    add(
      "prototype.readPrHandoff",
      (
        group: AIReqRequirementGroup,
        scenario?: Parameters<typeof readPrototypeProposalPrHandoff>[1],
      ) => readPrototypeProposalPrHandoff(this.group(group), scenario),
    );
    add("prototype.setProposalMergeScenario", setPrototypeProposalMergeScenario);
    add("retryMaterial", (path: string, selection: AIReqSelection) => {
      if (
        !getPrototypeWorkflow(selection).materials.some(
          (item) => item.irId === selection.irId && item.path === path,
        )
      )
        throw new Error("材料不属于当前对象。");
      return retryPrototypeMaterialRead(path);
    });
    add("retrySession", (selection: AIReqSelection) => {
      const session = resolvePrototypeSession(getPrototypeWorkflow(selection), selection);
      if (!session) throw new Error("会话不存在。");
      retryPrototypeSessionRead(session.sessionId);
    });
    add("projects.saveRepository", (input: Parameters<typeof savePrototypeRepository>[0]) => {
      if (savePrototypeRepository(input)) notifyPrototypeProjectSettingsChanged();
    });
    add("models.read", models.readPrototypeAgentModels);
    add("models.save", models.savePrototypeAgentModels);
    add("models.samples", models.createPrototypeAgentModelSamples);
    add("models.revision", models.prototypeAgentModelConfigurationRevision);
    add("models.bindingChanged", models.prototypeAgentModelBindingChanged);
    add("prompts.read", prompts.readPrototypeAgentPrompts);
    add("prompts.save", (value: prompts.PrototypeAgentPrompts, revision: number) => {
      prompts.savePrototypeAgentPrompts(value, revision);
      this.changed.fire({ type: "prompts" });
    });
    add("progress.assignOwner", assignPrototypeIrOwner);
    add("progress.updateSr", updatePrototypeSrProgress);
    add("planning.updateSr", updatePrototypeSrPlanning);
    add("skills.list", (input: { workspacePath: string }) => ({
      skills: readPrototypeSkills(input.workspacePath),
      diagnostics: [],
    }));
    add("skillDesign.session", skills.prototypeSkillDesignSession);
    add("skillDesign.binding", skills.prototypeSkillDesignBinding);
    add("skillDesign.workspaceIdentity", (projectId: string) => `aireq-mock:${projectId}`);
    add("skillDesign.read", skills.readPrototypeSkillDesign);
    add("skillDesign.saveDraft", skills.savePrototypeSkillDesignDraft);
    add("skillDesign.prompt", skills.preparePrototypeSkillDesignPrompt);
    add("skillDesign.temporaryDirectory", skills.prototypeSkillDesignDirectory);
    add("skillDesign.readPreview", skills.readPrototypeSkillDesignPreview);
    add("skillDesign.listSkills", readPrototypeSkills);
    add("skillDesign.savePreview", skills.savePrototypeSkillDesignPreview);
    add("collaboration.peers", getPrototypePeers);
    for (const name of ["read", "create", "configure", "runNow", "confirm", "reopen"] as const)
      this.methods.set(`issues.${name}`, (...args) =>
        Reflect.apply(this.issues[name], this.issues, args),
      );
    for (const name of [
      "read",
      "queryTasks",
      "queryRuns",
      "readRun",
      "setProjectEnabled",
      "configure",
      "runNow",
      "advance",
    ] as const)
      this.methods.set(`progressScheduler.${name}`, (...args) =>
        Reflect.apply(this.scheduler[name], this.scheduler, args),
      );
    add("nativeTasks.listRuns", this.automations.listNativeTaskRuns);
    add("nativeTasks.readOutput", this.automations.readNativeTaskOutput);
  }
  /** Native UI methods can carry an explicit operationId; preserve result across reconnect. */
  invokeOnce(
    path: string,
    operationId: string,
    payload: unknown,
    operation: () => unknown,
  ): Promise<unknown> {
    const identity = currentIdentity();
    if (!identity || !operationId.trim() || operationId.length > 200)
      throw new Error("操作身份无效。");
    const key = `${identity.employeeId}:${identity.clientId}:${path}:${operationId}`;
    const digest = JSON.stringify(payload);
    const prior = this.pendingOperations.get(key);
    if (prior) {
      if (prior.digest !== digest) throw new Error("操作编号不能复用于不同输入。");
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
  private group(input: AIReqRequirementGroup) {
    const view = getPrototypeWorkflow({ projectId: input.projectId, irId: input.id });
    const group = [...view.drafts, ...view.groups].find((item) => item.id === input.id);
    if (!group) throw new Error("NOT_FOUND: 提案不存在。");
    return group;
  }
  private workflow(selection: AIReqSelection) {
    const view = withPrototypePlanning(withPrototypeProgress(getPrototypeWorkflow(selection)));
    const project = view.projects.find((item) => item.id === selection.projectId);
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
      workspace: {
        path: project?.root,
        identity: `aireq-mock:${project?.id ?? "personal"}`,
        kind: project ? ("proposal" as const) : ("unavailable" as const),
      },
    };
  }
  private command(action: AIReqAction, selection: AIReqSelection, revision: number) {
    if (!(commands as readonly string[]).includes(action.type))
      throw new Error("INVALID_ACTION: 此业务动作已退役或仅允许原生对话完成回调。");
    if (action.type === "createRelease") requirePrototypeSettingsWrite();
    const metadata = action as AIReqAction & { operationId?: string; expectedRevision?: number };
    const proposalKey =
      action.type === "createProposal"
        ? JSON.stringify([
            currentIdentity()?.employeeId,
            currentIdentity()?.clientId,
            action.projectId ?? selection.projectId,
            action.releaseId,
            action.clientDraftId,
          ])
        : undefined;
    if (action.type === "createProposal" && action.preparedSessionId !== undefined) {
      const projectId = action.projectId ?? selection.projectId;
      const project = getPrototypeWorkflow({ projectId }).projects.find(
        (item) => item.id === projectId,
      );
      if (
        !project?.root ||
        typeof action.preparedSessionId !== "string" ||
        !action.preparedSessionId.trim()
      )
        throw new Error("预热草稿工作区无效。");
      this.assertPreparedDraft(
        action.preparedSessionId,
        { workspacePath: project.root, workspaceIdentity: `aireq-mock:${project.id}` },
        proposalKey!,
      );
    }
    const key = metadata.operationId
      ? `${currentIdentity()?.employeeId}:${metadata.operationId}`
      : undefined;
    const digest = JSON.stringify([action, selection, revision]);
    const prior = key ? this.operations.get(key) : undefined;
    if (prior) {
      if (prior.digest !== digest) throw new Error("操作编号已被不同命令使用。");
      return structuredClone(prior.result);
    }
    const draftKey =
      action.type === "createProposal" && action.clientDraftId
        ? JSON.stringify([
            currentIdentity()?.employeeId,
            currentIdentity()?.clientId,
            action.projectId ?? selection.projectId,
            action.releaseId,
            action.clientDraftId,
          ])
        : undefined;
    if (draftKey && this.draftResults.has(draftKey)) {
      const priorDraft = this.draftResults.get(draftKey)!;
      if (
        action.type === "createProposal" &&
        priorDraft.preparedSessionId !== action.preparedSessionId
      )
        throw new Error("同一草稿编号不能改绑其他原生会话。");
      return structuredClone(priorDraft.result);
    }
    const current = getPrototypeWorkflow(selection);
    // 已接纳首发按稳定草稿身份对账，不因全局 revision 的变化重复创建提案。
    const duplicate =
      action.type === "createProposal" &&
      action.clientDraftId &&
      current.drafts.find(
        (item) =>
          item.clientDraftId === action.clientDraftId &&
          item.releaseId === action.releaseId &&
          item.proposalLocation?.employeeId === currentIdentity()?.employeeId,
      );
    if (
      duplicate &&
      action.type === "createProposal" &&
      action.preparedSessionId !== undefined &&
      !duplicate.sessions.some((item) => item.sessionId === action.preparedSessionId)
    )
      throw new Error("同一草稿编号不能改绑其他原生会话。");
    if (
      !duplicate &&
      (revision !== current.revision ||
        (metadata.expectedRevision !== undefined && metadata.expectedRevision !== current.revision))
    )
      throw Object.assign(new Error("需求版本已变化，请重新读取当前版本。"), {
        code: "VERSION_CONFLICT",
      });
    if (
      action.type === "createProposal" &&
      (typeof action.clientDraftId !== "string" || !action.clientDraftId.trim())
    )
      throw new Error("首次发送必须携带稳定草稿编号。");
    const result = applyPrototypeAction(action, selection);
    if (action.type === "createProposal" && action.preparedSessionId !== undefined)
      this.bindPreparedDraft(action.preparedSessionId, proposalKey!);
    if (metadata.operationId) {
      result.operationId = metadata.operationId;
      result.receipt.operationId = metadata.operationId;
      result.receipt.commandDigest = digest;
    }
    if (key) this.operations.set(key, { digest, result: structuredClone(result) });
    if (draftKey && action.type === "createProposal")
      this.draftResults.set(draftKey, {
        preparedSessionId: action.preparedSessionId,
        result: structuredClone(result),
      });
    return result;
  }
  async bootstrap(identity: AIReqIdentity): Promise<AIReqRemoteBootstrap> {
    return withAIReqIdentity(identity, () => ({
      contractVersion: AIREQ_CONTRACT_VERSION,
      provenance,
      backend: PROTOTYPE_BACKEND,
      scenarioOperations: true,
      capabilities: {
        settingsWrite: prototypeSettingsWriteAllowed(),
        proposalDiscussion: true,
        codeDevelopment: false,
        workflowCommands: [...commands],
        requirementManagement: true,
        freeChat: false,
        nativeChat: true,
        nativeSurface: false,
      },
      serviceManifest: {
        zcodeAgentService: [
          "helloConversationV4",
          "initializeConversationV4",
          "setConnectionFlowStateV4",
          "subscribeConversationV4",
          "resyncConversationV4",
          "unsubscribeConversationV4",
          "sendConversationCommandV4",
          "queryConversationCommandsV4",
          "conversationRowsRangeV4",
          "onDynamicConversationFrame",
          "subscribeSessionsIndexV4",
          "resyncSessionsIndexV4",
          "unsubscribeSessionsIndexV4",
          "onDynamicSessionsIndexFrame",
          "subscribeWorkspaceConfigV4",
          "resyncWorkspaceConfigV4",
          "unsubscribeWorkspaceConfigV4",
          "onDynamicWorkspaceConfigFrame",
          "attachmentBeginV4",
          "attachmentChunkV4",
          "attachmentCommitV4",
          "attachmentAbortV4",
          "attachmentReadV4",
          "attachmentPreviewSourceV4",
          "conversationAttachmentReadV4",
          "conversationAttachmentStatV4",
          "listAutomations",
          "listAllAutomations",
          "createAutomation",
          "updateAutomation",
          "deleteAutomation",
          "setAutomationEnabled",
          "restartAutomation",
          "runAutomationNow",
          "listAutomationRuns",
          "deleteAutomationRun",
        ],
      },
      initialSelection: identity.demo ? initialSelectionForDemo(identity.demo) : DEFAULT_SELECTION,
      employeeDirectory,
      models: {
        choices: models.PROTOTYPE_AGENT_MODELS,
        settings: models.readPrototypeAgentModels(),
        revision: models.prototypeAgentModelConfigurationRevision(),
      },
      prompts: prompts.readPrototypeAgentPrompts(),
      projects: {
        directories: [],
        developmentRoots: Object.fromEntries(
          getPrototypeWorkflow().projects.map((project) => [project.id, project.root]),
        ),
      },
      peers: getPrototypePeers(),
      skillDesignSample: skills.PROTOTYPE_SKILL_DESIGN_SAMPLE,
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
      if (ownerPaths.has(path)) requirePrototypeSettingsWrite();
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
      if (!method) throw new Error("UNKNOWN_PATH");
      const input = args[0];
      const operationId =
        input && typeof input === "object" && "operationId" in input
          ? input.operationId
          : undefined;
      const result =
        typeof operationId === "string" && path === "projects.saveRepository"
          ? await this.invokeOnce(path, operationId, args, () => method(...args))
          : await method(...args);
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
          if (request && typeof request === "object") {
            const input = request as {
              sessionId?: string;
              envelope?: { sessionId?: string };
              workspacePath?: string;
              workspaceIdentity?: string;
              workspace?: { workspacePath: string; workspaceIdentity?: string };
            };
            const sessionId = input.sessionId ?? input.envelope?.sessionId;
            // 业务 owner 区分私有草稿与已发布 ref；原生层继续核实 workspace 和附件采用行。
            if (sessionId) business.getNativeBinding(sessionId);
            // 修复原因：样例 actor 仍由原生 v4 保存会话；首次种子前必须核验其 canonical 根会话工作区。
            const workspace =
              input.workspace ??
              (input.workspacePath
                ? {
                    workspacePath: input.workspacePath,
                    workspaceIdentity: input.workspaceIdentity,
                  }
                : undefined);
            if (sessionId && workspace)
              business.automations.findNativeTaskActor(sessionId, workspace);
          }
          if (
            ["createAutomation", "runAutomationNow", "restartAutomation"].includes(String(key)) &&
            request &&
            typeof request === "object"
          ) {
            const operationId = (request as Parameters<IZCodeAgentService["runAutomationNow"]>[0])
              .operationId;
            if (operationId !== undefined) {
              if (typeof operationId !== "string") throw new Error("操作编号无效。");
              return business.invokeOnce(String(key), operationId, args, () =>
                Reflect.apply(value, target, args),
              );
            }
          }
          return Reflect.apply(value, target, args);
        });
    },
  });
  const overrides = modelCatalogOverrides(services);
  overrides.set(IZCodeAgentService.channelName, facade);
  return overrides;
}
