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

// 目录与角色快照共用正式供应商标识，避免私有运行环境名称泄漏为业务模型身份。
export const PROTOTYPE_AGENT_MODELS = [
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
    description: "独立评审 IR 需求文档并给出意见，供业务人员确认。",
    descriptionEn:
      "Independently review the IR requirements document and give feedback for business confirmation.",
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
  "requirements-review-a": {
    name: "方案评审 A",
    nameEn: "Solution Reviewer A",
    description: "独立审查需求覆盖和一致性。",
    descriptionEn: "Independently review requirements coverage and consistency.",
    model: "anthropic/claude-opus-4.5",
    reasoning: "high",
  },
  "requirements-review-b": {
    name: "方案评审 B",
    nameEn: "Solution Reviewer B",
    description: "独立审查技术方案和 SR 依赖。",
    descriptionEn: "Independently review the technical design and SR dependencies.",
    model: "openai/gpt-5.2",
    reasoning: "high",
  },
  "requirements-review-c": {
    name: "方案评审 C",
    nameEn: "Solution Reviewer C",
    description: "独立审查任务可执行性、测试充分性和验收追溯。",
    descriptionEn:
      "Independently review task executability, testing sufficiency and acceptance traceability.",
    model: "deepseek/deepseek-v3.2",
    reasoning: "high",
  },
  "solution-review-summary": {
    name: "方案综审 Agent",
    nameEn: "Solution Review Synthesis Agent",
    description: "汇总三路方案评审的意见及分歧。",
    descriptionEn: "Summarize feedback and disagreements across the three solution reviews.",
    model: "anthropic/claude-sonnet-4.5",
    reasoning: "high",
  },
};

// 所有项目和 Release 共享服务端内存配置；刷新和重连保留，服务重启恢复样例。
let savedSettings: AIReqAgentModelSettings = {
  defaultModel: "anthropic/claude-sonnet-4.5",
  agents: AIREQ_AGENT_ROLES.map((id) => ({ id, ...roleDefaults[id] })),
};
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
  const models = new Set(PROTOTYPE_AGENT_MODELS.map((model) => model.id));
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
  const model = PROTOTYPE_AGENT_MODELS.find((item) => item.id === modelKey);
  if (!model) throw businessRule("请选择当前可用的模型。");
  return model;
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
      // 模拟原生模型目录以名称作为供应商内 ID；modelKey 是 AIReq 配置键，不能互换。
      modelId: model.name,
      reasoning: agent.reasoning,
    },
  };
}
