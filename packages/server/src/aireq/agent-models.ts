import { businessRule } from "./errors.js";
import type {
  AIReqAgentModelSettings,
  AIReqAgentRole,
  AIReqAgentModelBinding,
} from "@zcode/services/aireq";
import type { ModelSelection } from "@zcode/shared";

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

const sampleSettings: AIReqAgentModelSettings = {
  defaultModel: "anthropic/claude-sonnet-4.5",
  agents: [
    {
      id: "requirements",
      name: "业务需求 Agent",
      nameEn: "Requirements Agent",
      description: "澄清业务目标、范围和验收条件，整理原始需求。",
      descriptionEn: "Clarify business goals and organize requirements.",
      model: "openai/gpt-5.2",
      reasoning: "high",
    },
    {
      id: "requirements-review-a",
      name: "需求评审 A",
      nameEn: "Requirements Reviewer A",
      description: "检查业务目标、范围和验收条件，独立评审需求覆盖与一致性。",
      descriptionEn:
        "Check business goals, scope and acceptance; independently review requirement coverage and consistency.",
      model: "anthropic/claude-opus-4.5",
      reasoning: "high",
    },
    {
      id: "requirements-review-b",
      name: "需求评审 B",
      nameEn: "Requirements Reviewer B",
      description: "使用不同模型，独立评审技术方案与开发单元间的依赖。",
      descriptionEn:
        "Use a different model to independently review technical design and dependencies between development units.",
      model: "openai/gpt-5.2",
      reasoning: "high",
    },
    {
      id: "requirements-review-c",
      name: "需求评审 C",
      nameEn: "Requirements Reviewer C",
      description: "检查任务可执行性、测试充分性和业务验收追溯。",
      descriptionEn:
        "Review task executability, testing sufficiency and business-acceptance traceability.",
      model: "deepseek/deepseek-v3.2",
      reasoning: "high",
    },
    {
      id: "requirements-review",
      name: "综合评审 Agent",
      nameEn: "Review Synthesis Agent",
      description: "汇总 A／B／C 的评审意见，保留来源与分歧，由人工决定通过。",
      descriptionEn:
        "Synthesize completed A/B/C reports, retaining sources and disagreements. Humans decide approval.",
      model: "anthropic/claude-sonnet-4.5",
      reasoning: "high",
    },
    {
      id: "solution",
      name: "方案 Agent",
      nameEn: "Solution Agent",
      description: "业务通过后拆分开发单元，完善方案、任务和测试文档；不执行开发或测试。",
      descriptionEn:
        "After business approval, split development units and refine design, task and test documents. Never execute development or tests.",
      model: "anthropic/claude-opus-4.5",
      reasoning: "high",
    },
    {
      id: "skill-design",
      name: "Skill 设计 Agent",
      nameEn: "Skill Design Agent",
      description:
        "在独立设计会话中澄清技能需求、推荐标识并生成临时文件；预览确认后保存到项目或个人技能目录。",
      descriptionEn:
        "Clarify skill requirements in a dedicated session, recommend a name, and prepare temporary files for preview before explicitly saving to project or personal skills.",
      model: "inherit",
      reasoning: "default",
    },
    {
      id: "progress-analysis",
      name: "需求分析 Agent",
      nameEn: "Requirement Analysis Agent",
      description: "结合任务、代码与合入证据分析进度和问题；不执行开发，完成仍须人工测试验收。",
      descriptionEn:
        "Analyze progress and issues using tasks, code and merge evidence. Never execute development; completion requires human test acceptance.",
      model: "inherit",
      reasoning: "default",
    },
  ],
};

// 模拟当前开发者后端自己的 OMP profile；不共享到团队 Web 或其他开发者，不随浏览器工号切换。
// 原型配置保存在后端场景内存，刷新及重新连接保留，服务重启恢复样例。
let savedSettings = structuredClone(sampleSettings);
// 本步仅替换设置；尚未改造的流程页面仍需原有静态会话配置，不能因打开设置而破坏样例。
const historicalStageRoles = new Set(["planning", "execution", "ir-acceptance"]);
export function readPrototypeAgentModels(): AIReqAgentModelSettings {
  return structuredClone({
    ...savedSettings,
    agents: savedSettings.agents.filter((agent) => !historicalStageRoles.has(agent.id)),
  });
}
export function savePrototypeAgentModels(
  settings: AIReqAgentModelSettings,
  expectedRevision: number,
): void {
  if (expectedRevision !== configurationRevision)
    throw businessRule("模型配置已变化，请重新读取。");
  const allowed = sampleSettings.agents.map((agent) => agent.id);
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
  if (JSON.stringify(settings) === JSON.stringify(readPrototypeAgentModels())) return;
  savedSettings = structuredClone(settings);
  configurationRevision += 1;
  for (const listener of listeners) listener();
}
export function createPrototypeAgentModelSamples(): AIReqAgentModelSettings {
  return structuredClone({
    ...sampleSettings,
    agents: sampleSettings.agents.filter((agent) => !historicalStageRoles.has(agent.id)),
  });
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
/** 角色会话创建时复制的演示配置，不调用或验证真实模型。 */
export function readPrototypeAgentModelBinding(role: AIReqAgentRole): AIReqAgentModelBinding {
  const agent = savedSettings.agents.find((item) => item.id === role);
  if (!agent) throw businessRule("此 AIReq Agent 未配置。");
  const inherited = agent.model === "inherit";
  const modelKey = inherited ? savedSettings.defaultModel : agent.model;
  const model = PROTOTYPE_AGENT_MODELS.find((item) => item.id === modelKey);
  if (!model) throw businessRule("请选择当前可用的模型。");
  return {
    role,
    roleName: agent.name,
    modelKey,
    modelName: model.name,
    providerId: model.providerId,
    modelId: model.name,
    reasoning: agent.reasoning,
    inherited,
    configurationRevision,
  };
}
export function prototypeAgentModelBindingChanged(binding: AIReqAgentModelBinding): boolean {
  const latest = readPrototypeAgentModelBinding(binding.role);
  return (
    latest.modelKey !== binding.modelKey ||
    latest.reasoning !== binding.reasoning ||
    latest.inherited !== binding.inherited
  );
}

export function prototypeAgentModelSelection(binding: AIReqAgentModelBinding): ModelSelection {
  return {
    providerId: binding.providerId,
    modelId: binding.modelId,
    ...(binding.reasoning !== "default" ? { options: { reasoningLevel: binding.reasoning } } : {}),
  };
}
