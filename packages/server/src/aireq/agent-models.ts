import type {
  AIReqAgentModelSettings,
  AIReqAgentRole,
  AIReqAgentModelBinding,
} from "@zcode/services/aireq";
import type { ModelSelection } from "@zcode/shared";

export const PROTOTYPE_AGENT_MODELS = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    providerId: "prototype-anthropic",
    provider: "Anthropic",
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    providerId: "prototype-anthropic",
    provider: "Anthropic",
  },
  { id: "openai/gpt-5.2", name: "GPT-5.2", providerId: "prototype-openai", provider: "OpenAI" },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    providerId: "prototype-deepseek",
    provider: "DeepSeek",
  },
  {
    id: "opencode/beam-free",
    name: "Beam Free",
    providerId: "prototype-opencode-go",
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
      description: "澄清目标、范围与可验收性，只整理 IR 业务原始需求，不提前拆 SR。",
      descriptionEn: "Clarify business goals and organize requirements.",
      model: "openai/gpt-5.2",
      reasoning: "high",
    },
    {
      id: "requirements-review-a",
      name: "需求评审 A",
      nameEn: "Requirements Reviewer A",
      description: "前置单 Agent 检查业务目标、范围、歧义与可验收性；完整审查时独立检查需求覆盖与一致性。",
      descriptionEn: "Review original business goals and acceptance; review coverage and consistency in the full package.",
      model: "anthropic/claude-opus-4.5",
      reasoning: "high",
    },
    {
      id: "requirements-review-b",
      name: "需求评审 B",
      nameEn: "Requirements Reviewer B",
      description: "完整审查时使用不同模型独立检查技术方案与跨 SR 依赖。",
      descriptionEn: "Independently review full-package technical design and cross-SR dependencies.",
      model: "openai/gpt-5.2",
      reasoning: "high",
    },
    {
      id: "requirements-review-c",
      name: "需求评审 C",
      nameEn: "Requirements Reviewer C",
      description: "完整审查时检查开发任务可执行性、测试充分性及业务验收追溯。",
      descriptionEn: "Review task executability, testing sufficiency and business-acceptance traceability.",
      model: "deepseek/deepseek-v3.2",
      reasoning: "high",
    },
    {
      id: "requirements-review",
      name: "综合评审 Agent",
      nameEn: "Review Synthesis Agent",
      description: "等待 A／B／C 报告完成后综合去重，保留来源与分歧；不替人决定通过。",
      descriptionEn:
        "Synthesize completed A/B/C reports, retaining sources and disagreements. Humans decide approval.",
      model: "anthropic/claude-sonnet-4.5",
      reasoning: "high",
    },
    {
      id: "solution",
      name: "方案 Agent",
      nameEn: "Solution Agent",
      description:
        "业务通过后拆分稳定 SR，完善每 SR 独立 proposal、specs、design、tasks、test-plan 以及 IR 依赖和整体验收；只生成文档，不执行开发或测试。",
      descriptionEn:
        "Split stable SRs after business approval and refine independent OpenSpec changes including tasks and test plans. Generate documents only; never execute development or tests.",
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
      description:
        "依据 SR tasks、代码与合入证据估计 0–99 并给审查意见；不执行 tasks。代码合入后业务进度固定 99，人工测试通过才 100，不要求 AI 恰好评分 99；失败保留上次成功报告。",
      descriptionEn:
        "Estimate 0–99 from SR tasks, code and merge evidence without executing tasks. Merged code is effectively 99; explicit human test acceptance alone reaches 100. Failed runs retain the last successful report.",
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
    throw Object.assign(new Error("模型配置已变化，请重新读取。"), { code: "VERSION_CONFLICT" });
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
    throw new Error("模型或角色配置无效。");
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
  if (!agent) throw new Error("此 AIReq Agent 未配置。");
  const inherited = agent.model === "inherit";
  const modelKey = inherited ? savedSettings.defaultModel : agent.model;
  const model = PROTOTYPE_AGENT_MODELS.find((item) => item.id === modelKey);
  if (!model) throw new Error("请选择原型支持的演示模型。");
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
