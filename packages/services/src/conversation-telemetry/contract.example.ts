import type { Event } from "@zcode/rpc";
import type { ConversationTelemetryFact } from "@zcode/shared/zcode-protocol-v4";
import type { IConversationTelemetryService } from "./contract.js";

/**
 * 手机远控执行遥测的真实调用：Host 为一个 workspace 订阅 CLI live facts，把事件交给 Main 现有的
 * TelemetryCore；pane 关闭或 attachment 换代时只释放本地订阅，不停止目标任务。
 */
export function exampleConversationTelemetryFacts(
  service: IConversationTelemetryService,
  target: Parameters<IConversationTelemetryService["onFact"]>[0],
): Event<ConversationTelemetryFact> {
  return service.onFact(target);
}
