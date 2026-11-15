import {
  isValidCronExpr,
  type IServiceAccessor,
  type ZCodeAgentWorkspaceTarget,
} from "@zcode/services";
import type {
  AIReqAgentModelBinding,
  NativeTaskOutputContent,
  NativeTaskOutputRequest,
  NativeTaskRun,
  NativeTaskRunsRequest,
  NativeTaskRunsSnapshot,
} from "@zcode/services/aireq";
import {
  AUTOMATION_CREATE_LIMIT,
  AUTOMATION_CREATE_LIMIT_ERROR_CODE,
  modelSelectionSchema,
  type ZCodeAutomation,
  type ZCodeAutomationRun,
  type ZCodeAutomationScheduleRule,
} from "@zcode/shared";
import {
  PROTOTYPE_AGENT_MODELS,
  prototypeAgentModelSelection,
  readPrototypeAgentModelBinding,
} from "./agent-models.js";
import { currentIdentity, getEmployeeId, isEmployeeId } from "./identity.js";
import { readPrototypeProjectSettings } from "./project-settings.js";

const reviewPrompt =
  "检查当前项目的变更与验证记录，整理潜在回归、缺失证据和待确认问题。只生成报告，不修改代码或推进任何 IR/SR 阶段。\n\n这是前端原型的任务说明样例，不会触发模型或后台调度。\n";
const summaryPrompt =
  "整理项目本周的需求、交付和未完成事项，形成带来源的摘要。无法确认的内容列为待核实，不自动提交、推送或标记需求完成。\n\n这是前端原型的任务说明样例，不会触发模型或后台调度。\n";
const report =
  "# 自动化检查报告（样例）\n\n当前页面只演示自动化与原生子任务的展示方式，没有执行模型、工具、Git 或测试。\n\n## 检查范围\n\n- 当前项目的需求材料和阶段记录。\n- 代码变更摘要与已有验证记录。\n- 交付材料中的限制及待确认事项。\n\n## 待处理事项\n\n1. 补齐缺失的验证证据。\n2. 确认业务边界和交付范围。\n3. 由人员决定后续操作，不自动推进 IR/SR。\n";
const stoppedMessage = "模拟运行已停止：未执行模型、工具或后台调度，此条仅为内存交互记录。";

type NativeAutomationMethods = Pick<
  IServiceAccessor["zcodeAgentService"],
  | "listAutomations"
  | "listAllAutomations"
  | "createAutomation"
  | "updateAutomation"
  | "deleteAutomation"
  | "setAutomationEnabled"
  | "restartAutomation"
  | "runAutomationNow"
  | "listAutomationRuns"
  | "deleteAutomationRun"
>;

export interface PrototypeAutomationSession {
  sessionId: string;
  projectId: string;
  automationId: string;
  runId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  parentSessionId?: string;
  title: string;
  prompt: string;
  reply: string;
  createdAt: number;
  binding: AIReqAgentModelBinding;
}
type BusinessTaskSession = Pick<
  PrototypeAutomationSession,
  "sessionId" | "projectId" | "workspacePath" | "workspaceIdentity" | "binding"
>;

export interface AutomationServices extends NativeAutomationMethods {
  listNativeTaskRuns(request: NativeTaskRunsRequest): Promise<NativeTaskRunsSnapshot>;
  readNativeTaskOutput(request: NativeTaskOutputRequest): Promise<NativeTaskOutputContent>;
  readAutomationSession(request: NativeTaskRunsRequest): PrototypeAutomationSession | undefined;
  findAutomationSession(sessionId: string): PrototypeAutomationSession | undefined;
  findNativeTaskActor(
    sessionId: string,
    target?: ZCodeAgentWorkspaceTarget,
  ): (BusinessTaskSession & { reply: string }) | undefined;
}

function requireIdentity(): string {
  const employee = getEmployeeId();
  if (!isEmployeeId(employee)) throw new Error("请输入有效工号后操作自动化。");
  return employee;
}

function projectFor(target: ZCodeAgentWorkspaceTarget, projectId?: string | null) {
  if (target.remoteSessionId) throw new Error("自动化样例不支持远程宿主会话。");
  const project = readPrototypeProjectSettings().projects.find(
    (item) => item.root === target.workspacePath && (!projectId || item.id === projectId),
  );
  if (!project) throw new Error("自动化工作区与所选项目不匹配。");
  const identity = target.workspaceIdentity?.trim();
  if (identity !== `aireq-mock:${project.id}`) throw new Error("自动化工作区身份与项目不匹配。");
  return project;
}

function supportedMode(
  mode: string | undefined,
  previousMode?: ZCodeAutomation["mode"],
): ZCodeAutomation["mode"] {
  if (mode === undefined) return undefined;
  // 与当前原生编辑器一致；default/edit 仅用于保留已存在的历史模式。
  if (
    mode !== "build" &&
    mode !== "guarded" &&
    mode !== "plan" &&
    mode !== "yolo" &&
    mode !== "default" &&
    mode !== "edit"
  )
    throw new Error("请选择自动化支持的模式。");
  if ((mode === "default" || mode === "edit") && mode !== previousMode)
    throw new Error("历史模式只能保留，不能新选。");
  return mode;
}

function validateDefinition(value: ZCodeAutomation): void {
  if (typeof value.title !== "string" || !value.title.trim()) throw new Error("请输入自动化标题。");
  if (typeof value.prompt !== "string" || !value.prompt.trim())
    throw new Error("请输入自动化指令。");
  if (
    typeof value.cronExpr !== "string" ||
    value.cronExpr.trim().split(/\s+/).length !== 5 ||
    !isValidCronExpr(value.cronExpr)
  )
    throw new Error("请输入有效的五段 cron 调度。");
  if (typeof value.recurring !== "boolean") throw new Error("重复执行设置无效。");
  if (value.maxRuns !== undefined && (!Number.isSafeInteger(value.maxRuns) || value.maxRuns < 1))
    throw new Error("运行次数必须是正整数。");
  if (!value.recurring && value.maxRuns === undefined)
    throw new Error("有限次自动化必须指定运行次数。");
  if (
    value.endAt !== undefined &&
    (!Number.isFinite(value.endAt) ||
      value.endAt <= 0 ||
      !Number.isFinite(new Date(value.endAt).getTime()))
  )
    throw new Error("结束日期无效。");
  supportedMode(value.mode, value.mode);
  if (value.modelSelection !== undefined) {
    const selection = modelSelectionSchema.parse(value.modelSelection);
    if (
      !PROTOTYPE_AGENT_MODELS.some(
        (model) => model.providerId === selection.providerId && model.name === selection.modelId,
      )
    )
      throw new Error("请选择原型支持的演示模型。");
    if (
      selection.options?.reasoningLevel !== undefined &&
      !["default", "low", "medium", "high"].includes(selection.options.reasoningLevel)
    )
      throw new Error("思考等级无效。");
  }
  if (value.scheduleRule) validateSchedule(value.scheduleRule);
}

function validateSchedule(rule: ZCodeAutomationScheduleRule): void {
  const range = (value: number, low: number, high: number) =>
    Number.isInteger(value) && value >= low && value <= high;
  const array = (values: number[] | undefined, low: number, high: number) =>
    Array.isArray(values) && values.length > 0 && values.every((value) => range(value, low, high));
  if (
    !rule ||
    !["minute", "hourly", "daily", "weekly", "monthly", "yearly"].includes(rule.unit) ||
    !Number.isSafeInteger(rule.interval) ||
    rule.interval < 1 ||
    (rule.unit === "monthly" && rule.interval > 1200)
  )
    throw new Error("自定义调度间隔无效。");
  if (
    !range(rule.hour, 0, 23) ||
    !range(rule.minute, 0, 59) ||
    !Number.isFinite(rule.anchorAt) ||
    !Number.isFinite(new Date(rule.anchorAt).getTime())
  )
    throw new Error("自定义调度时间无效。");
  if (
    rule.monthlyMode !== undefined &&
    rule.monthlyMode !== "date" &&
    rule.monthlyMode !== "weekday"
  )
    throw new Error("月度调度方式无效。");
  if (
    (rule.weekdays !== undefined && !array(rule.weekdays, 0, 6)) ||
    (rule.monthDays !== undefined && !array(rule.monthDays, 1, 31)) ||
    (rule.months !== undefined && !array(rule.months, 1, 12))
  )
    throw new Error("调度日期选择无效。");
  if (rule.unit === "weekly" && !array(rule.weekdays, 0, 6))
    throw new Error("请选择每周执行日期。");
  if (
    rule.unit === "monthly" &&
    !(rule.monthlyMode === "weekday" ? array(rule.weekdays, 0, 6) : array(rule.monthDays, 1, 31))
  )
    throw new Error("请选择每月执行日期。");
  if (rule.unit === "yearly") {
    const months = rule.months ?? [new Date(rule.anchorAt).getMonth() + 1];
    const days = rule.monthDays ?? [new Date(rule.anchorAt).getDate()];
    if (months.some((month) => days.some((day) => day > new Date(2000, month, 0).getDate())))
      throw new Error("年度调度包含不存在的月日。");
  }
}

/** 唯一内存所有者；只登记模拟定义和只读历史，不创建真实调度、模型请求或文件。 */
export function createPrototypeAutomationServices(
  resolveBusinessSession?: (sessionId: string) => BusinessTaskSession | undefined,
): AutomationServices {
  const now = Date.now();
  const definitions = new Map<string, ZCodeAutomation>();
  const histories = new Map<string, ZCodeAutomationRun[]>();
  const sessions = new Map<string, PrototypeAutomationSession>();
  const snapshots = new Map<string, NativeTaskRunsSnapshot>();
  const outputs = new Map<string, NativeTaskOutputContent>();
  const deletedDefinitions = new Map<string, ZCodeAutomation>();
  const deletedRuns = new Map<string, ZCodeAutomation>();
  const admissions = new Map<string, { payload: string; result: unknown }>();
  const outputKey = (sessionId: string, runId: string, outputId: string) =>
    JSON.stringify([sessionId, runId, outputId]);

  // 回执归业务 owner；RPC 反序列化后的新对象仍按显式操作编号重放。
  function admit<T>(
    method: string,
    params: ZCodeAgentWorkspaceTarget & { operationId?: string; projectId?: string | null },
    commit: () => T,
  ): T {
    const employee = requireIdentity();
    const project = projectFor(params, params.projectId);
    const operationId = params.operationId;
    if (operationId === undefined) return structuredClone(commit());
    if (typeof operationId !== "string" || !operationId.trim() || operationId.length > 200)
      throw new Error("操作编号无效。");
    const key = JSON.stringify([
      employee,
      currentIdentity()?.clientId,
      method,
      project.id,
      params.workspaceIdentity,
      operationId,
    ]);
    const payload = JSON.stringify(params);
    const prior = admissions.get(key);
    if (prior) {
      if (prior.payload !== payload) throw new Error("操作编号不能复用于不同输入。");
      return structuredClone(prior.result) as T;
    }
    const result = commit();
    admissions.set(key, { payload, result: structuredClone(result) });
    return structuredClone(result);
  }

  function assertScope(value: ZCodeAutomation, target: ZCodeAgentWorkspaceTarget): void {
    const project = projectFor(target, value.projectId);
    if (
      project.id !== value.projectId ||
      value.workspacePath !== target.workspacePath ||
      target.workspaceIdentity?.trim() !== value.workspaceIdentity
    )
      throw new Error("所选项目没有这条自动化记录。");
  }
  function lookup(automationId: string, target: ZCodeAgentWorkspaceTarget): ZCodeAutomation {
    requireIdentity();
    const value = definitions.get(automationId);
    if (!value) throw new Error("自动化不存在或已删除。");
    assertScope(value, target);
    return value;
  }
  function registerSession(value: ZCodeAutomation, run: ZCodeAutomationRun, sample: boolean): void {
    if (!run.sessionId || !value.projectId) throw new Error("自动化历史缺少会话归属。");
    const binding = readPrototypeAgentModelBinding("progress-analysis");
    if (run.modelSelection) {
      const model = PROTOTYPE_AGENT_MODELS.find(
        (item) =>
          item.providerId === run.modelSelection?.providerId &&
          item.name === run.modelSelection.modelId,
      );
      if (!model) throw new Error("运行记录模型不存在。");
      Object.assign(binding, {
        modelKey: model.id,
        modelName: model.name,
        providerId: model.providerId,
        modelId: model.name,
        inherited: false,
        reasoning: run.modelSelection.options?.reasoningLevel ?? "default",
      });
    }
    const root: PrototypeAutomationSession = {
      sessionId: run.sessionId,
      projectId: value.projectId,
      automationId: value.automationId,
      runId: run.runId,
      workspacePath: value.workspacePath,
      workspaceIdentity: value.workspaceIdentity,
      title: value.title,
      prompt: value.prompt,
      reply: sample ? report : stoppedMessage,
      createdAt: run.createdAt,
      binding,
    };
    sessions.set(root.sessionId, root);
    if (sample) {
      const reviewSession = `${root.sessionId}:review`;
      const auditSession = `${root.sessionId}:audit`;
      sessions.set(reviewSession, {
        ...root,
        sessionId: reviewSession,
        parentSessionId: root.sessionId,
        title: "检查 Agent（样例）",
      });
      sessions.set(auditSession, {
        ...root,
        sessionId: auditSession,
        parentSessionId: reviewSession,
        title: "独立审查 Agent（样例）",
      });
      registerNativeTaskSample(root, run.runId, run.updatedAt, value.automationId);
    } else
      snapshots.set(root.sessionId, {
        source: "omp-native-task",
        sessionId: root.sessionId,
        revision: 1,
        runs: [],
      });
  }
  function registerNativeTaskSample(
    root: Pick<PrototypeAutomationSession, "sessionId" | "createdAt">,
    runId: string,
    endedAt: number,
    automationId?: string,
  ): void {
    const runs: NativeTaskRun[] = [];
    const reviewSession = `${root.sessionId}:review`;
    const auditSession = `${root.sessionId}:audit`;
    const task: NativeTaskRun = {
      runId: `${runId}:task`,
      sessionId: root.sessionId,
      toolCallId: `${runId}:task-call`,
      title: "task：只读检查（样例）",
      status: "completed",
      startedAt: root.createdAt,
      endedAt,
      actors: [
        {
          agentId: "prototype-review",
          sessionId: reviewSession,
          parentSessionId: root.sessionId,
          title: "检查 Agent（样例）",
          status: "completed",
        },
      ],
      outputs: [
        {
          id: "prototype-report",
          sessionId: reviewSession,
          agentId: "prototype-review",
          title: "检查报告（样例）",
          kind: "file",
        },
      ],
    };
    const pool: NativeTaskRun = {
      runId: `${runId}:workpool`,
      sessionId: root.sessionId,
      toolCallId: `${runId}:workpool-call`,
      title: "workpool：独立审查（样例）",
      status: "completed",
      startedAt: root.createdAt,
      endedAt,
      actors: [
        {
          agentId: "prototype-review",
          sessionId: reviewSession,
          parentSessionId: root.sessionId,
          title: "检查 Agent（样例）",
          status: "completed",
        },
        {
          agentId: "prototype-audit",
          sessionId: auditSession,
          parentSessionId: reviewSession,
          title: "独立审查 Agent（样例）",
          status: "completed",
        },
      ],
      outputs: [
        {
          id: "prototype-json",
          sessionId: auditSession,
          agentId: "prototype-audit",
          title: "审查摘要（样例）",
          kind: "file",
        },
        {
          id: "prototype-transcript",
          sessionId: auditSession,
          agentId: "prototype-audit",
          title: "审查说明（样例）",
          kind: "transcript",
        },
      ],
    };
    runs.push(task, pool);
    for (const sessionId of [root.sessionId, reviewSession, auditSession]) {
      const visible =
        sessionId === root.sessionId
          ? runs
          : runs.filter((item) => item.actors.some((actor) => actor.sessionId === sessionId));
      snapshots.set(sessionId, {
        source: "omp-native-task",
        sessionId,
        revision: 1,
        runs: visible,
      });
      for (const item of visible)
        for (const descriptor of item.outputs) {
          outputs.set(outputKey(sessionId, item.runId, descriptor.id), {
            outputId: descriptor.id,
            title: descriptor.title,
            content:
              descriptor.id === "prototype-report"
                ? report
                : descriptor.id === "prototype-json"
                  ? JSON.stringify(
                      {
                        simulated: true,
                        executed: false,
                        automationId,
                        findings: ["待补齐验证证据"],
                      },
                      null,
                      2,
                    )
                  : "只读审查样例：没有执行模型、工具或测试，不修改 IR/SR。",
            format:
              descriptor.id === "prototype-report"
                ? "markdown"
                : descriptor.id === "prototype-json"
                  ? "json"
                  : "text",
          });
        }
    }
  }
  function removeRun(run: ZCodeAutomationRun): void {
    for (const [sessionId, session] of sessions) {
      if (session.runId !== run.runId) continue;
      const snapshot = snapshots.get(sessionId);
      for (const nativeRun of snapshot?.runs ?? [])
        for (const descriptor of nativeRun.outputs)
          outputs.delete(outputKey(sessionId, nativeRun.runId, descriptor.id));
      sessions.delete(sessionId);
      snapshots.delete(sessionId);
    }
  }
  function readSession(request: NativeTaskRunsRequest): PrototypeAutomationSession | undefined {
    requireIdentity();
    projectFor(request);
    const session = sessions.get(request.sessionId);
    if (!session) return undefined;
    const value = lookup(session.automationId, request);
    if (
      session.projectId !== value.projectId ||
      !(histories.get(value.automationId) ?? []).some((run) => run.runId === session.runId)
    )
      throw new Error("自动化运行会话不存在。");
    return structuredClone(session);
  }
  function findNativeTaskActor(
    sessionId: string,
    target?: ZCodeAgentWorkspaceTarget,
  ): (BusinessTaskSession & { reply: string }) | undefined {
    for (const snapshot of snapshots.values()) {
      const run = snapshot.runs.find(
        (item) =>
          item.sessionId === snapshot.sessionId &&
          item.actors.some((actor) => actor.sessionId === sessionId),
      );
      if (!run || sessions.has(run.sessionId)) continue;
      const root = resolveBusinessSession?.(run.sessionId);
      if (!root) throw new Error("原生任务所属业务会话已不可用。");
      if (target) assertBusinessScope(root, target);
      return { ...root, sessionId, reply: report };
    }
    return undefined;
  }
  function assertBusinessScope(session: BusinessTaskSession, target: ZCodeAgentWorkspaceTarget) {
    const project = projectFor(target, session.projectId);
    if (
      project.id !== session.projectId ||
      session.workspacePath !== target.workspacePath ||
      session.workspaceIdentity !== target.workspaceIdentity?.trim()
    )
      throw new Error("运行会话不属于当前项目。");
  }
  function requireNativeTaskSession(request: NativeTaskRunsRequest): void {
    if (readSession(request)) return;
    const actor = findNativeTaskActor(request.sessionId, request);
    if (actor) return;
    const session = resolveBusinessSession?.(request.sessionId);
    if (!session) throw new Error("此项目没有可用的原生任务会话。");
    assertBusinessScope(session, request);
    // 修复原因：源工作流对已有业务会话展示只读 task/workpool 样例，不创建独立自动化历史。
    if (!snapshots.has(session.sessionId))
      registerNativeTaskSample(
        { sessionId: session.sessionId, createdAt: now - 600000 },
        `prototype-run:${session.sessionId}`,
        now - 540000,
      );
  }

  const projects = readPrototypeProjectSettings().projects;
  const samples: {
    title: string;
    status: ZCodeAutomation["lifecycleStatus"];
    prompt: string;
    projectIndex: number;
  }[] = [
    { title: "每日变更巡检（样例）", status: "active", prompt: reviewPrompt, projectIndex: 0 },
    { title: "每周项目摘要（样例）", status: "paused", prompt: summaryPrompt, projectIndex: 0 },
    { title: "交付材料检查（样例）", status: "completed", prompt: reviewPrompt, projectIndex: 1 },
    { title: "待补齐资料的检查（样例）", status: "failed", prompt: summaryPrompt, projectIndex: 0 },
  ];
  for (const [index, sample] of samples.entries()) {
    const project = projects[sample.projectIndex];
    if (!project) continue;
    const automationId = `prototype-automation-${index + 1}`;
    const binding = readPrototypeAgentModelBinding("progress-analysis");
    const value: ZCodeAutomation = {
      automationId,
      title: sample.title,
      prompt: sample.prompt,
      cronExpr: index === 1 ? "0 9 * * 1" : "0 9 * * *",
      projectId: project.id,
      hostId: "local",
      workspacePath: project.root,
      workspaceIdentity: `aireq-mock:${project.id}`,
      workspaceKey: `aireq-mock:${project.id}`,
      modelSelection: prototypeAgentModelSelection(binding),
      mode: "default",
      locationKind: "local",
      recurring: sample.status !== "completed",
      maxRuns: sample.status === "completed" ? 1 : undefined,
      runCount: 1,
      enabled: sample.status === "active",
      lifecycleStatus: sample.status,
      lastRunAt: now - 3600000,
      dispatchStatus: "idle",
      dispatchAttempts: 0,
      lastError:
        sample.status === "failed" ? "样例：资料不足，等待人员补充；未执行真实任务。" : undefined,
      createdAt: now - 86400000,
      updatedAt: now - 3600000,
    };
    const run: ZCodeAutomationRun = {
      runId: `${automationId}:${now - 3600000}`,
      automationId,
      workspaceKey: value.workspaceKey,
      modelSelection: value.modelSelection,
      scheduledAt: now - 3600000,
      trigger: "schedule",
      dispatchStatus: "dispatched",
      outcome: sample.status === "failed" ? "failed" : "succeeded",
      attempts: 1,
      sessionId: `prototype-automation-session:${automationId}`,
      error: value.lastError,
      createdAt: now - 3600000,
      updatedAt: now - 3540000,
    };
    definitions.set(automationId, value);
    histories.set(automationId, [run]);
    registerSession(value, run, true);
  }

  return {
    listAutomations: async (params) => {
      requireIdentity();
      const project = projectFor(params);
      return structuredClone(
        [...definitions.values()].filter((item) => item.projectId === project.id),
      );
    },
    listAllAutomations: async () => {
      requireIdentity();
      return structuredClone([...definitions.values()]);
    },
    createAutomation: async (params) =>
      admit("createAutomation", params, () => {
        const project = projectFor(params, params.projectId);
        if (params.relativeDelayMinutes !== undefined)
          throw new Error("自动化工作页不支持相对延迟调度。");
        const time = Date.now();
        const value: ZCodeAutomation = {
          automationId: `prototype-automation-${crypto.randomUUID()}`,
          title: params.title,
          prompt: params.prompt,
          cronExpr: params.cronExpr,
          projectId: project.id,
          hostId: "local",
          workspacePath: project.root,
          workspaceIdentity: `aireq-mock:${project.id}`,
          workspaceKey: `aireq-mock:${project.id}`,
          modelSelection: params.modelSelection,
          mode: supportedMode(params.mode),
          recurring: params.recurring ?? true,
          maxRuns: params.maxRuns ?? (params.recurring === false ? 1 : undefined),
          endAt: params.endAt,
          scheduleRule: params.scheduleRule,
          locationKind: "local",
          enabled: true,
          lifecycleStatus: "active",
          runCount: 0,
          dispatchStatus: "idle",
          dispatchAttempts: 0,
          createdAt: time,
          updatedAt: time,
        };
        validateDefinition(value);
        if (definitions.size >= AUTOMATION_CREATE_LIMIT)
          throw new Error(AUTOMATION_CREATE_LIMIT_ERROR_CODE);
        definitions.set(value.automationId, structuredClone(value));
        histories.set(value.automationId, []);
        return value;
      }),
    updateAutomation: async (params) => {
      const value = lookup(params.automationId, params);
      const next: ZCodeAutomation = {
        ...value,
        title: params.title ?? value.title,
        prompt: params.prompt ?? value.prompt,
        cronExpr: params.cronExpr ?? value.cronExpr,
        recurring: params.recurring ?? value.recurring,
        modelSelection:
          params.modelSelection === null
            ? undefined
            : (params.modelSelection ?? value.modelSelection),
        mode:
          params.mode === null ? undefined : supportedMode(params.mode ?? value.mode, value.mode),
        maxRuns: params.maxRuns === null ? undefined : (params.maxRuns ?? value.maxRuns),
        endAt: params.endAt === null ? undefined : (params.endAt ?? value.endAt),
        scheduleRule:
          params.scheduleRule === null ? undefined : (params.scheduleRule ?? value.scheduleRule),
        scheduleEditedByUser: params.scheduleEditedByUser ?? value.scheduleEditedByUser,
      };
      if (next.scheduleEditedByUser !== undefined && typeof next.scheduleEditedByUser !== "boolean")
        throw new Error("调度编辑标记无效。");
      validateDefinition(next);
      if (JSON.stringify(next) !== JSON.stringify(value)) {
        next.updatedAt = Date.now();
        definitions.set(value.automationId, structuredClone(next));
      }
      return structuredClone(next);
    },
    deleteAutomation: async (params) => {
      requireIdentity();
      const deleted = deletedDefinitions.get(params.automationId);
      if (deleted) {
        assertScope(deleted, params);
        return;
      }
      const value = lookup(params.automationId, params);
      for (const run of histories.get(value.automationId) ?? []) {
        removeRun(run);
        deletedRuns.set(run.runId, value);
      }
      definitions.delete(value.automationId);
      histories.delete(value.automationId);
      deletedDefinitions.set(value.automationId, structuredClone(value));
    },
    setAutomationEnabled: async (params) => {
      const value = lookup(params.automationId, params);
      if (typeof params.enabled !== "boolean") throw new Error("启停状态无效。");
      if (value.lifecycleStatus === "failed" || value.lifecycleStatus === "completed")
        throw new Error("失败任务请使用重启；已完成任务不能直接启停。");
      if (value.enabled === params.enabled) return;
      value.enabled = params.enabled;
      value.lifecycleStatus = params.enabled ? "active" : "paused";
      value.nextRunAt = undefined;
      value.updatedAt = Date.now();
    },
    restartAutomation: async (params) =>
      admit("restartAutomation", params, () => {
        const value = lookup(params.automationId, params);
        if (value.lifecycleStatus !== "failed") throw new Error("仅失败的自动化可以重启。");
        value.enabled = true;
        value.lifecycleStatus = "active";
        value.lastError = undefined;
        value.retryAt = undefined;
        value.dispatchStatus = "idle";
        value.dispatchAttempts = 0;
        value.nextRunAt = undefined;
        value.updatedAt = Date.now();
      }),
    runAutomationNow: async (params) =>
      admit("runAutomationNow", params, () => {
        const value = lookup(params.automationId, params);
        // 显式运行仅登记 stopped 演示历史；终态也可操作，不复活定义或消耗真实运行次数。
        const time = Date.now();
        const runId = `${value.automationId}:manual:${crypto.randomUUID()}`;
        // 每次显式操作独立历史；绝不能沿用旧样例 session 伪造本次真实执行及输出。
        const run: ZCodeAutomationRun = {
          runId,
          automationId: value.automationId,
          workspaceKey: value.workspaceKey,
          modelSelection: value.modelSelection,
          trigger: "manual",
          dispatchStatus: "dispatched",
          outcome: "stopped",
          error: stoppedMessage,
          attempts: 0,
          sessionId: `prototype-automation-session:${runId}`,
          createdAt: time,
          updatedAt: time,
        };
        registerSession(value, run, false);
        histories.set(value.automationId, [run, ...(histories.get(value.automationId) ?? [])]);
        value.lastRunAt = time;
        value.updatedAt = time;
        return { status: "queued" as const };
      }),
    listAutomationRuns: async (params) => {
      const value = lookup(params.automationId, params);
      return structuredClone(histories.get(value.automationId) ?? []);
    },
    deleteAutomationRun: async (params) => {
      requireIdentity();
      const deleted = deletedRuns.get(params.runId);
      if (deleted) {
        assertScope(deleted, params);
        return;
      }
      projectFor(params);
      for (const [automationId, runs] of histories) {
        const run = runs.find((item) => item.runId === params.runId);
        if (!run) continue;
        const value = lookup(automationId, params);
        histories.set(
          automationId,
          runs.filter((item) => item.runId !== run.runId),
        );
        removeRun(run);
        deletedRuns.set(run.runId, structuredClone(value));
        return;
      }
      throw new Error("运行记录不存在或不属于当前项目。");
    },
    listNativeTaskRuns: async (request) => {
      requireNativeTaskSession(request);
      const snapshot = snapshots.get(request.sessionId);
      if (!snapshot) throw new Error("自动化运行快照不存在。");
      return structuredClone(snapshot);
    },
    readNativeTaskOutput: async (request) => {
      requireNativeTaskSession(request);
      const snapshot = snapshots.get(request.sessionId);
      const run = snapshot?.runs.find((item) => item.runId === request.runId);
      if (!run || !run.outputs.some((item) => item.id === request.outputId))
        throw new Error("所选运行或输出不存在。");
      const content = outputs.get(outputKey(request.sessionId, request.runId, request.outputId));
      if (!content) throw new Error("自动化输出已不存在。");
      return structuredClone(content);
    },
    readAutomationSession: readSession,
    findNativeTaskActor,
    findAutomationSession: (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) return undefined;
      const definition = definitions.get(session.automationId);
      if (
        !definition ||
        definition.projectId !== session.projectId ||
        !(histories.get(session.automationId) ?? []).some((run) => run.runId === session.runId)
      )
        return undefined;
      return structuredClone(session);
    },
  };
}
