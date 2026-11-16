/** 模型配置及会话绑定的浏览器安全业务DTO。 */
export interface AIReqAgentModel {
  id: string;
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

export type AIReqAgentRole =
  | "requirements"
  | "requirements-review-a"
  | "requirements-review-b"
  | "requirements-review-c"
  | "requirements-review"
  | "solution"
  | "planning"
  | "execution"
  | "ir-acceptance"
  | "skill-design"
  | "progress-analysis";

export interface AIReqAgentModelBinding {
  role: AIReqAgentRole;
  roleName: string;
  modelKey: string;
  modelName: string;
  providerId: string;
  modelId: string;
  reasoning: string;
  inherited: boolean;
  configurationRevision: number;
}
