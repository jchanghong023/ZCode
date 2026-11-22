import { ProxyChannel } from "@zcode/rpc";
import {
  IZCodeAgentService,
  WEB_AIREQ_AGENT_EVENTS,
  WEB_CHAT_AGENT_METHODS,
  type WebChatAgent,
} from "@zcode/services/zcode-agent";
import { IModelSelectionService, type ModelSelectionView } from "@zcode/services/model-selection";
import { connectWebSocketChannel, type WebSocketConnectionOptions } from "./channelWebSocket.js";

export type {
  RecentChatDirectory,
  RecentChatSession,
  WebChatAgent,
  ZCodeAgentSessionTarget,
} from "@zcode/services/zcode-agent";
export type { ModelSelectionView } from "@zcode/services/model-selection";

const agentMembers = new Set([...WEB_CHAT_AGENT_METHODS, ...WEB_AIREQ_AGENT_EVENTS]);

export async function connectWebChatAgent(
  url: string,
  options?: WebSocketConnectionOptions,
): Promise<{ agent: WebChatAgent; getModelCatalog: () => Promise<ModelSelectionView> }> {
  const client = await connectWebSocketChannel(url, options);
  const models = ProxyChannel.toService<IModelSelectionService>(
    client.getChannel(IModelSelectionService.channelName),
  );
  return {
    agent: ProxyChannel.toService<WebChatAgent>(client.getChannel(IZCodeAgentService.channelName), {
      members: agentMembers,
    }),
    getModelCatalog: () => models.getView(),
  };
}
