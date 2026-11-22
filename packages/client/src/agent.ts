import { ProxyChannel } from "@zcode/rpc";
import { IZCodeAgentService } from "@zcode/services/zcode-agent";
import { IModelSelectionService, type ModelSelectionView } from "@zcode/services/model-selection";
import { connectWebSocketChannel, type WebSocketConnectionOptions } from "./channelWebSocket.js";

export type {
  RecentChatDirectory,
  RecentChatSession,
  ZCodeAgentSessionTarget,
} from "@zcode/services/zcode-agent";
export type { ModelSelectionView } from "@zcode/services/model-selection";

export type WebChatAgent = Pick<
  IZCodeAgentService,
  | "helloConversationV4"
  | "initializeConversationV4"
  | "listRecentChatSessions"
  | "subscribeConversationV4"
  | "resyncConversationV4"
  | "unsubscribeConversationV4"
  | "conversationRowsRangeV4"
  | "sendConversationCommandV4"
  | "onDynamicConversationFrame"
>;

export async function connectWebChatAgent(
  url: string,
  options?: WebSocketConnectionOptions,
): Promise<{ agent: WebChatAgent; getModelCatalog: () => Promise<ModelSelectionView> }> {
  const client = await connectWebSocketChannel(url, options);
  const models = ProxyChannel.toService<IModelSelectionService>(
    client.getChannel(IModelSelectionService.channelName),
  );
  return {
    agent: ProxyChannel.toService(client.getChannel(IZCodeAgentService.channelName)),
    getModelCatalog: () => models.getView(),
  };
}
