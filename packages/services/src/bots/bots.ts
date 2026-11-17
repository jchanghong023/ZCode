import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type { BotContextState, BotsConfigFile } from "@zcode/shared";
import type { ZCodeAgentAppRuntimePreferences } from "../zcode-agent/zcodeAgent.js";

// 当前会话只读取群上下文与已有配置；旧注册、管理、发送引擎没有产品消费者。
export interface IBotsService {
  /** 仅同步已有 runtime 的交互偏好，不建立新连接。 */
  syncAppRuntimePreferences(preferences: ZCodeAgentAppRuntimePreferences): Promise<void>;
  getConfig(): Promise<BotsConfigFile>;
  getBotStates(): Promise<BotContextState[]>;
}

export const IBotsService = createServiceDescriptor<IBotsService>(ServiceChannels.Bots);
