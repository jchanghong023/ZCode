export const AIREQ_AGENT_ROLES = [
  "requirements",
  "requirements-review",
  "solution",
  "requirements-review-a",
  "requirements-review-b",
  "requirements-review-c",
  "solution-review-summary",
] as const;

export type AIReqAgentRole = (typeof AIREQ_AGENT_ROLES)[number];

/** 模型配置及会话绑定的浏览器安全业务DTO。 */
export interface AIReqAgentModel {
  id: AIReqAgentRole;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  model: string;
  reasoning: string;
}

export interface AIReqAgentModelSettings {
  defaultModel: string;
  agents: AIReqAgentModel[];
}

export interface AIReqAgentModelBinding {
  role: AIReqAgentRole;
  roleName: string;
  modelKey: string;
  modelName: string;
  reasoning: string;
  inherited: boolean;
  /** Saved additional instructions at session creation or run admission; empty uses only built-ins. */
  promptSnapshot: string;
}
