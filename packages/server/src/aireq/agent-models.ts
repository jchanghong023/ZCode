import { businessRule } from "./errors.js";
import { AIREQ_AGENT_ROLES } from "@zcode/services/aireq";
import type {
  AIReqAgentModel,
  AIReqAgentModelInput,
  AIReqAgentModelSettings,
  AIReqAgentRole,
  AIReqAgentModelBinding,
} from "@zcode/services/aireq";
import { readPrototypeAgentPrompt } from "./personalization.js";
import { production } from "./production-store.js";

export interface AgentModelChoice {
  id: string;
  name: string;
  providerId: string;
  provider: string;
  modelId?: string;
}

// 目录与角色快照共用正式供应商标识，避免私有运行环境名称泄漏为业务模型身份。
const prototypeModels: AgentModelChoice[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    providerId: "anthropic",
    provider: "Anthropic",
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    providerId: "anthropic",
    provider: "Anthropic",
  },
  { id: "openai/gpt-5.2", name: "GPT-5.2", providerId: "openai", provider: "OpenAI" },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    providerId: "deepseek",
    provider: "DeepSeek",
  },
  {
    id: "opencode/beam-free",
    name: "Beam Free",
    providerId: "opencode-go",
    provider: "OpenCode Go",
  },
];

const roleDefaults: Record<AIReqAgentRole, Omit<AIReqAgentModel, "id">> = {
  requirements: {
    name: "业务需求 Agent",
    nameEn: "Requirements Agent",
    description: "在需求澄清会话中整理业务目标、范围和验收条件，生成 IR 需求文档。",
    descriptionEn:
      "Clarify business goals, scope and acceptance criteria, and prepare the IR requirements document.",
    model: "openai/gpt-5.2",
    reasoning: "high",
  },
  "requirements-review": {
    name: "需求评审 Agent",
    nameEn: "Requirements Review Agent",
    description: "按需评审当前 IR 需求文档并将意见返回会话。",
    descriptionEn:
      "Review the current IR requirements document on request and return feedback to the discussion.",
    model: "anthropic/claude-opus-4.5",
    reasoning: "high",
  },
  solution: {
    name: "方案 Agent",
    nameEn: "Solution Agent",
    description: "在方案会话中与人拆分 SR，生成 SR 规格、设计、任务、测试方案及 IR 共享材料。",
    descriptionEn:
      "Split SRs with participants and prepare their specifications, designs, tasks, test plans and shared IR materials.",
    model: "anthropic/claude-opus-4.5",
    reasoning: "high",
  },
  "solution-review": {
    name: "方案评审 Agent",
    nameEn: "Solution Review Agent",
    description: "按需审查当前方案覆盖、技术设计与测试材料。",
    descriptionEn:
      "Review current solution coverage, technical design, and testing materials on request.",
    model: "anthropic/claude-opus-4.5",
    reasoning: "high",
  },
};

// 所有项目和 Release 共享服务端内存配置；刷新和重连保留，服务重启恢复样例。
let savedSettings: AIReqAgentModelSettings = {
  defaultModel: "anthropic/claude-sonnet-4.5",
  agents: AIREQ_AGENT_ROLES.map((id) => ({ id, ...roleDefaults[id] })),
};
let catalogue: readonly AgentModelChoice[] = prototypeModels;
export function readAgentModelChoices(): readonly AgentModelChoice[] {
  return catalogue;
}
export function initializeProductionAgentModels(
  choices: readonly AgentModelChoice[],
  defaultId?: string,
): void {
  if (!production) throw new Error("正式业务模型初始化需要已打开的数据库。");
  catalogue = choices;
  const persisted = production.get<{ settings: AIReqAgentModelSettings; revision: number }>(
    "agent-models",
  );
  savedSettings = persisted?.settings ?? {
    defaultModel: defaultId ?? "",
    agents: AIREQ_AGENT_ROLES.map((id) => ({
      id,
      ...roleDefaults[id],
      model: "inherit",
      reasoning: "default",
    })),
  };
  configurationRevision = persisted?.revision ?? 1;
}
export function readPrototypeAgentModels(): AIReqAgentModelSettings {
  return structuredClone(savedSettings);
}
export function savePrototypeAgentModels(
  settings: AIReqAgentModelInput,
  expectedRevision: number,
): void {
  if (expectedRevision !== configurationRevision)
    throw businessRule("模型配置已变化，请重新读取。");
  const allowed = AIREQ_AGENT_ROLES;
  const models = new Set(catalogue.map((model) => model.id));
  if (
    !settings ||
    !models.has(settings.defaultModel) ||
    !Array.isArray(settings.agents) ||
    settings.agents.length !== allowed.length ||
    new Set(settings.agents.map((agent) => agent.id)).size !== allowed.length ||
    settings.agents.some(
      (agent) =>
        !allowed.includes(agent.id) ||
        (agent.model !== "inherit" && !models.has(agent.model)) ||
        !["default", "low", "medium", "high"].includes(agent.reasoning),
    )
  )
    throw businessRule("模型或角色配置无效。");
  const agents = new Map(settings.agents.map((agent) => [agent.id, agent]));
  const next: AIReqAgentModelSettings = {
    defaultModel: settings.defaultModel,
    agents: allowed.map((id) => {
      const { model, reasoning } = agents.get(id)!;
      return { id, ...roleDefaults[id], model, reasoning };
    }),
  };
  if (JSON.stringify(next) === JSON.stringify(savedSettings)) return;
  production?.set("agent-models", { settings: next, revision: configurationRevision + 1 });
  savedSettings = next;
  configurationRevision += 1;
  for (const listener of listeners) listener();
}

let configurationRevision = 1;
const listeners = new Set<() => void>();
export function prototypeAgentModelConfigurationRevision(): number {
  return configurationRevision;
}
export function subscribePrototypeAgentModels(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function resolveModel(modelKey: string) {
  const model = catalogue.find((item) => item.id === modelKey);
  if (!model) throw businessRule("请选择当前可用的模型。");
  return model;
}

export function isAgentModelAvailable(role: AIReqAgentRole): boolean {
  const bound = savedSettings.agents.find((agent) => agent.id === role);
  const key = bound?.model === "inherit" ? savedSettings.defaultModel : bound?.model;
  return catalogue.some((choice) => choice.id === key);
}

export function readPrototypeWorkflowDefaultModel() {
  return resolveModel(savedSettings.defaultModel);
}

export interface NativeRuntimeModel {
  providerId: string;
  modelId: string;
  reasoning: string;
}

/** 会话创建或执行接纳时绑定已保存的配置；模拟后端不调用真实模型。 */
export function readPrototypeAgentModelBinding(role: AIReqAgentRole): {
  modelConfig: AIReqAgentModelBinding;
  runtimeModel: NativeRuntimeModel;
} {
  const agent = savedSettings.agents.find((item) => item.id === role);
  if (!agent) throw businessRule("此 AIReq Agent 未配置。");
  const inherited = agent.model === "inherit";
  const modelKey = inherited ? savedSettings.defaultModel : agent.model;
  const model = resolveModel(modelKey);
  return {
    modelConfig: {
      role,
      roleName: agent.name,
      modelKey,
      modelName: model.name,
      reasoning: agent.reasoning,
      inherited,
      promptSnapshot: readPrototypeAgentPrompt(role),
    },
    runtimeModel: {
      providerId: model.providerId,
      modelId: model.modelId ?? model.name,
      reasoning: agent.reasoning,
    },
  };
}
